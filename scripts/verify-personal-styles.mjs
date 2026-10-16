import {chromium} from '@playwright/test';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {PersonalStore} from '../apps/desktop/src/main/personal-store.mjs';
import {verifyStyles} from './personal-style-acceptance.mjs';
const output=resolve('artifacts/browser-styles');await mkdir(output,{recursive:true});
const dir=await mkdtemp(join(tmpdir(),'mind-styles-')),store=new PersonalStore(dir);await store.init();await store.command({type:'import',backup:JSON.parse(await readFile('examples/edgeever-mind-project.json','utf8'))});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'}),cases=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:950},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.exposeFunction('mindLoad',()=>store.snapshot());await page.exposeFunction('mindCommand',input=>store.command(input));await page.exposeFunction('mindApprove',id=>store.approve(id));await page.exposeFunction('mindReject',id=>store.reject(id));
 await page.addInitScript(()=>{window.edgeeverMind={load:()=>window.mindLoad(),command:input=>window.mindCommand(input),approve:id=>window.mindApprove(id),reject:id=>window.mindReject(id),onAgentEvent:fn=>{window.emitMockAgentEvent=fn;return()=>{};}};});
 await page.goto('http://127.0.0.1:5173/personal.html');
 await verifyStyles({page,snapshot:()=>store.snapshot(),restart:async()=>{await page.reload();return page;},shot:name=>page.screenshot({animations:'disabled',path:join(output,`${name}.png`)}),check:async(name,fn)=>{await fn();cases.push({name,status:'PASS'});console.log('PASS',name);},emitProposal:async m=>{const p=store.propose(m.id,m.revision,{...m.document,theme:'prism',structure:'fishbone',nodes:m.document.nodes.map((n,i)=>i===0?{...n,label:n.label+'（mock 修改）'}:n)},'Mock 合成提案：重命名中心主题，保留配色和结构');await page.evaluate(proposal=>window.emitMockAgentEvent({type:'proposal',proposal}),p);}});
 await page.setViewportSize({width:680,height:820});await page.reload();await page.getByLabel('导图名称').waitFor();assert.equal(await page.locator('.assistant').count(),0);await page.getByRole('button',{name:'适应画布'}).click();cases.push({name:'narrow browser restart keeps canvas controls reachable',status:'PASS'});
 assert.deepEqual(errors,[]);
}finally{await writeFile(join(output,'report.json'),JSON.stringify({runtime:'Chromium, 2x DPI, real PersonalStore with mock bridge',cases,errors,paidCalls:0},null,2));await browser.close();await rm(dir,{recursive:true,force:true});}
