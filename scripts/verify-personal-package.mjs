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
 await page.getByLabel('主题内容').fill('Packaged save check');
 await expect(page.getByRole('status')).toHaveText('已保存到本机');
 await page.reload();
 await expect(page.getByLabel('主题内容')).toHaveValue('Packaged save check');
 const nativePath=await application.evaluate(async ({app})=>{
   const {pathToFileURL}=await import('node:url');
   const path=await import('node:path');
   const module=await import(pathToFileURL(path.join(app.getAppPath(),'src/main/personal-ai.mjs')).href);
   const filename=module.resolvePersonalAgentExecutable();
   const {existsSync}=await import('node:fs');
   return {exists:existsSync(filename),unpacked:filename.includes('app.asar.unpacked')};
 });
 expect(nativePath).toEqual({exists:true,unpacked:true});
 console.log('PASS: unpacked Electron launch, local create/save/reload, bundled SDK native binary; no provider calls');
} finally {if(application) await application.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:500});}
