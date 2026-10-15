import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DIAGRAM_SELECTABLE_THEMES,DIAGRAM_SELECTABLE_STRUCTURES,resolveDiagramTheme,type DiagramTheme} from '@edgeever/shared';
import {Canvas} from './Canvas';
import {StructureThumb} from '../components/DiagramThumbnails';
import {restructure,themeNames,structureNames,thumbnailDocument} from './styles';
import type {DiagramDocument} from '@edgeever/shared';
import './personal.css';
import {describeProposal,outlinePaths} from './proposal-diff';

type MindMap = {id:string;title:string;revision:number;document:DiagramDocument;undo:DiagramDocument[];redo:DiagramDocument[]};
type Workspace = {version:1;revision:number;maps:MindMap[]};
type Proposal = {id:string;mapId:string;revision:number;summary:string;document:DiagramDocument};
type AgentEvent = {type:'text';text:string} | {type:'proposal';proposal:Proposal};
interface MindBridge {
  readyToClose?():Promise<boolean>;onBeforeClose?(fn:()=>void):()=>void;
  load():Promise<Workspace>; command(input:Record<string,unknown>):Promise<Workspace>; approve(id:string):Promise<Workspace>; reject(id:string):Promise<boolean>;
  exportBackup():Promise<boolean>; importBackup():Promise<Workspace>;
  config():Promise<{model:string;hasKey:boolean}>; saveConfig(input:{model:string;apiKey:string}):Promise<boolean>;clearConfig():Promise<boolean>;
  ask(input:{id:string;revision:number;prompt:string}):Promise<boolean>;cancel():Promise<boolean>;onAgentEvent(fn:(event:AgentEvent)=>void):()=>void;
}
declare global { interface Window {edgeeverMind?:MindBridge} }
const bridge = window.edgeeverMind;

