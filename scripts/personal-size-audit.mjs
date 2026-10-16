import {getRawHeader} from '@electron/asar';
import {readdir,stat,readFile,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
const [mode,a,b,out]=process.argv.slice(2);
async function walk(root,dir=root){const rows=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())rows.push(...await walk(root,p));else if(e.isFile())rows.push({path:relative(root,p).replaceAll('\\','/'),bytes:(await stat(p)).size});}return rows;}
if(mode==='snapshot'){
 const files=await walk(b);const groups={};for(const f of files){const key=f.path.startsWith('resources/app.asar.unpacked/node_modules/')?f.path.split('/').slice(0,f.path.split('/')[3].startsWith('@')?5:4).join('/'):f.path.split('/').slice(0,2).join('/');groups[key]=(groups[key]??0)+f.bytes;}
 const asarPackages={};
 function packed(tree,prefix=''){for(const [name,entry] of Object.entries(tree.files??{})){const path=prefix+name;if(entry.files)packed(entry,path+'/');else if(typeof entry.size==='number'&&!entry.unpacked){const parts=path.split('/');const group=parts[0]==='node_modules'?parts.slice(0,parts[1].startsWith('@')?3:2).join('/'):'application';asarPackages[group]=(asarPackages[group]??0)+entry.size;}}}
 packed(getRawHeader(join(b,'resources','app.asar')).header);
 await writeFile(out,JSON.stringify({asarPackages,asarAccounting:'Logical packed file bytes, excluding unpacked files; included inside installedBytes, not additional bytes.',platform:process.platform,installerBytes:(await stat(a)).size,installedBytes:files.reduce((s,f)=>s+f.bytes,0),fontBytes:files.filter(f=>/\.(woff2?|ttf|otf)$/i.test(f.path)).reduce((s,f)=>s+f.bytes,0),groups,largest:files.sort((a,b)=>b.bytes-a.bytes).slice(0,30)},null,2));
}else if(mode==='compare'){
 const before=JSON.parse(await readFile(a));const after=JSON.parse(await readFile(b));const metrics={};for(const key of ['installerBytes','installedBytes','fontBytes'])metrics[key]={before:before[key],after:after[key],saved:before[key]-after[key],reductionPercent:before[key]?(before[key]-after[key])/before[key]*100:null};
 const result={baseline:'cb001477eb655d9028cfb7af3aa0656a7f93bed4',commit:process.env.GITHUB_SHA,method:'Actual NSIS exe and recursive regular-file byte sums at same installation path; same Electron and NSIS settings. Font cost included.',metrics,before,after};await writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(metrics));
}else throw new Error('Expected snapshot or compare');
