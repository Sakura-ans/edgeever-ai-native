import {test,expect} from 'bun:test';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PersonalStore,validateDocument} from './personal-store.mjs';
async function fixture(fn) {
 const dir=await mkdtemp(join(tmpdir(),'mind-test-'));
 try {const store=new PersonalStore(dir);await store.init();await store.command({type:'create',title:'Test'});await fn(store,dir);} finally {await rm(dir,{recursive:true,force:true});}
}
const changed = m => ({...m.document,nodes:m.document.nodes.map(n=>({...n,label:'Mock AI label'}))});
test('first offline workspace, atomic save, restart, persistent undo/redo',async()=>fixture(async(s,dir)=>{
 let m=s.snapshot().maps[0];await s.command({type:'save',id:m.id,revision:0,document:changed(m)});
 const restarted=new PersonalStore(dir);await restarted.init();m=restarted.snapshot().maps[0];expect(m.document.nodes[0].label).toBe('Mock AI label');
 await restarted.command({type:'undo',id:m.id,revision:1});expect(restarted.snapshot().maps[0].document.nodes[0].label).toBe('中心主题');
 await restarted.command({type:'redo',id:m.id,revision:2});expect(restarted.snapshot().maps[0].document.nodes[0].label).toBe('Mock AI label');
 expect(JSON.parse(await readFile(join(dir,'workspace.previous.json'),'utf8')).maps[0].revision).toBe(2);
}));
test('proposal and rejection do not write; approval applies once and can be undone',async()=>fixture(async(s,dir)=>{
 const m=s.snapshot().maps[0],before=await readFile(join(dir,'workspace.json'),'utf8');
 const p=s.propose(m.id,0,changed(m),'Mock proposal');expect(await readFile(join(dir,'workspace.json'),'utf8')).toBe(before);
 s.reject(p.id);await expect(s.approve(p.id)).rejects.toThrow('expired');expect(await readFile(join(dir,'workspace.json'),'utf8')).toBe(before);
 const p2=s.propose(m.id,0,changed(m),'Mock proposal');await s.approve(p2.id);await expect(s.approve(p2.id)).rejects.toThrow('expired');
 await s.command({type:'undo',id:m.id,revision:1});expect(s.snapshot().maps[0].document).toEqual(m.document);
}));
test('stale proposal and concurrent edits cannot overwrite newer work',async()=>fixture(async(s)=>{
 const m=s.snapshot().maps[0],p=s.propose(m.id,0,changed(m),'stale');
 const results=await Promise.allSettled([s.command({type:'rename',id:m.id,revision:0,title:'New'}),s.command({type:'save',id:m.id,revision:0,document:changed(m)})]);
 expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected']);await expect(s.approve(p.id)).rejects.toThrow('Revision conflict');expect(s.snapshot().maps[0].title).toBe('New');
}));
test('backup import is validated and creates copies; delete does not corrupt other maps',async()=>fixture(async(s)=>{
 const original=s.snapshot();await s.command({type:'import',backup:original});let state=s.snapshot();expect(state.maps.length).toBe(2);expect(state.maps[1].id).not.toBe(state.maps[0].id);
 await s.command({type:'delete',id:state.maps[0].id,revision:0});expect(s.snapshot().maps.length).toBe(1);
 await expect(s.command({type:'import',backup:{version:99}})).rejects.toThrow('Invalid backup');expect(s.snapshot().maps.length).toBe(1);
}));
test('invalid cyclic trees and unknown edges are rejected',async()=>fixture(async(s)=>{
 const doc=s.snapshot().maps[0].document;
 expect(()=>validateDocument({...doc,nodes:[{...doc.nodes[0],parentId:doc.nodes[0].id}]})).toThrow();
 expect(()=>validateDocument({...doc,edges:[{id:'bad',source:'no',target:'no'}]})).toThrow();
}));
test('corrupt workspace is never silently replaced',async()=>fixture(async(_s,dir)=>{
 await writeFile(join(dir,'workspace.json'),'broken');await expect(new PersonalStore(dir).init()).rejects.toThrow('not overwritten');expect(await readFile(join(dir,'workspace.json'),'utf8')).toBe('broken');
}));
test('failed disk writes preserve memory and future saves; preview objects cannot change approval',async()=>fixture(async(s)=>{
 const m=s.snapshot().maps[0];const before=s.snapshot();const persist=s.persist.bind(s);s.persist=async()=>{throw new Error('Disk full');};
 await expect(s.command({type:'rename',id:m.id,revision:0,title:'Lost'})).rejects.toThrow('Disk full');expect(s.snapshot()).toEqual(before);
 s.persist=persist;const proposal=s.propose(m.id,0,changed(m),'Preview');proposal.document.nodes[0].label='Tampered preview';
 await s.approve(proposal.id);expect(s.snapshot().maps[0].document.nodes[0].label).toBe('Mock AI label');
}));
