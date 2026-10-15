import {compactReport} from './personal-compact-report.mjs';
import {verifyStyles} from './personal-style-acceptance.mjs';
import {_electron as electron,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
const executable=resolve(process.argv[2]);
const output=resolve(process.env.MIND_QA_OUTPUT ?? 'artifacts/personal-acceptance');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'mind-acceptance-'));
const report={baseline:'a9433f1460bdecc5e89d95ee093fceab91808ebc',commit:process.env.GITHUB_SHA ?? 'local',platform:process.platform,source:process.env.MIND_INSTALLER_TESTED === '1' ? 'NSIS-installed Electron' : 'unpacked Electron',firstLaunchNetworkBlock:process.env.MIND_OFFLINE_FIREWALL === '1' ? 'Windows outbound firewall configured before first launch' : 'renderer/session network blocked after launch (not first-launch OS isolation)',syntheticDataOnly:true,paidProviderCalls:0,cases:[],screenshots:[],limitations:['No real DeepSeek requests or key used.','AI events are injected by the debugger into the live store; actual proposal/approval IPC and filesystem are used.','Native file picker selections and secure-storage failure are injected; native success-path crypto is real on Windows.','Running-agent cancellation and concurrent prompt reservation are tested with the mock SDK unit suite; native UI here checks idle cancellation and no-key failure.','CI virtual Windows desktop is not a physical consumer computer.']};
let application,page;let allowDialog=true;const errors=[];
const env={...process.env,APPDATA:join(profile,'environment-decoy'),XDG_CONFIG_HOME:join(profile,'environment-decoy')};
const saved=async()=>{await expect(page.getByRole('status')).toHaveText('已保存到本机');};
async function shot(name){const filename=`${name}.png`;await page.screenshot({animations:'disabled',path:join(output,filename)});report.screenshots.push({file:filename,source:`${process.platform} ${report.source}`,synthetic:true});}
async function check(name,fn){const start=Date.now();try{await fn();report.cases.push({name,status:'PASS',milliseconds:Date.now()-start});console.log(`PASS ${name}`);}catch(error){console.error('FAIL',name,String(error));report.cases.push({name,status:'FAIL',error:String(error),milliseconds:Date.now()-start});if(page && !page.isClosed()) await shot('failure').catch(()=>{});throw error;}}
async function launch(scale=1){
 application=await electron.launch({executablePath:executable,args:[`--user-data-dir=${join(profile,'EdgeEverMind')}`,`--force-device-scale-factor=${scale}`],env,timeout:60000});page=await application.firstWindow();
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>allowDialog ? dialog.accept() : dialog.dismiss());
 await application.evaluate(({session})=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,callback)=>callback({cancel:true})));
 await expect(page.getByRole('button',{name:'☷ 导图库'})).toBeVisible();
 assert.equal(await application.evaluate(({app})=>app.getPath('userData')),join(profile,'EdgeEverMind'));
}
async function create(title){await page.getByRole('button',{name:'＋ 新建导图'}).click();await page.getByLabel('新导图名称').fill(title);await page.getByRole('button',{name:'创建',exact:true}).click();await page.getByLabel('主题内容').waitFor();await saved();}
async function snapshot(){return page.evaluate(()=>window.edgeeverMind.load());}
async function disk(){const path=await application.evaluate(({app})=>process.getBuiltinModule('path').join(app.getPath('userData'),'maps','workspace.json'));return readFile(path,'utf8');}
async function picker(kind,filename,canceled=false){await application.evaluate(({dialog},input)=>{const key=input.kind==='save'?'showSaveDialog':'showOpenDialog';globalThis.__qaDialogs ??={};globalThis.__qaDialogs[key] ??=dialog[key];dialog[key]=async()=>input.kind==='save'?{canceled:input.canceled,filePath:input.filename}:{canceled:input.canceled,filePaths:[input.filename]};},{kind,filename,canceled});}
async function bindLiveStore(){
 await application.evaluate(({app})=>{const path=process.getBuiltinModule('path');const require=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'));const {PersonalStore}=require(path.join(app.getAppPath(),'src/main/personal-store.mjs'));const original=PersonalStore.prototype.snapshot;PersonalStore.prototype.snapshot=function(){globalThis.__qaStore=this;PersonalStore.prototype.snapshot=original;return original.call(this);};});
 await snapshot();
}
async function proposal(label){await application.evaluate(({BrowserWindow},label)=>{const store=globalThis.__qaStore;const m=store.snapshot().maps[0];const document=structuredClone(m.document);document.nodes[0].label=label;const p=store.propose(m.id,m.revision,document,'合成 AI 提案：修改中心主题，等待人工确认');BrowserWindow.getAllWindows()[0].webContents.send('mind:agent-event',{type:'proposal',proposal:p});},label);await expect(page.getByRole('dialog',{name:'AI 修改预览'})).toBeVisible();}
try {
 await launch();
 await check('fresh profile: no account or login required',async()=>{assert.equal((await snapshot()).maps.length,0);await expect(page.getByText('把想法放到一张图上')).toBeVisible();await shot('01-first-offline-launch');});
 await check('create dialog cancel writes nothing',async()=>{await page.getByRole('button',{name:'＋ 新建导图'}).click();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal((await snapshot()).maps.length,0);});
 await check('offline create, rename, canvas and outline, autosave',async()=>{
  await create('合成验收导图');await page.getByLabel('导图名称').fill('离线旅行计划');await page.getByLabel('主题内容').fill('合成主题：周末旅行');await saved();
  await page.getByRole('button',{name:'添加子主题',exact:true}).click();await expect(page.locator('.outline')).toHaveCount(2);await expect(page.getByLabel('主题内容')).toHaveValue('新主题');await page.getByLabel('主题内容').fill('准备清单');await saved();
  await expect(page.locator('.canvas .x6-node:visible')).toHaveCount(2);await expect(page.locator('.outline').filter({hasText:'准备清单'})).toBeVisible();await shot('02-offline-canvas-outline');
  const node=page.locator('.canvas .x6-node:visible').first();const box=await node.boundingBox();const before=(await snapshot()).maps[0].document.nodes[0];await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+25,{steps:5});await page.mouse.up();await saved();const after=(await snapshot()).maps[0].document.nodes[0];assert.notEqual(after.x,before.x);
 });
 await check('real process restart restores local data and persistent undo/redo',async()=>{
  await application.close();application=null;await launch();await expect(page.getByLabel('导图名称')).toHaveValue('离线旅行计划');assert.equal((await snapshot()).maps[0].document.nodes[1].label,'准备清单');
  const before=(await snapshot()).maps[0].document;await page.getByRole('button',{name:'撤销',exact:true}).click();await saved();assert.notDeepEqual((await snapshot()).maps[0].document,before);await page.getByRole('button',{name:'重做',exact:true}).click();await saved();assert.deepEqual((await snapshot()).maps[0].document,before);await shot('03-restarted-workspace');
 });
 await check('subtree delete, cancel and undo restore all descendants',async()=>{
  await page.locator('.outline').filter({hasText:'准备清单'}).click();await page.getByRole('button',{name:'添加子主题',exact:true}).click();await expect(page.locator('.outline')).toHaveCount(3);await page.getByLabel('主题内容').fill('合成子项：衣物');await saved();
  await page.locator('.outline').filter({hasText:'准备清单'}).click();const before=(await snapshot()).maps[0].document;allowDialog=false;await page.getByRole('button',{name:'删除主题',exact:true}).click();assert.deepEqual((await snapshot()).maps[0].document,before);allowDialog=true;
  await page.getByRole('button',{name:'删除主题',exact:true}).click();await saved();assert.equal((await snapshot()).maps[0].document.nodes.length,1);await page.getByRole('button',{name:'撤销',exact:true}).click();await saved();assert.deepEqual((await snapshot()).maps[0].document,before);
 });
 await check('export/import round trip, picker cancellation, invalid import does not overwrite',async()=>{
  const backup=join(profile,'backup.json');await picker('save',backup);await page.getByRole('button',{name:'导出完整备份'}).click();await saved();assert.deepEqual(JSON.parse(await readFile(backup,'utf8')),(await snapshot()));
  const before=await disk();await picker('open',backup,true);await page.getByRole('button',{name:'导入备份为副本'}).click();await saved();assert.equal(await disk(),before);
  await picker('open',backup);await page.getByRole('button',{name:'导入备份为副本'}).click();await saved();assert.equal((await snapshot()).maps.length,2);await shot('04-backup-import-copies');
  const broken=join(profile,'broken.json');await writeFile(broken,'not-json');const preserved=await disk();await picker('open',broken);await page.getByRole('button',{name:'导入备份为副本'}).click();await expect(page.getByRole('alert')).toBeVisible();assert.equal(await disk(),preserved);await shot('05-invalid-backup-protected');await page.getByRole('button',{name:'重新读取'}).click();await saved();
 });
 await check('delete cancellation preserves map; confirmed delete removes selected map',async()=>{
  const before=await disk();allowDialog=false;await page.getByRole('button',{name:'删除导图',exact:true}).click();assert.equal(await disk(),before);allowDialog=true;
  await page.getByRole('button',{name:'删除导图',exact:true}).click();await saved();assert.equal((await snapshot()).maps.length,1);
 });
 await bindLiveStore();
 await check('AI mock preview and rejection do not write to disk',async()=>{const before=await disk();await proposal('AI 合成修改');assert.equal(await disk(),before);await expect(page.locator('.change-card')).toHaveCount(1);await expect(page.locator('.change-card')).toContainText('重命名');assert.equal(await page.locator('.proposal pre').count(),0);await shot('06-ai-proposal-preview');await page.getByRole('button',{name:'拒绝，不修改'}).click();await expect(page.getByRole('dialog',{name:'AI 修改预览'})).toHaveCount(0);assert.equal(await disk(),before);await shot('07-ai-rejected-unchanged');});
 await check('AI mock approval, duplicate approval rejection, undo rollback',async()=>{
  const original=(await snapshot()).maps[0].document;await proposal('AI 已确认主题');const id=await application.evaluate(()=>[...globalThis.__qaStore.proposals.keys()][0]);
  await page.getByRole('button',{name:'确认应用 · 可撤销'}).click();await saved();assert.equal((await snapshot()).maps[0].document.nodes[0].label,'AI 已确认主题');const before=await disk();
  const duplicate=await page.evaluate(async id=>{try{await window.edgeeverMind.approve(id);return '';}catch(e){return String(e);}},id);assert.match(duplicate,/expired/);assert.equal(await disk(),before);await shot('08-ai-approved');
  await page.getByRole('button',{name:'撤销',exact:true}).click();await saved();assert.deepEqual((await snapshot()).maps[0].document,original);await shot('09-ai-undo-rollback');
 });
 await check('AI stale revision fails visibly without overwriting newer edit',async()=>{
  await proposal('不可覆盖的新提案');await page.evaluate(async()=>{const s=await window.edgeeverMind.load();const m=s.maps[0];await window.edgeeverMind.command({type:'rename',id:m.id,revision:m.revision,title:'更晚的本地修改'});});const before=await disk();
  await page.getByRole('button',{name:'确认应用 · 可撤销'}).click();await expect(page.getByRole('alert')).toContainText('Revision conflict');assert.equal(await disk(),before);await shot('10-revision-conflict');await page.getByRole('button',{name:'重新读取'}).click();await saved();
 });
 await check('AI request without credentials fails safely and cancellation is idempotent',async()=>{
  await page.evaluate(()=>window.edgeeverMind.clearConfig());const before=await disk();await page.getByLabel('AI 请求').fill('只用于测试：请添加一个主题');await page.getByRole('button',{name:'发送给 DeepSeek'}).click();await expect(page.getByRole('alert')).toBeVisible();assert.equal(await disk(),before);await page.evaluate(async()=>{await window.edgeeverMind.cancel();await window.edgeeverMind.cancel();});await shot('11-ai-no-credentials-error');await page.getByRole('button',{name:'重新读取'}).click();await saved();
 });
 if(process.platform==='win32') await check('Windows native safeStorage encrypts synthetic key; renderer masks and never returns plaintext',async()=>{
  await page.getByRole('button',{name:'DeepSeek 设置'}).click();await page.getByLabel('模型标识').fill('synthetic-model-no-provider-call');const keyInput=page.locator('input[type=password]');await keyInput.fill('SYNTHETIC-NOT-A-REAL-KEY-123');assert.equal(await keyInput.getAttribute('type'),'password');await shot('12-masked-synthetic-key');await page.getByRole('button',{name:'保存设置'}).click();await saved();
  const c=await page.evaluate(()=>window.edgeeverMind.config());assert.deepEqual(c,{model:'synthetic-model-no-provider-call',hasKey:true});
  const encrypted=await application.evaluate(({app})=>process.getBuiltinModule('fs').readFileSync(process.getBuiltinModule('path').join(app.getPath('userData'),'deepseek.bin')).toString('base64'));assert.ok(!Buffer.from(encrypted,'base64').includes(Buffer.from('SYNTHETIC-NOT-A-REAL-KEY-123')));
  await page.getByRole('button',{name:'DeepSeek 设置'}).click();await expect(page.locator('input[type=password]')).toHaveValue('');await shot('13-key-saved-no-plaintext');await page.getByRole('button',{name:'关闭',exact:true}).click();await page.evaluate(()=>window.edgeeverMind.clearConfig());
 });
 await check('safeStorage unavailable refuses credential write and reports error',async()=>{
  await application.evaluate(({safeStorage})=>{globalThis.__qaSecure=safeStorage.isEncryptionAvailable;safeStorage.isEncryptionAvailable=()=>false;});
  await page.getByRole('button',{name:'DeepSeek 设置'}).click();await page.getByLabel('模型标识').fill('synthetic');await page.locator('input[type=password]').fill('SYNTHETIC-FAIL-CLOSED');await page.getByRole('button',{name:'保存设置'}).click();await expect(page.getByRole('alert')).toContainText('secure credential storage is unavailable');await shot('14-secure-storage-refusal');
  const exists=await application.evaluate(({app})=>process.getBuiltinModule('fs').existsSync(process.getBuiltinModule('path').join(app.getPath('userData'),'deepseek.bin')));assert.equal(exists,false);
  await application.evaluate(({safeStorage})=>{safeStorage.isEncryptionAvailable=globalThis.__qaSecure;});await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'重新读取'}).click();await saved();
 });
 await check('close immediately after typing drains queued saves',async()=>{await page.getByLabel('主题内容').fill('退出前最后一次合成修改');await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await application.close();application=null;await launch();assert.ok((await snapshot()).maps[0].document.nodes.some(n=>n.label==='退出前最后一次合成修改'));await page.locator('.outline').filter({hasText:'退出前最后一次合成修改'}).click();await expect(page.getByLabel('主题内容')).toHaveValue('退出前最后一次合成修改');await shot('15-close-save-restored');});
 await check('readable multi-change proposal shows paths, counts and zero-write rejection',async()=>{
  await bindLiveStore();const before=await disk();
  await application.evaluate(({BrowserWindow})=>{const store=globalThis.__qaStore,m=store.snapshot().maps[0],doc=structuredClone(m.document);doc.nodes[0].label='新项目名称';const leaf=doc.nodes.pop();doc.edges=doc.edges.filter(e=>e.target!==leaf.id);const child=doc.nodes[1];child.label='新的准备清单';const root=doc.nodes[0];doc.nodes.push({...root,id:'synthetic-new',parentId:root.id,label:'新增：安全验收'});doc.edges.push({id:'synthetic-edge',source:root.id,target:'synthetic-new'});const p=store.propose(m.id,m.revision,doc,'程序合成的预览验收：删除一项，新增一项，重命名两个主题。');BrowserWindow.getAllWindows()[0].webContents.send('mind:agent-event',{type:'proposal',proposal:p});});
  await expect(page.getByRole('dialog',{name:'AI 修改预览'})).toBeVisible();await expect(page.locator('.change-counts')).toContainText('新增 1');await expect(page.locator('.change-counts')).toContainText('删除 1');await expect(page.locator('.change-counts')).toContainText('重命名 2');await expect(page.locator('.change-card')).toHaveCount(4);await shot('17-readable-chinese-preview');await page.getByRole('button',{name:'拒绝，不修改'}).click();assert.equal(await disk(),before);
 });
 await check('project map imports, opens, edits, undoes and survives restart',async()=>{
  const sample=resolve('examples/edgeever-mind-project.json');await copyFile(sample,join(output,'edgeever-mind-project.json'));await picker('open',sample);await page.getByRole('button',{name:'导入备份为副本'}).click();await saved();await page.getByRole('button',{name:'EdgeEver Mind 项目导图（程序生成）',exact:true}).click();await expect(page.locator('.outline')).toHaveCount(28);await page.getByRole('button',{name:'适应画布'}).click();await shot('18-project-map-native-editable');
  const original=(await snapshot()).maps.at(-1);assert.equal(original.document.nodes.length,28);await page.getByLabel('主题内容').fill('项目导图 · 可编辑验证');await saved();await page.getByRole('button',{name:'撤销',exact:true}).click();await saved();assert.deepEqual((await snapshot()).maps.at(-1).document,original.document);await application.close();application=null;await launch();await page.getByRole('button',{name:'EdgeEver Mind 项目导图（程序生成）',exact:true}).click();await expect(page.locator('.outline')).toHaveCount(28);await page.getByRole('button',{name:'适应画布'}).click();await shot('19-project-map-restarted');
 });
 await check('default DeepSeek model is non-secret and configurable',async()=>{await page.getByRole('button',{name:'DeepSeek 设置'}).click();await expect(page.getByLabel('模型标识')).toHaveValue('deepseek-flash');await expect(page.locator('input[type=password]')).toHaveValue('');await shot('20-deepseek-default-no-key');await page.getByRole('button',{name:'关闭',exact:true}).click();});
 page=await verifyStyles({page,snapshot,shot,check,restart:async()=>{await application.close();application=null;await launch();return page;},emitProposal:async m=>{
  await bindLiveStore();await application.evaluate(({BrowserWindow},m)=>{const store=globalThis.__qaStore;const document={...m.document,theme:'prism',structure:'fishbone',nodes:m.document.nodes.map((n,i)=>i===0?{...n,label:n.label+'（mock 修改）'}:n)};const p=store.propose(m.id,m.revision,document,'Mock 合成提案：重命名中心主题，保留配色和结构');BrowserWindow.getAllWindows()[0].webContents.send('mind:agent-event',{type:'proposal',proposal:p});},m);
 }});
 await check('native 2x DPI restart preserves workspace and renders Chinese map',async()=>{
  const before=await snapshot();await application.close();application=null;await launch(2);assert.equal(await page.evaluate(()=>window.devicePixelRatio),2);assert.deepEqual(await snapshot(),before);
  await page.getByRole('button',{name:'EdgeEver Mind 项目导图（程序生成）',exact:true}).click();await expect(page.locator('.canvas .x6-node:visible')).toHaveCount(28);await page.getByRole('button',{name:'适应画布'}).click();await shot('26-native-high-dpi');
 });
 await check('styled native export/import preserves style, geometry and undo history',async()=>{
  const before=(await snapshot()).maps;const backup=join(profile,'styled-backup.json');await picker('save',backup);await page.getByRole('button',{name:'导出完整备份'}).click();await saved();const exported=JSON.parse(await readFile(backup,'utf8'));assert.deepEqual(exported.maps,before);
  await picker('open',backup);await page.getByRole('button',{name:'导入备份为副本'}).click();await saved();const imported=(await snapshot()).maps.slice(before.length);assert.equal(imported.length,before.length);for(let i=0;i<before.length;i++){assert.deepEqual(imported[i].document,before[i].document);assert.deepEqual(imported[i].undo,before[i].undo);}
 });
 await check('no renderer exceptions' ,async()=>assert.deepEqual(errors,[]));
 await application.close();application=null;
 if(process.platform==='win32') await check('corrupt on-disk workspace startup fails closed with native error dialog',async()=>{
  const corrupt=await mkdtemp(join(tmpdir(),'mind-corrupt-'));const data=join(corrupt,'EdgeEverMind','maps');await mkdir(data,{recursive:true});await writeFile(join(data,'workspace.json'),'CORRUPT-SYNTHETIC');
  const child=spawn(executable,[`--user-data-dir=${join(corrupt,'EdgeEverMind')}`],{env:{...process.env,APPDATA:corrupt},stdio:'ignore'});
  try {
   const capture=join(output,'16-corrupt-workspace-native-dialog.png');
   const script=`Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $end=(Get-Date).AddSeconds(20); do { Start-Sleep -Milliseconds 300; $p=Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue } while ($p -and !$p.MainWindowTitle -and (Get-Date) -lt $end); if (!$p -or !$p.MainWindowTitle) { throw 'Native error dialog did not appear' }; $bounds=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap($bounds.Width,$bounds.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($bounds.Location,[System.Drawing.Point]::Empty,$bounds.Size); $bmp.Save('${capture.replaceAll("'","''")}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose();$bmp.Dispose();Write-Output $p.MainWindowTitle`;
   const title=execFileSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',timeout:30000});assert.match(title,/EdgeEver/i);assert.equal(await readFile(join(data,'workspace.json'),'utf8'),'CORRUPT-SYNTHETIC');report.screenshots.push({file:'16-corrupt-workspace-native-dialog.png',source:'Windows desktop native error dialog',synthetic:true});
  } finally {child.kill();await new Promise(r=>setTimeout(r,1000));await rm(corrupt,{recursive:true,force:true,maxRetries:5,retryDelay:500});}
 });
} catch(error){console.error('Acceptance failure:',String(error));report.failure=String(error);process.exitCode=1;}
finally {
 if(application) await application.close().catch(()=>{});
 await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:500}).catch(()=>{});
 report.finishedAt=new Date().toISOString();report.passed=report.cases.filter(c=>c.status==='PASS').length;report.failed=report.cases.filter(c=>c.status==='FAIL').length;
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
 const lines=['# EdgeEver Mind acceptance evidence','',`Commit: ${report.commit}`,`Baseline: ${report.baseline}`,`Runtime: ${report.platform} / ${report.source}`,`Network: ${report.firstLaunchNetworkBlock}`,`Result: ${report.passed} passed; ${report.failed} failed`,'','## Cases',...report.cases.map(c=>`- ${c.status}: ${c.name}${c.error ? ` — ${c.error}`:''}`),'','## Screenshots',...report.screenshots.map(s=>`- [${s.file}](${s.file}) — ${s.source}`),'','## Limits',...report.limitations.map(x=>`- ${x}`),'','No paid model calls. All maps and credentials are synthetic.'];await writeFile(join(output,'report.md'),lines.join('\n')+'\n');
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>EdgeEver Mind 测试结果</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;background:#f5f7f5;color:#18251c}section{background:white;border:1px solid #d6ddd7;padding:24px;margin:24px 0;border-radius:12px}img{max-width:100%;border:1px solid #ccd4ce}small{color:#58685c}li{margin:10px 0}code{overflow-wrap:anywhere}</style><h1>EdgeEver Mind 实际运行测试</h1><p>${report.passed} 通过 / ${report.failed} 失败 · ${escape(report.platform)} · ${escape(report.source)}</p><p>提交 <code>${escape(report.commit)}</code></p><p>${escape(report.firstLaunchNetworkBlock)}</p><p>全部为合成导图；未调用真实 DeepSeek，未使用真实密钥。AI 提案经调试器注入，确认/拒绝走真实应用 IPC 与存储。图片是实际截图，没有重绘或拼接。</p><section><h2>逐项结果</h2><ul>${report.cases.map(c=>`<li><b>${c.status}</b> ${escape(c.name)}${c.error?`<pre>${escape(c.error)}</pre>`:''}</li>`).join('')}</ul></section>${report.screenshots.map(s=>`<section><h2>${escape(s.file)}</h2><small>${escape(s.source)} / synthetic test data</small><p><img src="${escape(s.file)}" alt="${escape(s.file)}"></p></section>`).join('')}<section><h2>验证边界</h2><ul>${report.limitations.map(x=>`<li>${escape(x)}</li>`).join('')}</ul></section></html>`;
 await writeFile(join(output,'index.html'),html);
 await compactReport(output,report);
 console.log(JSON.stringify({passed:report.passed,failed:report.failed,output}));
}
