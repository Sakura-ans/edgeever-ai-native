import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Graph} from '@antv/x6';
import type {DiagramDocument} from '@edgeever/shared';
import './personal.css';

type MindMap = {id:string;title:string;revision:number;document:DiagramDocument;undo:DiagramDocument[];redo:DiagramDocument[]};
type Workspace = {version:1;revision:number;maps:MindMap[]};
type Proposal = {id:string;mapId:string;revision:number;summary:string;document:DiagramDocument};
type AgentEvent = {type:'text';text:string} | {type:'proposal';proposal:Proposal};
interface MindBridge {
  load():Promise<Workspace>; command(input:Record<string,unknown>):Promise<Workspace>; approve(id:string):Promise<Workspace>; reject(id:string):Promise<boolean>;
  exportBackup():Promise<boolean>; importBackup():Promise<Workspace>;
  config():Promise<{model:string;hasKey:boolean}>; saveConfig(input:{model:string;apiKey:string}):Promise<boolean>;clearConfig():Promise<boolean>;
  ask(input:{id:string;revision:number;prompt:string}):Promise<boolean>;cancel():Promise<boolean>;onAgentEvent(fn:(event:AgentEvent)=>void):()=>void;
}
declare global { interface Window {edgeeverMind?:MindBridge} }
const bridge = window.edgeeverMind;

