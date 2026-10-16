import {test,expect} from 'bun:test';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as realSdk from '@anthropic-ai/claude-agent-sdk';
import {runPersonalAgent,resolvePersonalAgentExecutable} from './personal-ai.mjs';
import {PersonalStore} from './personal-store.mjs';
import {userError} from './personal-errors.mjs';

// The actual pinned SDK and executable cross the HTTP boundary. Only the
// provider is fake; endpoint/environment replacement exists solely in this test.
for(const [status,type,code] of [[400,'invalid_request_error','AI_MODEL'],[401,'authentication_error','AI_AUTH'],[403,'permission_error','AI_AUTH'],[422,'invalid_request_error','AI_MODEL'],[429,'rate_limit_error','AI_RATE'],[503,'overloaded_error','AI_PROVIDER']])test(`real SDK local HTTP ${status} yields safe ${code}`,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'mind-sdk-boundary-'));let requests=0;const errors=[];const events=[];
 const server=createServer((req,res)=>{req.resume();requests++;res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({type:'error',error:{type,message:'Bearer SYNTHETIC-secret /private/path'}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
 try {
  const store=new PersonalStore(join(directory,'maps'));await store.init();await store.command({type:'create',title:'SDK boundary'});const map=store.snapshot().maps[0];const before=JSON.stringify(store.snapshot());
  const sdk={...realSdk,query(input){return (async function*(){
   const stream=realSdk.query({...input,options:{...input.options,pathToClaudeCodeExecutable:resolvePersonalAgentExecutable(),env:{...input.options.env,CLAUDE_CODE_MAX_RETRIES:'0',ANTHROPIC_BASE_URL:`http://127.0.0.1:${server.address().port}`,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1'}}});
   try{for await(const message of stream){if(message.type==='assistant'&&message.error)errors.push({error:message.error,status:message.api_error_status});yield message;}}finally{stream.close();}
  })();}};
  let caught;try{await runPersonalAgent({store,mapId:map.id,revision:map.revision,prompt:'请读取导图',config:{model:'synthetic-model',apiKey:'SYNTHETIC-secret'},onEvent:event=>events.push(event),signal:controller.signal,sdk,workingDirectory:directory});}catch(error){caught=error;}
  expect(controller.signal.aborted).toBe(false);expect(requests).toBeGreaterThan(0);expect(errors.some(error=>error.status===status)).toBe(true);
  expect(userError(caught)).toMatchObject({code,action:['AI_RATE','AI_PROVIDER'].includes(code)?'retry':'settings'});expect(events).toEqual([]);expect(JSON.stringify(store.snapshot())).toBe(before);expect(JSON.stringify(userError(caught))).not.toMatch(/SYNTHETIC|Bearer|private/);
 }finally{clearTimeout(timer);controller.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
},30000);
