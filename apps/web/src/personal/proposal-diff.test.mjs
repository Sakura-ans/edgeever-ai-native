import {test,expect} from 'bun:test';
import {describeProposal,outlinePaths} from './proposal-diff';
const doc=(items)=>({schemaVersion:1,kind:'mind-map',nodes:items.map(([id,label,parentId])=>({id,label,parentId,x:0,y:0,width:150,height:44,shape:'topic'})),edges:items.filter(n=>n[2]).map(([id,,parentId])=>({id:`e-${id}`,source:parentId,target:id}))});
test('readable change list covers subtree additions/deletions, rename and move',()=>{
 const before=doc([['r','项目'],['a','旧名称','r'],['b','待删除','a'],['c','子项','b'],['d','移动项','a']]);
 const after=doc([['r','项目'],['a','新名称','r'],['d','移动项','r'],['e','新增','a']]);
 const changes=describeProposal(before,after);
 expect(changes.filter(c=>c.kind==='删除').map(c=>c.before)).toEqual(['项目 › 旧名称 › 待删除','项目 › 旧名称 › 待删除 › 子项']);
 expect(changes.find(c=>c.kind==='重命名')?.after).toBe('项目 › 新名称');expect(changes.find(c=>c.kind==='移动')?.after).toBe('项目 › 移动项');expect(changes.filter(c=>c.kind==='新增')).toHaveLength(1);
});
test('duplicate names remain distinguishable, long labels are not truncated',()=>{
 const long='长'.repeat(2000);const d=doc([['r','项目'],['a','同名','r'],['b','同名','r'],['c',long,'a'],['d',long,'b']]);
 const paths=outlinePaths(d);expect(paths[3].path).toContain('同名第 1 项');expect(paths[4].path).toContain('同名第 2 项');expect(paths[4].path.endsWith(long)).toBe(true);expect(describeProposal(d,structuredClone(d))).toEqual([]);
});
test('position/size, order and connection-only changes are disclosed',()=>{
 const a=doc([['r','根'],['a','甲','r'],['b','乙','r']]);const b=structuredClone(a);b.nodes[1].x=10;b.nodes[1].width=200;b.nodes.reverse();b.edges[0].id='replacement';
 const changes=describeProposal(a,b);expect(changes.filter(c=>c.kind==='其他调整')).toHaveLength(3);expect(changes[0].detail).toContain('200');
});
test('deep and large supported maps produce complete paths and diffs',()=>{
 const deep=doc(Array.from({length:100},(_,i)=>[String(i),`层${i}`,i ? String(i-1):undefined]));expect(outlinePaths(deep)[99].path.split(' › ')).toHaveLength(100);
 const large=doc(Array.from({length:2000},(_,i)=>[String(i),`项${i}`,i?'0':undefined]));const after=structuredClone(large);after.nodes[1999].label='新末项';expect(describeProposal(large,after)).toHaveLength(1);
});
