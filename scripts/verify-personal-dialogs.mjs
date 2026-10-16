import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(resolve('apps/desktop/package.json'));
const executable=require('electron');
const output=resolve('artifacts/native-dialogs');await mkdir(output,{recursive:true});
const dir=await mkdtemp(join(tmpdir(),'mind-native-dialog-'));
try {
 for(const [kind,key] of [['startup','Return'],['runtime','Escape']]){
  const result=join(dir,`${kind}.json`),entry=join(dir,`${kind}.cjs`),title=kind==='startup'?'EdgeEver Mind 无法启动':'EdgeEver Mind 运行异常';
  await writeFile(entry,`const {app,dialog}=require('electron');const fs=require('node:fs');app.whenReady().then(async()=>{const {nativeErrorOptions}=await import(${JSON.stringify(pathToFileURL(resolve('apps/desktop/src/main/personal-dialogs.mjs')).href)});const options=nativeErrorOptions(new Error('SYNTHETIC-secret /private/path'),${JSON.stringify(kind==='startup'?'WORKSPACE_READ':'RUNTIME_FAILURE')},${JSON.stringify(title)});const result=${kind==='runtime'?'dialog.showMessageBoxSync(options)':'(await dialog.showMessageBox(options)).response'};fs.writeFileSync(${JSON.stringify(result)},JSON.stringify({options,response:result}));app.exit(0);});`);
  const child=spawn(executable,['--no-sandbox',`--user-data-dir=${join(dir,kind)}`,entry],{stdio:'ignore'});
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Electron exited ${code}`)));});
  // Bounded polling waits for the actual OS window, not an arbitrary sleep.
  try {
   const deadline=Date.now()+15000;let window;
   while(Date.now()<deadline){try{window=execFileSync('xdotool',['search','--onlyvisible','--name',title],{stdio:['ignore','pipe','ignore']}).toString().trim().split('\n').at(-1);if(window)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
   assert.ok(window,'Native dialog must become visible');
   execFileSync('import',['-window',window,join(output,`${kind}-chinese.png`)]);
   execFileSync('xdotool',['windowfocus','--sync',window,'key',key]);
   await Promise.race([done,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Dialog did not close')),5000);timer.unref();})]);
   const evidence=JSON.parse(await readFile(result,'utf8'));assert.equal(evidence.response,0);assert.deepEqual(evidence.options.buttons,['关闭应用']);assert.equal(evidence.options.defaultId,0);assert.equal(evidence.options.cancelId,0);assert.doesNotMatch(JSON.stringify(evidence),/SYNTHETIC|private/);
   await writeFile(join(output,`${kind}.json`),JSON.stringify(evidence,null,2));console.log(`PASS native Linux ${kind}: Chinese close button; ${key} safely closes`);
  }finally{if(child.exitCode===null)child.kill();}
 }
}finally{await rm(dir,{recursive:true,force:true});}
