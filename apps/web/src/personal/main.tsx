import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DIAGRAM_SELECTABLE_THEMES,DIAGRAM_SELECTABLE_STRUCTURES,resolveDiagramTheme,type DiagramTheme} from '@edgeever/shared';
import {MindError,userError,titleProblem,type PublicError} from '../../../desktop/src/main/personal-errors.mjs';
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
type Draft={title?:string;labels:Record<string,string>};
type Drafts=Record<string,Draft>;
function readDrafts():Drafts {try{const value:unknown=JSON.parse(localStorage.getItem('mind-drafts-v1')??'{}');if(!value||typeof value!=='object'||Array.isArray(value))return {};const result:Drafts={};for(const [id,item] of Object.entries(value)){const d=item as Draft;if(!id||!d||typeof d!=='object'||!d.labels||typeof d.labels!=='object'||Array.isArray(d.labels)||Object.values(d.labels).some(v=>typeof v!=='string')||(d.title!==undefined&&typeof d.title!=='string'))continue;Object.defineProperty(result,id,{value:{...d,labels:{...d.labels}},enumerable:true,writable:true,configurable:true});}return result;}catch{return {};}}
const composingKey=(event:{isComposing?:boolean;keyCode?:number},active:boolean)=>active||event.isComposing||event.keyCode===229;