function Canvas({document,selected,onSelect,onMove,preview=false}:{document:DiagramDocument;selected:string;onSelect:(id:string)=>void;onMove:(id:string,x:number,y:number)=>void;preview?:boolean}) {
  const host = useRef<HTMLDivElement>(null);
  const graph = useRef<Graph|null>(null);
  const callbacks = useRef({onSelect,onMove}); callbacks.current = {onSelect,onMove};
  useEffect(() => {
    const g = new Graph({container:host.current!,autoResize:true,background:{color:'#fafafa'},grid:true,panning:true,mousewheel:{enabled:true,modifiers:['ctrl','meta']},interacting:{nodeMovable:!preview,edgeMovable:false,arrowheadMovable:false}});
    graph.current = g;
    g.on('node:click',({node}) => callbacks.current.onSelect(node.id));
    g.on('node:moved',({node}) => { const p = node.position(); callbacks.current.onMove(node.id,p.x,p.y); });
    return () => {g.dispose();graph.current=null;};
  },[preview]);
  useEffect(() => {
    const g = graph.current; if (!g) return;
    g.clearCells();
    for (const n of document.nodes) g.addNode({id:n.id,x:n.x,y:n.y,width:n.width,height:n.height,label:n.label,attrs:{body:{fill:n.id === selected ? '#e6eee9':'#fff',stroke:n.id === selected ? '#07130b':'#b7c3ba',rx:8,ry:8},label:{fill:'#17241b',fontSize:14,textWrap:{width:-16,height:-8,ellipsis:true}}}});
    for (const e of document.edges) g.addEdge({id:e.id,source:e.source,target:e.target,attrs:{line:{stroke:'#7c9182',targetMarker:null}},connector:{name:'rounded'}});
  },[document,selected]);
  return <div className="canvas" ref={host}/>;
}
function App() {
  const [workspace,setWorkspace] = useState<Workspace>({version:1,revision:0,maps:[]});
  const [active,setActive] = useState(''), [selected,setSelected] = useState('');
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [status,setStatus] = useState('加载本地工作区…');
  const [label,setLabel] = useState(''), [mapTitle,setMapTitle] = useState('');
  const [settings,setSettings] = useState(false), [model,setModel] = useState(''), [key,setKey] = useState(''), [hasKey,setHasKey] = useState(false);
  const [prompt,setPrompt] = useState(''), [answer,setAnswer] = useState(''), [running,setRunning] = useState(false), [proposals,setProposals] = useState<Proposal[]>([]);
  const pending = useRef(Promise.resolve());
  const latest = useRef(workspace); latest.current = workspace;
  const map = workspace.maps.find(m => m.id === active) ?? workspace.maps[0];
  const node = map?.document.nodes.find(n => n.id === selected) ?? map?.document.nodes[0];
  useEffect(() => {
    if (!bridge) {setError('请从 EdgeEver Mind 桌面应用打开此工作台。');return;}
    void bridge.load().then(state => {setWorkspace(state);setStatus('已保存到本机');}).catch(e => setError(String(e)));
    return bridge.onAgentEvent(event => {
      if (event.type === 'text') setAnswer(text => text + event.text);
      else setProposals(items => [...items,event.proposal]);
    });
  },[]);
  useEffect(() => {if (document.activeElement?.getAttribute('aria-label') !== '主题内容') setLabel(node?.label ?? '');},[node?.id,node?.label]);
  useEffect(() => {setMapTitle(map?.title ?? '');},[map?.id]);
  async function perform(action:()=>Promise<unknown>) {
    const operation = pending.current.then(async () => {
    setBusy(true);setError('');setStatus('正在保存…');
    try {
      const result = await action();
      if (result && typeof result === 'object' && 'maps' in result) { latest.current = result as Workspace; setWorkspace(result as Workspace); }
      setStatus('已保存到本机');
    } catch (e) {setError(e instanceof Error ? e.message : String(e));setStatus('未保存，请重试');}
    finally {setBusy(false);}
    });
    pending.current = operation;
    return operation;
  }
  const command = (type:string,extra:Record<string,unknown>={}) => perform(async () => { const result = await bridge!.command({type,id:map?.id,revision:latest.current.maps.find(m => m.id === map?.id)?.revision,...extra}); if(type === 'undo' || type === 'redo') setLabel(result.maps.find(m => m.id === map?.id)?.document.nodes.find(n => n.id === node?.id)?.label ?? ''); return result; });
  const save = (document:DiagramDocument) => command('save',{document});
  function updateLabel(value:string) {
    setLabel(value);
    if (!map || !node) return;
    const mapId=map.id, nodeId=node.id;
    void perform(() => {
      const current=latest.current.maps.find(m => m.id === mapId)!;
      return bridge!.command({type:'save',id:mapId,revision:current.revision,document:{...current.document,nodes:current.document.nodes.map(n => n.id === nodeId ? {...n,label:value}:n)}});
    });
  }
  function addChild() {
    if (!map || !node) return;
    const id = crypto.randomUUID();
    void save({...map.document,nodes:[...map.document.nodes,{id,label:'新主题',parentId:node.id,shape:'topic',x:node.x+220,y:node.y+map.document.nodes.filter(n => n.parentId === node.id).length*72,width:150,height:44}],edges:[...map.document.edges,{id:crypto.randomUUID(),source:node.id,target:id}]}).then(() => setSelected(id));
  }
  function removeNode() {
    if (!map || !node?.parentId) return;
    const removed = new Set([node.id]);
    let size;
    do {size=removed.size; for (const n of map.document.nodes) if (n.parentId && removed.has(n.parentId)) removed.add(n.id);} while(size !== removed.size);
    if (!window.confirm(`删除此主题及其 ${removed.size-1} 个子主题？可以撤销。`)) return;
    void save({...map.document,nodes:map.document.nodes.filter(n => !removed.has(n.id)),edges:map.document.edges.filter(e => !removed.has(e.target))});
  }
  async function ask() {
    if (!map || !prompt.trim() || running) return;
    setRunning(true);setAnswer('');setError('');
    try {await bridge!.ask({id:map.id,revision:map.revision,prompt});}
    catch(e) {setError(String(e));} finally {setRunning(false);}
  }
  const proposal = proposals[0];
  const outline = (parent:string|undefined,depth=0):React.ReactNode => map?.document.nodes.filter(n => n.parentId === parent).map(n => <React.Fragment key={n.id}><button className={`outline ${node?.id === n.id ? 'selected':''}`} style={{paddingLeft:12+depth*16}} onClick={() => setSelected(n.id)}>{n.label || '空主题'}</button>{outline(n.id,depth+1)}</React.Fragment>);
  return <div className="app">
    <header><strong>EdgeEver <span>Mind</span></strong><small>个人思维导图 · 本地优先</small><span className="spacer"/><span role="status">{status}</span><button onClick={() => {setSettings(!settings);void bridge?.config().then(c => {setModel(c.model);setHasKey(c.hasKey);}).catch(e => setError(String(e)));}}>DeepSeek 设置</button></header>
    {error && <div className="error" role="alert">{error}<button onClick={() => void perform(() => bridge!.load())}>重新读取</button></div>}
    <div className="workspace">
      <aside className="library"><h2>我的导图</h2><button disabled={busy || !bridge} onClick={() => {const title=window.prompt('导图名称','未命名导图');if(title) void perform(async () => {const next=await bridge!.command({type:'create',title});setActive(next.maps.at(-1)!.id);return next;});}}>＋ 新建导图</button>
        <nav>{workspace.maps.map(m => <button key={m.id} className={m.id === map?.id ? 'selected':''} onClick={() => {setActive(m.id);setSelected('');}}>{m.title}</button>)}</nav>
        <div className="backup"><button disabled={busy || !bridge} onClick={() => void perform(() => bridge!.exportBackup())}>导出完整备份</button><button disabled={busy || !bridge} onClick={() => void perform(() => bridge!.importBackup())}>导入备份为副本</button><small>包含全部导图与撤销历史。<br/>保存在本机，无自动同步。</small></div>
      </aside>
      <main>{map ? <>
        <div className="toolbar"><input aria-label="导图名称" value={mapTitle} onChange={e => {setMapTitle(e.target.value);if(e.target.value.trim()) void command('rename',{title:e.target.value});}} onKeyDown={e => {if(e.key === 'Enter') e.currentTarget.blur();}}/><button disabled={busy || !map.undo.length} onClick={() => void command('undo')}>撤销</button><button disabled={busy || !map.redo.length} onClick={() => void command('redo')}>重做</button><button disabled={busy} onClick={() => {if(window.confirm('删除整个导图？删除前请导出备份。')) void command('delete');}}>删除导图</button></div>
        <div className="editor"><section className="outline-panel"><h2>大纲</h2>{outline(undefined)}</section><Canvas document={map.document} selected={node?.id ?? ''} onSelect={setSelected} onMove={(id,x,y) => {if(!busy) void save({...map.document,nodes:map.document.nodes.map(n => n.id === id ? {...n,x,y}:n)});}}/></div>
        <div className="toolbar"><input aria-label="主题内容" maxLength={2000} value={label} onChange={e => updateLabel(e.target.value)} onKeyDown={e => {if(e.key === 'Enter') e.currentTarget.blur();}}/><button disabled={busy} onClick={addChild}>添加子主题</button><button disabled={busy || !node?.parentId} onClick={removeNode}>删除主题</button><small>输入自动保存 · 拖动画布平移 · Ctrl + 滚轮缩放</small></div>
      </> : <div className="empty"><h1>把想法放到一张图上</h1><p>点击“新建导图”开始。无需账号，无需联网。</p></div>}</main>
      <aside className="assistant"><h2>AI 助手</h2><p>仅点击发送后，将当前导图发送给 DeepSeek。所有修改先预览确认。</p><textarea aria-label="AI 请求" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="例如：把这个想法整理成三个阶段…"/><button disabled={!map || running || busy || !prompt.trim()} onClick={() => void ask()}>发送给 DeepSeek</button>{running && <button onClick={() => void bridge?.cancel()}>停止</button>}<pre aria-live="polite">{answer}</pre></aside>
    </div>
    {settings && <div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-label="DeepSeek 设置"><h2>DeepSeek 设置</h2><p>凭据使用操作系统安全存储加密。模型标识由您填写。</p><label>模型标识<input value={model} onChange={e => setModel(e.target.value)}/></label><label>API Key {hasKey && '（已保存；留空保留）'}<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)}/></label><small>端点：https://api.deepseek.com/anthropic</small><div className="actions"><button onClick={() => {setSettings(false);setKey('');}}>关闭</button><button disabled={busy} onClick={() => void perform(async () => {await bridge!.clearConfig();setHasKey(false);setKey('');})}>删除凭据</button><button disabled={busy} onClick={() => void perform(async () => {await bridge!.saveConfig({model,apiKey:key});setKey('');setHasKey(true);setSettings(false);})}>保存设置</button></div></section></div>}
    {proposal && <div className="overlay"><section className="dialog proposal" role="dialog" aria-modal="true" aria-label="AI 修改预览"><h2>确认 AI 修改</h2><p>{proposal.summary}</p><p>目标：{workspace.maps.find(m => m.id === proposal.mapId)?.title ?? '已删除导图'} · 基于版本 {proposal.revision}</p><div className="comparison"><section><h3>当前版本</h3><pre>{JSON.stringify(workspace.maps.find(m => m.id === proposal.mapId)?.document,null,2)}</pre></section><section><h3>提案（完整结构与内容）</h3><pre>{JSON.stringify(proposal.document,null,2)}</pre></section></div><div className="actions"><button onClick={() => void bridge!.reject(proposal.id).then(() => setProposals(p => p.slice(1)))}>拒绝，不修改</button><button disabled={busy} onClick={() => void perform(async () => {try {return await bridge!.approve(proposal.id);} finally {setProposals(p => p.slice(1));}})}>确认应用 · 可撤销</button></div></section></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
