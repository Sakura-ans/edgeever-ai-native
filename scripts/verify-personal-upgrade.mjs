import {_electron as electron,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const [mode,executable,profile,evidence]=process.argv.slice(2);
const application=await electron.launch({executablePath:resolve(executable),args:[`--user-data-dir=${resolve(profile)}`],timeout:60000});
try{
 const page=await application.firstWindow();await expect(page.getByRole('status')).toHaveText('已保存到本机');
 if(mode==='seed'){
  await page.evaluate(async()=>{let s=await window.edgeeverMind.command({type:'create',title:'旧版工作区升级验收'});const m=s.maps[0];await window.edgeeverMind.command({type:'save',id:m.id,revision:m.revision,document:{...m.document,theme:'blossom',structure:'capsule',nodes:m.document.nodes.map(n=>({...n,label:'来自 790b45ef 的中文主题'}))}});});
  const state=await page.evaluate(()=>window.edgeeverMind.load());await writeFile(evidence,JSON.stringify(state,null,2));
 }else{
  const expected=JSON.parse(await readFile(evidence,'utf8'));assert.deepEqual(await page.evaluate(()=>window.edgeeverMind.load()),expected);
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByRole('status')).toHaveText('已保存到本机');await expect(page.getByLabel('主题内容')).toHaveValue('中心主题');
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.getByRole('status')).toHaveText('已保存到本机');await expect(page.getByLabel('主题内容')).toHaveValue('来自 790b45ef 的中文主题');
  await writeFile(evidence+'.result.json',JSON.stringify({status:'PASS',baseline:'790b45ef09b6b868a66d9f6e38b4df27e81a6c70',commit:process.env.GITHUB_SHA,platform:process.platform,method:'previous NSIS installed app seeds real profile; current NSIS installed to same path reads identical state and undoes/redoes',paidCalls:0},null,2));
 }
 console.log(`PASS cross-version ${mode}`);
}finally{await application.close();}
