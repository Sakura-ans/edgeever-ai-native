import {test,expect} from 'bun:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PersonalStore} from './personal-store.mjs';
import {runPersonalAgent} from './personal-ai.mjs';
test('mock SDK only reads/submits proposals; no built-in tools or settings; no database writes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mind-ai-test-'));
 try {
  const store=new PersonalStore(dir);await store.init();await store.command({type:'create',title:'Synthetic test'});const m=store.snapshot().maps[0];
  const before=await readFile(join(dir,'workspace.json'),'utf8');let options;let tools;const events=[];
  const sdk={tool:(name,_description,_schema,handler)=>({name,handler}),createSdkMcpServer:input=>{tools=input.tools;return input;},query:input=>{
    options=input.options;return (async function*(){
      const read=JSON.parse((await tools.find(t=>t.name==='read_map').handler()).content[0].text);
      read.document.nodes[0].label='Synthetic mock response';
      await tools.find(t=>t.name==='propose_map').handler({document:read.document,summary:'Preview only'});
      yield {type:'assistant',message:{content:[{type:'text',text:'Please review.'}]}};
    })();
  }};
  await runPersonalAgent({store,mapId:m.id,revision:0,prompt:'Synthetic request',config:{apiKey:'mock-key',model:'mock-model'},onEvent:e=>events.push(e),sdk,workingDirectory:dir});
  expect(options.tools).toEqual([]);expect(options.settingSources).toEqual([]);expect(options.persistSession).toBe(false);
  expect(options.env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/anthropic');expect(options.model).toBe('mock-model');
  expect((await options.canUseTool('Bash',{command:'bad'})).behavior).toBe('deny');
  expect((await options.canUseTool('Write',{})).behavior).toBe('deny');
  expect((await options.canUseTool('mcp__mindmap__approve',{})).behavior).toBe('deny');
  expect(tools.map(t=>t.name)).toEqual(['read_map','propose_map']);expect(events[0].type).toBe('proposal');expect(events[1].text).toBe('Please review.');
  expect(await readFile(join(dir,'workspace.json'),'utf8')).toBe(before);
  await store.approve(events[0].proposal.id);expect(store.snapshot().maps[0].document.nodes[0].label).toBe('Synthetic mock response');
 }finally{await rm(dir,{recursive:true,force:true});}
});
