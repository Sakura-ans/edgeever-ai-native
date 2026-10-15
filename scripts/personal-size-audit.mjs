import {readdir,stat,readFile,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
const [mode,a,b,out]=process.argv.slice(2);
async function walk(root,dir=root){const rows=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())rows.push(...await walk(root,p));else if(e.isFile())rows.push({path:relative(root,p).replaceAll('\\','/'),bytes:(await stat(p)).size});}return rows;}
if(mode==='snapshot'){
 const files=await walk(b);const groups={};for(const f of files){const key=f.path.startsWith('resources/app.asar.unpacked/node_modules/')?f.path.split('/').slice(0,f.path.split('/')[3].startsWith('@')?5:4).join('/'):f.path.split('/').slice(0,2).join('/');groups[key]=(groups[key]??0)+f.bytes;}
 await writeFile(out,JSON.stringify({platform:process.platform,installerBytes:(await stat(a)).size,installedBytes:files.reduce((s,f)=>s+f.bytes,0),fontBytes:files.filter(f=>/\.(woff2?|ttf|otf)$/i.test(f.path)).reduce((s,f)=>s+f.bytes,0),groups,largest:files.sort((a,b)=>b.bytes-a.bytes).slice(0,30)},null,2));
}else if(mode==='compare'){
 const before=JSON.parse(await readFile(a));const after=JSON.parse(await readFile(b));const metrics={};for(const key of ['installerBytes','installedBytes','fontBytes'])metrics[key]={before:before[key],after:after[key],saved:before[key]-after[key],reductionPercent:before[key]?(before[key]-after[key])/before[key]*100:null};
 const result={baseline:'790b45ef09b6b868a66d9f6e38b4df27e81a6c70',commit:process.env.GITHUB_SHA,method:'Actual NSIS exe and recursive regular-file byte sums at same installation path; same Electron and NSIS settings. Font cost included.',metrics,before,after};await writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(metrics));
}else throw new Error('Expected snapshot or compare');
