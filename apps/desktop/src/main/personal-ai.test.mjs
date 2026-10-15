import {test,expect} from 'bun:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PersonalStore} from './personal-store.mjs';
import {runPersonalAgent,personalAgentEnvironment,createPersonalAgentRequests} from './personal-ai.mjs';
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
      yield {type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'Please '}}};
      yield {type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'review.'}}};
      yield {type:'assistant',message:{content:[{type:'text',text:'Please review.'}]}};
    })();
  }};
  await runPersonalAgent({store,mapId:m.id,revision:0,prompt:'Synthetic request',config:{apiKey:'mock-key',model:'mock-model'},onEvent:e=>events.push(e),sdk,workingDirectory:dir});
  expect(options.tools).toEqual([]);expect(options.settingSources).toEqual([]);expect(options.persistSession).toBe(false);
  expect(options.env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/anthropic');expect(options.model).toBe('mock-model');
  expect((await options.canUseTool('Bash',{command:'bad'})).behavior).toBe('deny');
  expect((await options.canUseTool('Write',{})).behavior).toBe('deny');
  expect((await options.canUseTool('mcp__mindmap__approve',{})).behavior).toBe('deny');
  expect(tools.map(t=>t.name)).toEqual(['read_map','propose_map']);expect(events[0].type).toBe('proposal');expect(events.filter(e=>e.type === 'text').map(e=>e.text).join('')).toBe('Please review.');
  expect(options.strictMcpConfig).toBe(true);expect(options.skills).toEqual([]);expect(options.plugins).toEqual([]);
  expect(await readFile(join(dir,'workspace.json'),'utf8')).toBe(before);
  await store.approve(events[0].proposal.id);expect(store.snapshot().maps[0].document.nodes[0].label).toBe('Synthetic mock response');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('provider credentials and routing cannot leak in from the launching shell',()=>{
 const env=personalAgentEnvironment({apiKey:'synthetic-key',model:'synthetic-model'},'/temporary-agent',{PATH:'/bin',CLAUDE_CODE_USE_BEDROCK:'1',ANTHROPIC_API_KEY:'unrelated-key',ANTHROPIC_CUSTOM_HEADERS:'unrelated-auth',CLAUDE_CODE_OAUTH_TOKEN:'unrelated-token'});
 expect(env.PATH).toBe('/bin');expect(env.ANTHROPIC_AUTH_TOKEN).toBe('synthetic-key');expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined();expect(env.ANTHROPIC_API_KEY).toBeUndefined();expect(env.ANTHROPIC_CUSTOM_HEADERS).toBeUndefined();expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
});

test('request reservation prevents duplicate clicks during async credentials and supports early cancel',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mind-request-test-'));
 try {
  const store=new PersonalStore(dir);await store.init();await store.command({type:'create',title:'Synthetic'});const m=store.snapshot().maps[0];
  let ready;let called=0;const config=new Promise(resolve=>{ready=resolve;});
  const requests=createPersonalAgentRequests({store,readConfig:()=>config,makeDirectory:async()=>dir,removeDirectory:async()=>{},runAgent:async()=>{called++;},emit:()=>{}});
  const first=requests.ask({id:m.id,revision:0,prompt:'Synthetic'});
  await expect(requests.ask({id:m.id,revision:0,prompt:'Duplicate'})).rejects.toThrow('already running');
  requests.cancel();ready({model:'fake',apiKey:'fake'});await expect(first).rejects.toThrow('cancelled');expect(called).toBe(0);
  await requests.ask({id:m.id,revision:0,prompt:'Retry'});expect(called).toBe(1);expect(store.snapshot().maps[0].revision).toBe(0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('SDK failures are sanitized, temporary workspace removed, and cancellation reaches the running agent',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mind-request-test-'));
 try {
  const store=new PersonalStore(dir);await store.init();await store.command({type:'create',title:'Synthetic'});const m=store.snapshot().maps[0];
  let removed=false;let started;const ready=new Promise(r=>started=r);
  const requests=createPersonalAgentRequests({store,readConfig:async()=>({model:'fake',apiKey:'synthetic-secret'}),makeDirectory:async()=>dir,removeDirectory:async()=>{removed=true;},emit:()=>{},runAgent:({signal})=>new Promise((_resolve,reject)=>{started();signal.addEventListener('abort',()=>reject(new Error('synthetic-secret')));})});
  const running=requests.ask({id:m.id,revision:0,prompt:'Synthetic'});await ready;requests.cancel();await expect(running).rejects.toThrow('AI request failed or cancelled');expect(removed).toBe(true);expect(store.snapshot().maps[0].revision).toBe(0);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('request timeout aborts mock SDK, cleans up, never saves and allows retry',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mind-timeout-'));try{
 const store=new PersonalStore(dir);await store.init();await store.command({type:'create',title:'Timeout fixture'});const m=store.snapshot().maps[0],before=await readFile(join(dir,'workspace.json'),'utf8');let removed=0,attempt=0;
 const requests=createPersonalAgentRequests({store,timeoutMs:10,readConfig:async()=>({model:'mock',apiKey:'mock'}),makeDirectory:async()=>dir,removeDirectory:async()=>{removed++;},emit:()=>{},runAgent:async({signal})=>{if(attempt++===0) await new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('mock abort')),{once:true}));}});
 await expect(requests.ask({id:m.id,revision:0,prompt:'Timeout'})).rejects.toThrow('cancelled');expect(removed).toBe(1);expect(await readFile(join(dir,'workspace.json'),'utf8')).toBe(before);await requests.ask({id:m.id,revision:0,prompt:'Retry'});expect(removed).toBe(2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
