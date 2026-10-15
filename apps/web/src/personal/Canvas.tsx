import {useEffect,useRef,useState} from 'react';
import {Graph} from '@antv/x6';
import {buildDiagramPalette,resolveMindMapNodeStyle,mindMapTopicMarkup,mindMapNodeRole,mindMapBranchSides,mindMapEdgeTerminal,mindMapEdgeVisual,mindMapEdgeLineAttrs,mindMapSiblingSpan,mindMapConnector,type DiagramDocument} from '@edgeever/shared';
Graph.registerConnector('personal-mindmap',mindMapConnector,true);
export function Canvas({document,selected='',onSelect=()=>{},onMove=()=>{},shell='paper',preview=false}:{document:DiagramDocument;selected?:string;onSelect?:(id:string)=>void;onMove?:(id:string,x:number,y:number)=>void;shell?:string;preview?:boolean}) {
 const host=useRef<HTMLDivElement>(null),graph=useRef<Graph|null>(null);
 const [fontEpoch,setFontEpoch]=useState(0);
 useEffect(()=>{const done=()=>setFontEpoch(v=>v+1);window.document.fonts.addEventListener('loadingdone',done);return()=>window.document.fonts.removeEventListener('loadingdone',done);},[]);
 const callbacks=useRef({onSelect,onMove});callbacks.current={onSelect,onMove};
 useEffect(()=>{
  const g=new Graph({container:host.current!,async:false,autoResize:true,background:{color:'transparent'},grid:false,panning:!preview,mousewheel:{enabled:!preview,modifiers:['ctrl','meta']},interacting:{nodeMovable:!preview,edgeMovable:false,arrowheadMovable:false}});graph.current=g;
  g.on('node:click',({node})=>callbacks.current.onSelect(node.id));
  g.on('node:moved',({node})=>{const p=node.position();callbacks.current.onMove(node.id,p.x,p.y);});
  return ()=>{g.dispose();graph.current=null;};
 },[preview]);
 useEffect(()=>{
  const g=graph.current;if(!g)return;
  const appearance=shell==='studio'?'dark':'light',theme=document.theme??'plain',structure=document.structure;
  const palette=buildDiagramPalette(theme,appearance);
  g.clearCells();
  for(const n of document.nodes){
   const {role,visual}=resolveMindMapNodeStyle(document.nodes,n.id,palette,theme,appearance,n,structure);
   g.addNode({id:n.id,x:n.x,y:n.y,width:n.width,height:n.height,markup:[{tagName:'rect',selector:'selection'},...mindMapTopicMarkup(structure,role)],attrs:{selection:{x:-5,y:-5,width:n.width+10,height:n.height+10,rx:9,fill:'none',stroke:n.id===selected?(shell==='studio'?'#a3b4ff':'#a45e40'):'none',strokeWidth:2,strokeDasharray:'4 3'},...visual,label:{...visual.label,text:n.label,textWrap:{width:-16,height:-6,ellipsis:true}}}});
  }
  for(const e of document.edges){
   const source=document.nodes.find(n=>n.id===e.source)!,target=document.nodes.find(n=>n.id===e.target)!;
   const role=mindMapNodeRole(document.nodes,source.id),style=resolveMindMapNodeStyle(document.nodes,target.id,palette,theme,appearance,target,structure);
   const visual=mindMapEdgeVisual(role,palette,style.tint),sides=mindMapBranchSides(source,target,structure),span=structure==='brace'?mindMapSiblingSpan(document.nodes,source.id):null;
   g.addEdge({id:e.id,zIndex:-1,source:{cell:source.id,...mindMapEdgeTerminal(source,role,sides.source,structure)},target:{cell:target.id,...mindMapEdgeTerminal(target,style.role,sides.target,structure)},connector:{name:'personal-mindmap',args:{structure,sourceWidth:visual.sourceWidth,targetWidth:visual.targetWidth,...(span?{braceTop:span.top,braceBottom:span.bottom}:{})}},attrs:{line:{...mindMapEdgeLineAttrs(structure,visual.stroke),stroke:visual.stroke,targetMarker:null,sourceMarker:null}}});
  }
  if(preview)g.zoomToFit({padding:12,maxScale:.55});
 },[document,selected,shell,preview,fontEpoch]);
 return <div className={preview?'mini-map':'canvas-stage'}><div className="canvas" ref={host}/>{!preview&&<button className="canvas-fit" onClick={()=>graph.current?.zoomToFit({padding:36,maxScale:1})}>适应画布</button>}</div>;
}