function App() {
  const [shell,setShell]=useState(()=>localStorage.getItem('mind-shell')==='studio'?'studio':'paper');
  const [libraryOpen,setLibraryOpen]=useState(()=>localStorage.getItem('mind-library')!=='closed');
  const [outlineOpen,setOutlineOpen]=useState(()=>localStorage.getItem('mind-outline')!=='closed');
  const [panel,setPanel]=useState<'ai'|'themes'|'properties'|null>(null);
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
  const [busy,setBusy] = useState(false), [error,setError] = useState<(PublicError & {scope:string})|null>(null), [status,setStatus] = useState('加载本地工作区…');
  const [newTitle,setNewTitle] = useState<string|null>(null);
  const [label,setLabel] = useState(''), [mapTitle,setMapTitle] = useState('');
  const [settings,setSettings] = useState(false), [model,setModel] = useState('deepseek-flash'), [key,setKey] = useState(''), [hasKey,setHasKey] = useState(false);
  const [prompt,setPrompt] = useState(''), [answer,setAnswer] = useState(''), [running,setRunning] = useState(false), [proposals,setProposals] = useState<Proposal[]>([]);
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const [drafts,setDrafts]=useState<Drafts>(readDrafts),draftRef=useRef(drafts),blocked=useRef(Object.keys(drafts).length>0);
  const [draftEditing,setDraftEditing]=useState(false),[showFull,setShowFull]=useState(false),[moveParent,setMoveParent]=useState('');
  const modalReturn=useRef<HTMLElement|null>(null);
  const composing=useRef(false),compositionEnded=useRef(0),draftDurable=useRef(true);
  const editGroup=useRef<{id:string;node:string;time:number}|null>(null);
  const endGroup=()=>{editGroup.current=null;};
  const fail=(value:unknown,scope='write')=>setError({...userError(value),scope});
  function putDrafts(next:Drafts){draftRef.current=next;setDrafts(next);try{localStorage.setItem('mind-drafts-v1',JSON.stringify(next));draftDurable.current=true;}catch{draftDurable.current=false;}}
  function patchDraft(id:string,patch:Partial<Draft>){const old=draftRef.current[id]??{labels:{}};putDrafts({...draftRef.current,[id]:{...old,...patch,labels:{...old.labels,...patch.labels}}});setDraftEditing(true);}
  function acknowledge(id:string,patch:Partial<Draft>){const old=draftRef.current[id];if(!old)return;const next={...old,labels:{...old.labels}};if(patch.title!==undefined&&old.title===patch.title)delete next.title;for(const [node,value] of Object.entries(patch.labels??{}))if(next.labels[node]===value)delete next.labels[node];const all={...draftRef.current};if(next.title===undefined&&!Object.keys(next.labels).length)delete all[id];else all[id]=next;putDrafts(all);}
  const draftCount=Object.keys(drafts).length;

  const latest = useRef(workspace);
  const map = workspace.maps.find(m => m.id === active) ?? workspace.maps[0];
  useEffect(()=>{setPreviewTheme(null);},[map?.id,map?.revision,panel]);
  const node = map?.document.nodes.find(n => n.id === selected) ?? map?.document.nodes[0];
  useEffect(() => {
    if (!bridge) {fail(new MindError('DESKTOP_REQUIRED'),'load');return;}
    void bridge.load().then(state => {latest.current=state;setWorkspace(state);setStatus(Object.keys(draftRef.current).length?'已读取本机内容 · 有待恢复草稿':'已保存到本机');}).catch(e => {fail(e,'load');setStatus('读取失败');});
    const offClose = bridge.onBeforeClose?.(() => {void pending.current.then(() => {if(Object.keys(draftRef.current).length&&!window.confirm(draftDurable.current?'仍有未保存到工作区的草稿，已单独保留供下次恢复。确认退出？':'草稿仅保留在内存，退出会丢失。确认放弃并退出？'))return;return bridge.readyToClose?.();});});
    const offAgent = bridge.onAgentEvent(event => {
      if (event.type === 'text') setAnswer(text => text + event.text);
      else setProposals(items => [...items,event.proposal]);
    });
    return () => {offClose?.();offAgent();};
  },[]);
  useEffect(()=>{const draft=draftEditing?drafts[map?.id??'']:undefined;setLabel(draft?.labels[node?.id??'']??node?.label??'');setMapTitle(draft?.title??map?.title??'');},[map?.id,map?.revision,node?.id,node?.label,drafts,draftEditing]);
  async function perform(action:()=>Promise<unknown>,scope='write') {
    const operation = pending.current.then(async () => {
      if(scope==='write'&&blocked.current){fail(new MindError(Object.keys(draftRef.current).length?'DRAFT_PENDING':'WRITE_BLOCKED'));return false;}
      setBusy(true);setError(null);if(scope==='write')setStatus('正在保存…');
      try {
        const result=await action();
        if(result&&typeof result==='object'&&'maps' in result){latest.current=result as Workspace;setWorkspace(result as Workspace);}
        if(scope==='write')setStatus(Object.keys(draftRef.current).length?'有未保存草稿':'已保存到本机');
        return true;
      }catch(e){fail(e,scope);if(scope==='write'){blocked.current=true;setStatus(Object.keys(draftRef.current).length?'未保存 · 草稿已保留':'操作未完成 · 本机内容未改变');}return false;}
      finally{setBusy(false);}
    });pending.current=operation;return operation;
  }
  function syncBuffers(state:Workspace){const m=state.maps.find(m=>m.id===map?.id)??state.maps[0];const n=m?.document.nodes.find(n=>n.id===node?.id)??m?.document.nodes[0];setMapTitle(m?.title??'');setLabel(n?.label??'');}
  async function reload(){await pending.current;setStatus('正在读取本机内容…');try{const state=await bridge!.load();latest.current=state;setWorkspace(state);setDraftEditing(false);syncBuffers(state);setError(null);blocked.current=Object.keys(draftRef.current).length>0;setStatus(blocked.current?'已读取本机内容 · 有未保存草稿':'已读取本机内容');endGroup();}catch(e){fail(e,'load');setStatus('读取失败 · 草稿仍保留');}}
  function discardDrafts(){if(!window.confirm('放弃全部未保存草稿并恢复本机内容？此操作不能撤销。'))return;putDrafts({});blocked.current=false;setDraftEditing(false);syncBuffers(latest.current);setError(null);setStatus('已读取本机内容');endGroup();}
  async function retryDrafts(){await pending.current;if(error?.code==='CONFLICT'&&!window.confirm('请先重新读取并核对当前版本。继续会将草稿文字应用到当前版本，成功后可撤销。'))return;
    const all=structuredClone(draftRef.current);for(const [id,d] of Object.entries(all)){const m=latest.current.maps.find(m=>m.id===id);if(!m||Object.keys(d.labels).some(id=>!m.document.nodes.some(n=>n.id===id))){fail(new MindError('DRAFT_TARGET'));return;}if(d.title!==undefined&&titleProblem(d.title)){fail(new MindError(titleProblem(d.title)!));return;}}
    blocked.current=false;setDraftEditing(true);endGroup();
    for(const [id,d] of Object.entries(all)){if(d.title!==undefined){const ok=await perform(async()=>{const m=latest.current.maps.find(m=>m.id===id)!;const state=await bridge!.command({type:'rename',id,revision:m.revision,title:d.title});acknowledge(id,{title:d.title});return state;});if(!ok)return;}
      if(Object.keys(d.labels).length){const ok=await perform(async()=>{const m=latest.current.maps.find(m=>m.id===id)!;const state=await bridge!.command({type:'save',id,revision:m.revision,document:{...m.document,nodes:m.document.nodes.map(n=>d.labels[n.id]===undefined?n:{...n,label:d.labels[n.id]})}});acknowledge(id,{labels:d.labels});return state;});if(!ok)return;}}
  }
  const command=(type:string,extra:Record<string,unknown>={})=>{endGroup();return perform(()=>bridge!.command({type,id:map?.id,revision:latest.current.maps.find(m=>m.id===map?.id)?.revision,...extra}));};
  const save=(document:DiagramDocument)=>command('save',{document});
  function updateTitle(value:string){if(!map)return;setMapTitle(value);patchDraft(map.id,{title:value});const problem=titleProblem(value);if(problem){setStatus('名称未提交 · 请修正');return;}if(blocked.current){setStatus('有未保存草稿 · 请重试或放弃');return;}const id=map.id;void perform(async()=>{const current=latest.current.maps.find(m=>m.id===id)!;const state=await bridge!.command({type:'rename',id,revision:current.revision,title:value});acknowledge(id,{title:value});return state;});}
  function updateLabel(value:string){setLabel(value);if(!map||!node)return;const mapId=map.id,nodeId=node.id;patchDraft(mapId,{labels:{[nodeId]:value}});if(blocked.current){setStatus('有未保存草稿 · 请重试或放弃');return;}
    const now=Date.now();if(!editGroup.current||editGroup.current.node!==nodeId||now-editGroup.current.time>1200)editGroup.current={id:crypto.randomUUID(),node:nodeId,time:now};editGroup.current.time=now;const group=editGroup.current.id;
    void perform(async()=>{const current=latest.current.maps.find(m=>m.id===mapId)!;const state=await bridge!.command({type:'save',id:mapId,revision:current.revision,editGroup:group,editNode:nodeId,document:{...current.document,nodes:current.document.nodes.map(n=>n.id===nodeId?{...n,label:value}:n)}});acknowledge(mapId,{labels:{[nodeId]:value}});return state;});
  }
  function selectNode(id:string){endGroup();setSelected(id);setShowFull(false);}
  function inputKey(event:React.KeyboardEvent<HTMLInputElement|HTMLTextAreaElement>){if(composingKey(event.nativeEvent,composing.current)||Date.now()-compositionEnded.current<30)return;if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.blur();}}
  const compositionProps={onCompositionStart:()=>{composing.current=true;},onCompositionEnd:()=>{composing.current=false;compositionEnded.current=Date.now();},onKeyDown:inputKey,onBlur:()=>{composing.current=false;endGroup();}};
  function addChild(sibling=false) {
    if (!map || !node) return;
    const parent=sibling?map.document.nodes.find(n=>n.id===node.parentId):node;if(!parent)return;
    const id = crypto.randomUUID();
    void save({...map.document,nodes:[...map.document.nodes,{id,label:'新主题',parentId:parent.id,shape:'topic',x:parent.x+220,y:parent.y+map.document.nodes.filter(n => n.parentId === parent.id).length*72,width:150,height:44}],edges:[...map.document.edges,{id:crypto.randomUUID(),source:parent.id,target:id}]}).then(ok=>{if(ok)selectNode(id);});
  }
  function removeNode() {
    if (!map || !node?.parentId) return;
    const removed = new Set([node.id]);
    let size;
    do {size=removed.size; for (const n of map.document.nodes) if (n.parentId && removed.has(n.parentId)) removed.add(n.id);} while(size !== removed.size);
    if (!window.confirm(`删除此主题及其 ${removed.size-1} 个子主题？可以撤销。`)) return;
    void save({...map.document,nodes:map.document.nodes.filter(n => !removed.has(n.id)),edges:map.document.edges.filter(e => !removed.has(e.target))});
  }
  const descendants=new Set<string>(node?[node.id]:[]);if(map){let size;do{size=descendants.size;for(const n of map.document.nodes)if(n.parentId&&descendants.has(n.parentId))descendants.add(n.id);}while(size!==descendants.size);}
  function moveNode(){if(!map||!node?.parentId||!moveParent||descendants.has(moveParent)||!map.document.nodes.some(n=>n.id===moveParent)){fail(new MindError('INVALID_PARENT'));return;}void save({...map.document,nodes:map.document.nodes.map(n=>n.id===node.id?{...n,parentId:moveParent}:n),edges:map.document.edges.map(e=>e.target===node.id?{...e,source:moveParent}:e)});setMoveParent('');}
  async function ask() {
    if (!map || !prompt.trim() || running) return;
    setRunning(true);setAnswer('');setError(null);
    try {await bridge!.ask({id:map.id,revision:map.revision,prompt});}
    catch(e) {fail(e,'ai');} finally {setRunning(false);}
  }
  const proposal = proposals[0];
  const proposalMap = proposal && workspace.maps.find(m => m.id === proposal.mapId);
  const stale = !!proposal && (!proposalMap || proposalMap.revision !== proposal.revision);
  const changes = proposal && proposalMap && !stale ? describeProposal(proposalMap.document,proposal.document) : [];
  useEffect(()=>{
    if(!proposal&&!settings&&newTitle===null)return;
    const dialog=document.querySelector<HTMLElement>('[role="dialog"]');if(!dialog)return;
    const previous=modalReturn.current??document.activeElement as HTMLElement|null;
    const focusable=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,summary,[tabindex="0"]'));
    focusable()[0]?.focus();
    const trap=(event:KeyboardEvent)=>{if(composingKey(event,composing.current))return;if(event.key==='Escape'){event.preventDefault();if(proposal){void perform(async()=>{await bridge!.reject(proposal.id);setProposals(p=>p.slice(1));},'proposal');}else if(settings){setSettings(false);setKey('');}else setNewTitle(null);return;}if(event.key!=='Tab')return;const items=focusable(),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
    dialog.addEventListener('keydown',trap);return()=>{dialog.removeEventListener('keydown',trap);modalReturn.current=null;requestAnimationFrame(()=>{if(previous?.isConnected)previous.focus();});};
  },[proposal?.id,settings,newTitle===null]);
  const outline = (parent:string|undefined,depth=0):React.ReactNode => map?.document.nodes.filter(n => n.parentId === parent).map(n => <React.Fragment key={n.id}><button className={`outline ${node?.id === n.id ? 'selected':''}`} style={{paddingLeft:12+depth*16}} onClick={() => selectNode(n.id)}><span>{n.label || '空主题'}</span></button>{outline(n.id,depth+1)}</React.Fragment>);
  useEffect(()=>{
    const handle=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement;
      if(composingKey(event,composing.current)||Date.now()-compositionEnded.current<30)return;
      if(target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')||settings||newTitle!==null||proposal)return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&map&&!busy){event.preventDefault();const type=event.shiftKey?'redo':'undo';if(map[type].length)void command(type);}
      if(map&&!busy&&!blocked.current&&target.closest('.editor')){if(event.key==='Enter'){event.preventDefault();addChild(true);}if(event.key==='Tab'){event.preventDefault();addChild();}if(event.key==='Delete'){event.preventDefault();removeNode();}}
      if(event.key==='Escape'){setPreviewTheme(null);setPanel(null);}
    };
    window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);
  });
  return <div className="app">
    <header><strong>EdgeEver <span>Mind</span></strong><small>个人思维导图 · 本地优先</small><span className="spacer"/><button className="shell-toggle" aria-label="切换外壳" onClick={()=>setShell(shell==='paper'?'studio':'paper')}>{shell==='paper'?'☾ 深色工作室':'☀ 温暖纸感'}</button><span className="save-indicator" aria-hidden="true">{draftCount||status.includes('未保存')||status.includes('未提交')||status.includes('失败')?'!':status.includes('正在')?'…':status==='已保存到本机'?'✓':'↻'}</span><span role="status">{status}</span><button onClick={event => {modalReturn.current=event.currentTarget;setSettings(!settings);void bridge?.config().then(c => {setModel(c.model);setHasKey(c.hasKey);}).catch(e => fail(e,'settings'));}}>DeepSeek 设置</button></header>
    {error && <div className="error" role="alert"><span>{error.message}（错误代码：{error.code}）</span>
      {error.action==='settings'&&<button onClick={event=>{modalReturn.current=event.currentTarget;setSettings(true);}}>打开设置</button>}
      {(error.scope==='write'||error.scope==='load')&&<button disabled={busy} onClick={()=>void reload()}>重新读取</button>}
      {error.scope==='ai'&&error.action==='retry'&&<button disabled={running} onClick={()=>void ask()}>重试 AI 请求</button>}
      <button aria-label="关闭错误提示" onClick={()=>setError(null)}>关闭提示</button></div>}
    {!!draftCount&&<section className="draft-notice" aria-label="未保存草稿"><strong>有 {draftCount} 份未保存草稿{!draftDurable.current?'（仅保留在内存）':''}</strong><button disabled={busy} onClick={()=>void retryDrafts()}>重试保存草稿</button><button disabled={busy} onClick={discardDrafts}>放弃草稿，恢复本机内容</button><details><summary>查看并复制草稿全文</summary>{Object.entries(drafts).map(([id,d])=><div key={id}><b>{workspace.maps.find(m=>m.id===id)?.title??'已删除导图'}</b>{d.title!==undefined&&<p>名称草稿：{d.title||'（空）'}</p>}{Object.entries(d.labels).map(([nid,value])=><p key={nid}>{value||'（空主题）'}</p>)}</div>)}</details></section>}
    <div className="workspace-controls"><button aria-expanded={libraryOpen} onClick={()=>{setLibraryOpen(!libraryOpen);if(window.innerWidth<=850)setPanel(null);}}>☷ 导图库</button><button aria-expanded={outlineOpen} onClick={()=>setOutlineOpen(!outlineOpen)}>☰ 大纲</button><span className="spacer"/><small>离线工作区 · 自由整理每一个想法</small>{(['properties','themes','ai'] as const).map(value=><button key={value} aria-pressed={panel===value} onClick={()=>{setPanel(panel===value?null:value);setPreviewTheme(null);if(window.innerWidth<=850)setLibraryOpen(false);}}>{value==='properties'?'◫ 属性':value==='themes'?'◈ 主题':'✧ AI 助手'}</button>)}</div>
    <div className="workspace">
      {libraryOpen && <aside className="library"><div className="library-heading"><h2>我的导图</h2><button className="drawer-close" aria-label="收起导图库" onClick={()=>setLibraryOpen(false)}>收起 ‹</button></div><button disabled={busy || !bridge} onClick={event => {modalReturn.current=event.currentTarget;setNewTitle('未命名导图');}}>＋ 新建导图</button>
        <nav>{workspace.maps.map(m => <button key={m.id} className={m.id === map?.id ? 'selected':''} onClick={() => {endGroup();setActive(m.id);setSelected('');setShowFull(false);}}>{m.title}</button>)}</nav>
        <div className="backup"><button disabled={busy || !bridge} onClick={() => void perform(() => bridge!.exportBackup(),'export')}>导出完整备份</button><button disabled={busy || !bridge} onClick={() => void perform(() => bridge!.importBackup(),'import')}>导入备份为副本</button><small>包含全部导图与撤销历史。<br/>保存在本机，无自动同步。</small></div>
      </aside>}
      <main>{map ? <>
        <div className="toolbar"><textarea rows={1} aria-label="导图名称" aria-invalid={!!titleProblem(mapTitle)} aria-describedby="title-validation" value={mapTitle} onChange={e=>updateTitle(e.target.value)} {...compositionProps}/><button disabled={busy || !map.undo.length} onClick={() => void command('undo')}>撤销</button><button disabled={busy || !map.redo.length} onClick={() => void command('redo')}>重做</button><button disabled={busy} onClick={() => {if(window.confirm('删除整个导图？删除前请导出备份。')) void command('delete');}}>删除导图</button></div>
        <div id="title-validation" className="field-hint" aria-live="polite">{titleProblem(mapTitle)?userError(new MindError(titleProblem(mapTitle)!)).message:`名称 ${Array.from(mapTitle).length}/200 字符（Unicode 码点）`}</div>
        <div className="editor">{outlineOpen && <section className="outline-panel"><h2>大纲</h2>{outline(undefined)}</section>}<Canvas shell={shell} document={previewTheme?{...map.document,theme:previewTheme}:map.document} selected={node?.id ?? ''} onSelect={selectNode} onMove={(id,x,y) => {if(!busy) void save({...map.document,nodes:map.document.nodes.map(n => n.id === id ? {...n,x,y}:n)});}}/></div>
        <div className="toolbar"><textarea rows={1} aria-label="主题内容" maxLength={2000} value={label} onChange={e=>updateLabel(e.target.value)} {...compositionProps}/><button disabled={busy} onClick={()=>addChild()}>添加子主题</button><button disabled={busy||!node?.parentId} onClick={()=>addChild(true)}>添加同级</button><button disabled={busy || !node?.parentId} onClick={removeNode}>删除主题</button><button onClick={()=>{setShowFull(!showFull);setPanel('properties');if(window.innerWidth<=850)setLibraryOpen(false);}}>查看全文 / 移动</button><small>画布 / 大纲：Enter 同级 · Tab 子级 · Delete 删除；文字编辑时不触发</small></div>
      </> : <div className="empty"><h1>把想法放到一张图上</h1><p>点击“新建导图”开始。无需账号，无需联网。</p></div>}</main>
      {panel && <aside className="assistant"><div className="panel-heading"><small>工作台 / {panel==='themes'?'风格库':panel==='properties'?'属性':'智能协作'}</small><button aria-label="收起右侧面板" onClick={()=>{setPanel(null);setPreviewTheme(null);}}>收起 ›</button></div>
      <section hidden={panel!=='ai'}><h2>AI 助手</h2><p>仅点击发送后，将当前导图发送给 DeepSeek。所有修改先预览确认。</p><textarea aria-label="AI 请求" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="例如：把这个想法整理成三个阶段…"/><button disabled={!map || running || busy || !prompt.trim()} onClick={() => void ask()}>发送给 DeepSeek</button>{running && <button onClick={() => {void bridge?.cancel().catch(e=>fail(e,'ai'));}}>停止</button>}<pre aria-live="polite">{answer}</pre></section>
      {panel==='properties' && <section><h2>主题属性</h2><details open={showFull} onToggle={e=>setShowFull(e.currentTarget.open)}><summary>所选主题全文（可复制）</summary><p className="property-name">{node?.label??'尚未选择主题'}</p></details><label className="move-control">移动到父主题<select aria-label="新的父主题" value={moveParent} onChange={e=>setMoveParent(e.target.value)} disabled={!node?.parentId}><option value="">请选择父主题</option>{map?.document.nodes.filter(n=>!descendants.has(n.id)).map(n=><option key={n.id} value={n.id}>{n.label.slice(0,50)||'空主题'}</option>)}</select></label><button disabled={busy||!moveParent||!node?.parentId} onClick={moveNode}>移动主题 · 可撤销</button><dl><dt>层次</dt><dd>{!node?.parentId?'中心主题':map?.document.nodes.find(n=>n.id===node.parentId)?.parentId?'叶 / 分支主题':'主分支'}</dd><dt>配色</dt><dd>{themeNames[resolveDiagramTheme(map?.document.theme)]}</dd><dt>结构</dt><dd>{structureNames[map?.document.structure??'map']??map?.document.structure}</dd><dt>位置</dt><dd>{Math.round(node?.x??0)}, {Math.round(node?.y??0)}</dd></dl><p>在下方编辑完整文字；通过大纲选择主题。Ctrl / ⌘ + Z 撤销，Shift + Ctrl / ⌘ + Z 重做。</p></section>}
      {panel==='themes' && <section><h2>让想法拥有自己的风格</h2><p>先预览，再应用。配色不会移动主题。</p>{previewTheme && <div className="preview-actions" role="region" aria-label="主题预览"><strong>预览 · {themeNames[previewTheme]}</strong><button onClick={()=>setPreviewTheme(null)}>取消预览</button><button disabled={busy||!map} onClick={()=>{if(map)void save({...map.document,theme:previewTheme});setPreviewTheme(null);}}>应用配色</button></div>}
        <div className="theme-grid">{DIAGRAM_SELECTABLE_THEMES.map(theme=><button key={theme} data-theme-id={theme} disabled={!map||busy} aria-label={`预览配色：${themeNames[theme]}`} aria-pressed={(previewTheme??resolveDiagramTheme(map?.document.theme))===theme} onClick={()=>setPreviewTheme(theme)}><Canvas preview shell={shell} document={{...thumbnailDocument,theme}}/><span>{themeNames[theme]}</span>{resolveDiagramTheme(map?.document.theme)===theme&&<small> ✓ 已应用</small>}</button>)}</div>
        <h2 className="structure-heading">结构与布局</h2><p>切换将重新排列主题位置，可撤销恢复。</p><div className="structure-grid">{DIAGRAM_SELECTABLE_STRUCTURES.map(structure=><button key={structure} data-structure-id={structure} disabled={!map||busy} aria-pressed={(map?.document.structure??'map')===structure} onClick={()=>{if(map&&window.confirm(`切换为${structureNames[structure]}将重新排列全部主题。可撤销恢复，继续？`)){setPreviewTheme(null);void save(restructure(map.document,structure));}}}><StructureThumb structure={structure}/><span>{structureNames[structure]}</span></button>)}</div>
      </section>}
      </aside>}

    </div>
    {newTitle !== null && <div className="overlay"><form className="dialog" role="dialog" aria-modal="true" aria-label="新建导图" onSubmit={event => {event.preventDefault();if(composing.current||Date.now()-compositionEnded.current<30||titleProblem(newTitle))return;void perform(async () => {const next=await bridge!.command({type:'create',title:newTitle});setActive(next.maps.at(-1)!.id);setSelected('');setNewTitle(null);return next;});}}><h2>新建导图</h2><label>新导图名称<input autoFocus aria-invalid={!!titleProblem(newTitle)} aria-describedby="new-title-validation" {...compositionProps} value={newTitle} onChange={event => setNewTitle(event.target.value)}/></label><p id="new-title-validation" className="field-hint">{titleProblem(newTitle)?userError(new MindError(titleProblem(newTitle)!)).message:`${Array.from(newTitle).length}/200 字符（Unicode 码点）`}</p><div className="actions"><button type="button" onClick={() => setNewTitle(null)}>取消</button><button type="submit" disabled={busy || !!titleProblem(newTitle)}>创建</button></div></form></div>}
    {settings && <div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-label="DeepSeek 设置"><h2>DeepSeek 设置</h2><p>凭据使用操作系统安全存储加密。默认模型为 deepseek-flash，可按需修改。</p><label>模型标识<input value={model} onChange={e => setModel(e.target.value)}/></label><label>API Key {hasKey && '（已保存；留空保留）'}<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)}/></label><small>端点：https://api.deepseek.com/anthropic</small><div className="actions"><button onClick={() => {setSettings(false);setKey('');}}>关闭</button><button disabled={busy} onClick={() => void perform(async () => {await bridge!.clearConfig();setHasKey(false);setKey('');},'settings')}>删除凭据</button><button disabled={busy} onClick={() => void perform(async () => {await bridge!.saveConfig({model,apiKey:key});setKey('');setHasKey(true);setSettings(false);},'settings')}>保存设置</button></div></section></div>}
    {proposal && <div className="overlay"><section className="dialog proposal" role="dialog" aria-modal="true" aria-label="AI 修改预览"><h2>确认 AI 修改</h2><p>Esc 会拒绝并关闭此提案，不应用修改。</p><p>{proposal.summary}</p><p>目标：{proposalMap?.title ?? '已删除导图'} · 基于版本 {proposal.revision} · 尚未写入</p>
      {stale ? <p className="conflict" role="alert">导图已发生变化，此提案已过期。请拒绝后重新请求 AI 修改。</p> : <>
        <div className="change-counts">{(['新增','删除','重命名','移动','其他调整'] as const).map(kind=><span key={kind}>{kind} <b>{changes.filter(c=>c.kind===kind).length}</b></span>)}</div>
        {!changes.length && <p>没有实际变更，无需应用。</p>}
        <div className="change-list">{changes.map((change,index)=><article className="change-card" key={index}><h3><span className={`change-badge change-${change.kind}`}>{change.kind}</span> {change.detail}</h3><div className="change-pair"><div><small>修改前</small><p>{change.before}</p></div><div><small>修改后</small><p>{change.after}</p></div></div></article>)}</div>
        <details className="full-outline"><summary>查看修改前后的完整大纲</summary><div className="change-pair">{[proposalMap!.document,proposal.document].map((doc,index)=><section key={index}><h3>{index ? '修改后':'修改前'}</h3><ol>{outlinePaths(doc).map(n=><li key={n.id}>{n.path}</li>)}</ol></section>)}</div></details>
      </>}
      <div className="actions"><button onClick={() => void perform(async()=>{await bridge!.reject(proposal.id);setProposals(p=>p.slice(1));},'proposal')}>拒绝，不修改</button><button disabled={busy || stale || !changes.length} onClick={() => void perform(async () => {try {return await bridge!.approve(proposal.id);} finally {setProposals(p => p.slice(1));}})}>确认应用 · 可撤销</button></div></section></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
