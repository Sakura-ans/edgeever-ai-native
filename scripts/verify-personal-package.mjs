import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const executablePath=process.argv[2];
if (!executablePath) throw new Error('Provide the unpacked personal Electron executable');
const profile=await mkdtemp(join(tmpdir(),'edgeever-mind-package-'));
let application;
try {
 application=await electron.launch({executablePath:resolve(executablePath),env:{...process.env,APPDATA:profile,XDG_CONFIG_HOME:profile},timeout:60000});
 const page=await application.firstWindow();
 await application.evaluate(({session})=>{session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));});
 await expect(page.getByRole('button',{name:'＋ 新建导图'})).toBeVisible();
 page.on('dialog',dialog=>dialog.accept('Packaged offline smoke'));
 await page.getByRole('button',{name:'＋ 新建导图'}).click();
 await page.getByLabel('新导图名称').fill('Packaged offline smoke');
 await page.getByRole('button',{name:'创建',exact:true}).click();
 await page.getByLabel('主题内容').fill('Packaged save check');
 await expect(page.getByRole('status')).toHaveText('已保存到本机');
 await page.reload();
 await expect(page.getByLabel('主题内容')).toHaveValue('Packaged save check');
 const nativePath=await application.evaluate(({app})=>{
   // Inspector evaluation has no dynamic-import callback. Resolve dependencies
   // through Node's built-in module API inside the packaged main process.
   const {createRequire}=process.getBuiltinModule('module');
   const path=process.getBuiltinModule('path');
   const require=createRequire(path.join(app.getAppPath(),'package.json'));
   const sdkRequire=createRequire(require.resolve('@anthropic-ai/claude-agent-sdk'));
   const manifest=sdkRequire.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);
   const filename=path.join(path.dirname(manifest),process.platform === 'win32' ? 'claude.exe' : 'claude').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
   const version=process.getBuiltinModule('child_process').execFileSync(filename,['--version'],{encoding:'utf8',timeout:10000});
   return {exists:process.getBuiltinModule('fs').existsSync(filename),unpacked:filename.includes('app.asar.unpacked'),version};
 });
 expect(nativePath.exists).toBe(true);expect(nativePath.unpacked).toBe(true);expect(nativePath.version).toContain('Claude Code');
 console.log('PASS: unpacked Electron launch, local create/save/reload, bundled SDK native binary; no provider calls');
} finally {if(application) await application.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:500});}
