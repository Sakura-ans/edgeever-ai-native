import type {DiagramDocument} from '@edgeever/shared';
export type Change = {kind:'新增'|'删除'|'重命名'|'移动'|'其他调整';before:string;after:string;detail:string};
// IDs establish identity; labels are only presentation. Repeated siblings get an
// ordinal so two identically named branches remain distinguishable to the reader.
function paths(document:DiagramDocument) {
  const nodes=new Map(document.nodes.map(n=>[n.id,n]));
  const siblings=new Map<string,typeof document.nodes>();
  for(const n of document.nodes){const key=JSON.stringify([n.parentId,n.label]);const group=siblings.get(key) ?? [];group.push(n);siblings.set(key,group);}
  const cache=new Map<string,string>();
  function path(id:string):string {
    if(cache.has(id)) return cache.get(id)!;
    const n=nodes.get(id)!;const group=siblings.get(JSON.stringify([n.parentId,n.label]))!;
    const label=(n.label || '空主题')+(group.length>1 ? `（同名第 ${group.findIndex(item=>item.id===id)+1} 项）`:'');
    const value=n.parentId ? `${path(n.parentId)} › ${label}`:label;cache.set(id,value);return value;
  }
  for(const n of document.nodes) path(n.id);
  return cache;
}
export function describeProposal(before:DiagramDocument,after:DiagramDocument):Change[] {
  const oldNodes=new Map(before.nodes.map(n=>[n.id,n])),newNodes=new Map(after.nodes.map(n=>[n.id,n]));
  const oldPaths=paths(before),newPaths=paths(after),changes:Change[]=[];
  for(const n of before.nodes) if(!newNodes.has(n.id)) changes.push({kind:'删除',before:oldPaths.get(n.id)!,after:'删除后不再保留',detail:'删除主题（子主题逐项列出）'});
  for(const n of after.nodes){
    const old=oldNodes.get(n.id),oldPath=oldPaths.get(n.id) ?? '',newPath=newPaths.get(n.id)!;
    if(!old){changes.push({kind:'新增',before:'原导图中没有此主题',after:newPath,detail:'新增主题'});continue;}
    if(old.label!==n.label) changes.push({kind:'重命名',before:oldPath,after:newPath,detail:'主题文字修改'});
    if(old.parentId!==n.parentId) changes.push({kind:'移动',before:oldPath,after:newPath,detail:'移动到新的父主题；其子主题一同移动'});
    const fields=(['x','y','width','height'] as const).filter(key=>old[key]!==n[key]);
    if(fields.length) changes.push({kind:'其他调整',before:oldPath,after:newPath,detail:`画布位置 / 尺寸：(${old.x}, ${old.y}) · ${old.width} × ${old.height} → (${n.x}, ${n.y}) · ${n.width} × ${n.height}`});
  }
  const retainedBefore=before.nodes.filter(n=>newNodes.has(n.id)).map(n=>n.id);
  const retainedAfter=after.nodes.filter(n=>oldNodes.has(n.id)).map(n=>n.id);
  if(JSON.stringify(retainedBefore)!==JSON.stringify(retainedAfter)) changes.push({kind:'其他调整',before:'原大纲顺序',after:'新的大纲顺序',detail:'保留主题的排列顺序已改变，请在下方完整大纲中核对'});
  // Connectivity changes already appear as additions/deletions/moves. Surface
  // pure edge-identity/order changes too, without exposing an unexplained JSON blob.
  if(JSON.stringify(before.edges)!==JSON.stringify(after.edges) && !changes.some(c=>['新增','删除','移动'].includes(c.kind))) changes.push({kind:'其他调整',before:`${before.edges.length} 条连接线`,after:`${after.edges.length} 条连接线`,detail:'连接线标识或排列已更新，主题归属不变'});
  return changes;
}
export function outlinePaths(document:DiagramDocument){const all=paths(document);return document.nodes.map(n=>({id:n.id,path:all.get(n.id)!}));}
