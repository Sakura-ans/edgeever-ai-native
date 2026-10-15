import { randomUUID } from 'node:crypto';
import { mkdir, readFile, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

export function validateDocument(value) {
  if (!value || value.schemaVersion !== 1 || value.kind !== 'mind-map' || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || value.nodes.length < 1 || value.nodes.length > 2000 || value.edges.length !== value.nodes.length - 1) throw new Error('Invalid mind map');
  const ids = new Set();
  for (const n of value.nodes) {
    if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 128 || ids.has(n.id) || typeof n.label !== 'string' || n.label.length > 2000 || n.shape !== 'topic' || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(n[k])) || n.width <= 0 || n.height <= 0) throw new Error('Invalid node');
    ids.add(n.id);
  }
  const roots = value.nodes.filter(n => n.parentId === undefined);
  if (roots.length !== 1) throw new Error('A mind map needs one root');
  const nodes = new Map(value.nodes.map(n => [n.id, n]));
  for (const n of value.nodes) {
    const visited = new Set([n.id]);
    let p = n.parentId;
    while (p !== undefined) {
      if (!nodes.has(p) || visited.has(p) || visited.size > 100) throw new Error('Invalid parent or cycle');
      visited.add(p); p = nodes.get(p).parentId;
    }
  }
  const edgeIds = new Set(), targets = new Set();
  for (const e of value.edges) {
    if (!e || typeof e.id !== 'string' || !e.id || ids.has(e.id) || edgeIds.has(e.id) || targets.has(e.target) || !ids.has(e.source) || nodes.get(e.target)?.parentId !== e.source) throw new Error('Invalid edge');
    edgeIds.add(e.id); targets.add(e.target);
  }
  // Only persist the IR fields; reject oversized envelopes before parsing at IPC/import boundaries.
  return { schemaVersion: 1, kind: 'mind-map', nodes: value.nodes.map(({id,label,x,y,width,height,shape,parentId}) => ({id,label,x,y,width,height,shape,...(parentId === undefined ? {} : {parentId})})), edges: value.edges.map(({id,source,target}) => ({id,source,target})) };
}
const title = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('Invalid title');
  return value.trim();
};
const clone = value => structuredClone(value);
const blank = () => ({ schemaVersion: 1, kind: 'mind-map', nodes: [{id: randomUUID(), label: '中心主题', x:80, y:180, width:150, height:44, shape:'topic'}], edges:[] });

export class PersonalStore {
  constructor(directory) { this.directory = directory; this.state = {version:1, revision:0, maps:[]}; this.proposals = new Map(); this.queue = Promise.resolve(); }
  async init() {
    await mkdir(this.directory, {recursive:true, mode:0o700});
    try {
      const raw = await readFile(join(this.directory, 'workspace.json'), 'utf8');
      this.state = this.validateBackup(JSON.parse(raw));
    } catch (error) { if (error.code !== 'ENOENT') throw new Error('Workspace could not be read. Restore a backup; existing data was not overwritten.', {cause:error}); }
    return this.snapshot();
  }
  validateBackup(data) {
    if (data?.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.maps) || data.maps.length > 500) throw new Error('Invalid backup');
    const ids = new Set();
    return {version:1, revision:data.revision, maps:data.maps.map(m => {
      if (!m || typeof m.id !== 'string' || !m.id || ids.has(m.id) || !Number.isSafeInteger(m.revision) || m.revision < 0) throw new Error('Invalid map');
      ids.add(m.id);
      return {id:m.id,title:title(m.title),revision:m.revision,document:validateDocument(m.document),undo:(m.undo ?? []).slice(-50).map(validateDocument),redo:(m.redo ?? []).slice(-50).map(validateDocument)};
    })};
  }
  snapshot() { return clone(this.state); }
  async persist(state, filename = 'workspace.json') {
    const serialized = JSON.stringify(state);
    if (serialized.length > 8_000_000) throw new Error('Workspace exceeds the 8 MB backup limit');
    const temp = join(this.directory, `${filename}.${randomUUID()}.tmp`);
    try {
      const file = await open(temp, 'wx', 0o600);
      try { await file.writeFile(serialized); await file.sync(); } finally { await file.close(); }
      await rename(temp, join(this.directory, filename));
    } finally { await rm(temp, {force:true}).catch(() => {}); }
  }
  mutate(fn) {
    const operation = this.queue.then(async () => {
      const next = this.snapshot();
      await fn(next);
      next.revision++;
      await this.persist(this.state, 'workspace.previous.json');
      await this.persist(next);
      this.state = next;
      return this.snapshot();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  map(state, id, revision) {
    const m = state.maps.find(m => m.id === id);
    if (!m || m.revision !== revision) throw new Error('Revision conflict: reload the map and request a new proposal');
    return m;
  }
  async command(input) {
    if (!input || JSON.stringify(input).length > 8_000_000) throw new Error('Invalid command');
    return this.mutate(state => {
      if (input.type === 'create') { if (state.maps.length >= 500) throw new Error('Too many maps'); state.maps.push({id:randomUUID(),title:title(input.title),revision:0,document:blank(),undo:[],redo:[]}); return; }
      if (input.type === 'import') {
        const imported = this.validateBackup(input.backup);
        if (imported.maps.length + state.maps.length > 500) throw new Error('Too many maps');
        // Import as copies; never replace an existing map or revision.
        state.maps.push(...imported.maps.map(m => ({...m,id:randomUUID(),revision:0})));
        return;
      }
      const m = this.map(state, input.id, input.revision);
      if (input.type === 'delete') { state.maps = state.maps.filter(item => item.id !== m.id); return; }
      if (input.type === 'rename') m.title = title(input.title);
      else if (input.type === 'save') { m.undo.push(clone(m.document)); m.undo = m.undo.slice(-50); m.redo = []; m.document = validateDocument(input.document); }
      else if (input.type === 'undo' || input.type === 'redo') {
        const from = input.type === 'undo' ? m.undo : m.redo, to = input.type === 'undo' ? m.redo : m.undo;
        if (!from.length) throw new Error('No history');
        to.push(m.document); m.document = from.pop();
      } else throw new Error('Unknown command');
      m.revision++;
    });
  }
  propose(id, revision, document, summary) {
    const current = this.map(this.state,id,revision);
    if (this.proposals.size >= 20) throw new Error('Too many pending proposals');
    const proposal = {id:randomUUID(),mapId:id,revision,document:validateDocument(document),summary:String(summary).slice(0,2000)};
    if (JSON.stringify(proposal.document) === JSON.stringify(current.document)) throw new Error('没有实际变更，无需提交提案');
    this.proposals.set(proposal.id,clone(proposal));
    return clone(proposal);
  }
  reject(id) { this.proposals.delete(id); }
  async approve(id) {
    const p = this.proposals.get(id);
    if (!p) throw new Error('Proposal expired');
    // Consume before awaiting: concurrent approvals cannot apply twice.
    this.proposals.delete(id);
    return this.command({type:'save',id:p.mapId,revision:p.revision,document:p.document});
  }
}