function App() {
  const [shell,setShell]=useState(()=>localStorage.getItem('mind-shell')==='studio'?'studio':'paper');
  const [libraryOpen,setLibraryOpen]=useState(()=>localStorage.getItem('mind-library')!=='closed');
  const [outlineOpen,setOutlineOpen]=useState(()=>localStorage.getItem('mind-outline')!=='closed');
  const [panel,setPanel]=useState<'ai'|'themes'|'properties'|null>(()=>window.innerWidth<=850?null:'ai');
  useEffect(()=>{
    const adapt=()=>{if(window.innerWidth<=850){setPanel(null);setPreviewTheme(null);}};
    window.addEventListener('resize',adapt);return()=>window.removeEventListener('resize',adapt);
  },[]);
  const [previewTheme,setPreviewTheme]=useState<DiagramTheme|null>(null);
  useEffect(()=>{localStorage.setItem('mind-shell',shell);document.documentElement.dataset.shell=shell;},[shell]);
  useEffect(()=>{localStorage.setItem('mind-library',libraryOpen?'open':'closed');},[libraryOpen]);
  useEffect(()=>{localStorage.setItem('mind-outline',outlineOpen?'open':'closed');},[outlineOpen]);

  const [workspace,setWorkspace] = useState<Workspace>({version:1,revision:0,maps:[]});
  const [active,setActive] = useState(''), [selected,setSelected] = useState('');
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [status,setStatus] = useState('加载本地工作区…');
  const [newTitle,setNewTitle] = useState<string|null>(null);
  const [label,setLabel] = useState(''), [mapTitle,setMapTitle] = useState('');
  const [settings,setSettings] = useState(false), [model,setModel] = useState('deepseek-flash'), [key,setKey] = useState(''), [hasKey,setHasKey] = useState(false);
  const [prompt,setPrompt] = useState(''), [answer,setAnswer] = useState(''), [running,setRunning] = useState(false), [proposals,setProposals] = useState<Proposal[]>([]);
  const pending = useRef(Promise.resolve());
  const latest = useRef(workspace); latest.current = workspace;
  const map = workspace.maps.find(m => m.id === active) ?? workspace.maps[0];
  useEffect(()=>{setPreviewTheme(null);},[map?.id,map?.revision,panel]);
  const node = map?.document.nodes.find(n => n.id === selected) ?? map?.document.nodes[0];
  useEffect(() => {
    if (!bridge) {setError('请从 EdgeEver Mind 桌面应用打开此工作台。');return;}
    void bridge.load().then(state => {setWorkspace(state);setStatus('已保存到本机');}).catch(e => setError(String(e)));
    const offClose = bridge.onBeforeClose?.(() => {void pending.current.then(() => bridge.readyToClose?.());});
    const offAgent = bridge.onAgentEvent(event => {
      if (event.type === 'text') setAnswer(text => text + event.text);
      else setProposals(items => [...items,event.proposal]);
    });
    return () => {offClose?.();offAgent();};
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
  const proposalMap = proposal && workspace.maps.find(m => m.id === proposal.mapId);
  const stale = !!proposal && (!proposalMap || proposalMap.revision !== proposal.revision);
  const changes = proposal && proposalMap && !stale ? describeProposal(proposalMap.document,proposal.document) : [];
  useEffect(()=>{
    if(!proposal&&!settings&&newTitle===null)return;
    const dialog=document.querySelector<HTMLElement>('[role="dialog"]');if(!dialog)return;
    const previous=document.activeElement as HTMLElement|null;
    const focusable=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,summary,[tabindex="0"]'));
    focusable()[0]?.focus();
    const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab')return;const items=focusable(),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
    dialog.addEventListener('keydown',trap);return()=>{dialog.removeEventListener('keydown',trap);previous?.focus();};
  },[proposal?.id,settings,newTitle===null]);
  const outline = (parent:string|undefined,depth=0):React.ReactNode => map?.document.nodes.filter(n => n.parentId === parent).map(n => <React.Fragment key={n.id}><button className={`outline ${node?.id === n.id ? 'selected':''}`} style={{paddingLeft:12+depth*16}} onClick={() => setSelected(n.id)}>{n.label || '空主题'}</button>{outline(n.id,depth+1)}</React.Fragment>);
  useEffect(()=>{
    const handle=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement;
      if(target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')||settings||newTitle!==null||proposal)return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&map&&!busy){event.preventDefault();const type=event.shiftKey?'redo':'undo';if(map[type].length)void command(type);}
      if(event.key==='Escape'){setPreviewTheme(null);setPanel(null);}
    };
    window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);
  });
  return <div className="app">
    <header><strong>EdgeEver <span>Mind</span></strong><small>个人思维导图 · 本地优先</small><span className="spacer"/><button className="shell-toggle" aria-label="切换外壳" onClick={()=>setShell(shell==='paper'?'studio':'paper')}>{shell==='paper'?'☾ 深色工作室':'☀ 温暖纸感'}</button><span className="save-indicator" aria-hidden="true">{status.startsWith('未保存')?'!':status.includes('正在')?'…':'✓'}</span><span role="status">{status}</span><button onClick={() => {setSettings(!settings);void bridge?.config().then(c => {setModel(c.model);setHasKey(c.hasKey);}).catch(e => setError(String(e)));}}>DeepSeek 设置</button></header>
    {error && <div className="error" role="alert">{error}<button onClick={() => void perform(() => bridge!.load())}>重新读取</button></div>}
    <div className="workspace-controls"><button aria-expanded={libraryOpen} onClick={()=>setLibraryOpen(!libraryOpen)}>☷ 导图库</button><button aria-expanded={outlineOpen} onClick={()=>setOutlineOpen(!outlineOpen)}>☰ 大纲</button><span className="spacer"/><small>离线工作区 · 自由整理每一个想法</small>{(['properties','themes','ai'] as const).map(value=><button key={value} aria-pressed={panel===value} onClick={()=>{setPanel(panel===value?null:value);setPreviewTheme(null);}}>{value==='properties'?'◫ 属性':value==='themes'?'◈ 主题':'✧ AI 助手'}</button>)}</div>
    <div className="workspace">
      {libraryOpen && <aside className="library"><h2>我的导图</h2><button disabled={busy || !bridge} onClick={() => setNewTitle('未命名导图')}>＋ 新建导图</button>
        <nav>{workspace.maps.map(m => <button key={m.id} className={m.id === map?.id ? 'selected':''} onClick={() => {setActive(m.id);setSelected('');}}>{m.title}</button>)}</nav>
        <div className="backup"><button disabled={busy || !bridge} onClick={() => void perform(() => bridge!.exportBackup())}>导出完整备份</button><button disabled={busy || !bridge} onClick={() => void perform(() => bridge!.importBackup())}>导入备份为副本</button><small>包含全部导图与撤销历史。<br/>保存在本机，无自动同步。</small></div>
      </aside>}
      <main>{map ? <>
        <div className="toolbar"><input aria-label="导图名称" value={mapTitle} onChange={e => {setMapTitle(e.target.value);if(e.target.value.trim()) void command('rename',{title:e.target.value});}} onKeyDown={e => {if(e.key === 'Enter') e.currentTarget.blur();}}/><button disabled={busy || !map.undo.length} onClick={() => void command('undo')}>撤销</button><button disabled={busy || !map.redo.length} onClick={() => void command('redo')}>重做</button><button disabled={busy} onClick={() => {if(window.confirm('删除整个导图？删除前请导出备份。')) void command('delete');}}>删除导图</button></div>
        <div className="editor">{outlineOpen && <section className="outline-panel"><h2>大纲</h2>{outline(undefined)}</section>}<Canvas shell={shell} document={previewTheme?{...map.document,theme:previewTheme}:map.document} selected={node?.id ?? ''} onSelect={setSelected} onMove={(id,x,y) => {if(!busy) void save({...map.document,nodes:map.document.nodes.map(n => n.id === id ? {...n,x,y}:n)});}}/></div>
        <div className="toolbar"><input aria-label="主题内容" maxLength={2000} value={label} onChange={e => updateLabel(e.target.value)} onKeyDown={e => {if(e.key === 'Enter') e.currentTarget.blur();}}/><button disabled={busy} onClick={addChild}>添加子主题</button><button disabled={busy || !node?.parentId} onClick={removeNode}>删除主题</button><small>输入自动保存 · 拖动画布平移 · Ctrl + 滚轮缩放</small></div>
      </> : <div className="empty"><h1>把想法放到一张图上</h1><p>点击“新建导图”开始。无需账号，无需联网。</p></div>}</main>
      {panel && <aside className="assistant"><div className="panel-heading"><small>工作台 / {panel==='themes'?'风格库':panel==='properties'?'属性':'智能协作'}</small><button aria-label="收起右侧面板" onClick={()=>{setPanel(null);setPreviewTheme(null);}}>收起 ›</button></div>
      <section hidden={panel!=='ai'}><h2>AI 助手</h2><p>仅点击发送后，将当前导图发送给 DeepSeek。所有修改先预览确认。</p><textarea aria-label="AI 请求" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="例如：把这个想法整理成三个阶段…"/><button disabled={!map || running || busy || !prompt.trim()} onClick={() => void ask()}>发送给 DeepSeek</button>{running && <button onClick={() => void bridge?.cancel()}>停止</button>}<pre aria-live="polite">{answer}</pre></section>
      {panel==='properties' && <section><h2>主题属性</h2><p className="property-name">{node?.label??'尚未选择主题'}</p><dl><dt>层次</dt><dd>{!node?.parentId?'中心主题':map?.document.nodes.find(n=>n.id===node.parentId)?.parentId?'叶 / 分支主题':'主分支'}</dd><dt>配色</dt><dd>{themeNames[resolveDiagramTheme(map?.document.theme)]}</dd><dt>结构</dt><dd>{structureNames[map?.document.structure??'map']??map?.document.structure}</dd><dt>位置</dt><dd>{Math.round(node?.x??0)}, {Math.round(node?.y??0)}</dd></dl><p>在下方编辑完整文字；通过大纲选择主题。Ctrl / ⌘ + Z 撤销，Shift + Ctrl / ⌘ + Z 重做。</p></section>}
      {panel==='themes' && <section><h2>让想法拥有自己的风格</h2><p>先预览，再应用。配色不会移动主题。</p>{previewTheme && <div className="preview-actions" role="region" aria-label="主题预览"><strong>预览 · {themeNames[previewTheme]}</strong><button onClick={()=>setPreviewTheme(null)}>取消预览</button><button disabled={busy||!map} onClick={()=>{if(map)void save({...map.document,theme:previewTheme});setPreviewTheme(null);}}>应用配色</button></div>}
        <div className="theme-grid">{DIAGRAM_SELECTABLE_THEMES.map(theme=><button key={theme} data-theme-id={theme} disabled={!map||busy} aria-label={`预览配色：${themeNames[theme]}`} aria-pressed={(previewTheme??resolveDiagramTheme(map?.document.theme))===theme} onClick={()=>setPreviewTheme(theme)}><Canvas preview shell={shell} document={{...thumbnailDocument,theme}}/><span>{themeNames[theme]}</span>{resolveDiagramTheme(map?.document.theme)===theme&&<small> ✓ 已应用</small>}</button>)}</div>
        <h2 className="structure-heading">结构与布局</h2><p>切换将重新排列主题位置，可撤销恢复。</p><div className="structure-grid">{DIAGRAM_SELECTABLE_STRUCTURES.map(structure=><button key={structure} data-structure-id={structure} disabled={!map||busy} aria-pressed={(map?.document.structure??'map')===structure} onClick={()=>{if(map&&window.confirm(`切换为${structureNames[structure]}将重新排列全部主题。可撤销恢复，继续？`)){setPreviewTheme(null);void save(restructure(map.document,structure));}}}><StructureThumb structure={structure}/><span>{structureNames[structure]}</span></button>)}</div>
      </section>}
      </aside>}

    </div>
    {newTitle !== null && <div className="overlay"><form className="dialog" role="dialog" aria-modal="true" aria-label="新建导图" onSubmit={event => {event.preventDefault();void perform(async () => {const next=await bridge!.command({type:'create',title:newTitle});setActive(next.maps.at(-1)!.id);setSelected('');setNewTitle(null);return next;});}}><h2>新建导图</h2><label>新导图名称<input autoFocus maxLength={200} value={newTitle} onChange={event => setNewTitle(event.target.value)}/></label><div className="actions"><button type="button" onClick={() => setNewTitle(null)}>取消</button><button type="submit" disabled={busy || !newTitle.trim()}>创建</button></div></form></div>}
    {settings && <div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-label="DeepSeek 设置"><h2>DeepSeek 设置</h2><p>凭据使用操作系统安全存储加密。默认模型为 deepseek-flash，可按需修改。</p><label>模型标识<input value={model} onChange={e => setModel(e.target.value)}/></label><label>API Key {hasKey && '（已保存；留空保留）'}<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)}/></label><small>端点：https://api.deepseek.com/anthropic</small><div className="actions"><button onClick={() => {setSettings(false);setKey('');}}>关闭</button><button disabled={busy} onClick={() => void perform(async () => {await bridge!.clearConfig();setHasKey(false);setKey('');})}>删除凭据</button><button disabled={busy} onClick={() => void perform(async () => {await bridge!.saveConfig({model,apiKey:key});setKey('');setHasKey(true);setSettings(false);})}>保存设置</button></div></section></div>}
    {proposal && <div className="overlay"><section className="dialog proposal" role="dialog" aria-modal="true" aria-label="AI 修改预览"><h2>确认 AI 修改</h2><p>{proposal.summary}</p><p>目标：{proposalMap?.title ?? '已删除导图'} · 基于版本 {proposal.revision} · 尚未写入</p>
      {stale ? <p className="conflict" role="alert">导图已发生变化，此提案已过期。请拒绝后重新请求 AI 修改。</p> : <>
        <div className="change-counts">{(['新增','删除','重命名','移动','其他调整'] as const).map(kind=><span key={kind}>{kind} <b>{changes.filter(c=>c.kind===kind).length}</b></span>)}</div>
        {!changes.length && <p>没有实际变更，无需应用。</p>}
        <div className="change-list">{changes.map((change,index)=><article className="change-card" key={index}><h3><span className={`change-badge change-${change.kind}`}>{change.kind}</span> {change.detail}</h3><div className="change-pair"><div><small>修改前</small><p>{change.before}</p></div><div><small>修改后</small><p>{change.after}</p></div></div></article>)}</div>
        <details className="full-outline"><summary>查看修改前后的完整大纲</summary><div className="change-pair">{[proposalMap!.document,proposal.document].map((doc,index)=><section key={index}><h3>{index ? '修改后':'修改前'}</h3><ol>{outlinePaths(doc).map(n=><li key={n.id}>{n.path}</li>)}</ol></section>)}</div></details>
      </>}
      <div className="actions"><button onClick={() => void bridge!.reject(proposal.id).then(() => setProposals(p => p.slice(1)))}>拒绝，不修改</button><button disabled={busy || stale || !changes.length} onClick={() => void perform(async () => {try {return await bridge!.approve(proposal.id);} finally {setProposals(p => p.slice(1));}})}>确认应用 · 可撤销</button></div></section></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
