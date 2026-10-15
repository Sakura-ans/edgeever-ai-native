import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,mkdir,copyFile,readdir,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
const require=createRequire(resolve('apps/web/package.json'));
const fontRoot=dirname(require.resolve('@fontsource-variable/noto-sans-sc/package.json'));
const output=resolve('apps/web/public');
await mkdir(join(output,'fonts'),{recursive:true});await mkdir(join(output,'licenses'),{recursive:true});
const css=await readFile(join(fontRoot,'index.css'),'utf8');
const files=[...new Set([...css.matchAll(/url\(\.\/(files\/[^)]+)\)/g)].map(m=>m[1]))];
// All upstream unicode partitions, unchanged; never subset from application text.
const expected=new Set([...files.map(file=>file.split('/').at(-1)),'noto-sans-sc.css','manifest.json']);
for(const name of await readdir(join(output,'fonts')))if(!expected.has(name))await rm(join(output,'fonts',name),{force:true});
for(const file of files)await copyFile(join(fontRoot,file),join(output,'fonts',file.split('/').at(-1)));
await writeFile(join(output,'fonts','noto-sans-sc.css'),css.replaceAll('./files/','./'));
await copyFile(join(fontRoot,'LICENSE'),join(output,'licenses','NotoSansSC-OFL.txt'));
await copyFile('LICENSE',join(output,'licenses','EdgeEver-AGPL-3.0.txt'));
await copyFile('NOTICE',join(output,'licenses','NOTICE.txt'));
// Retain notices from the installed direct runtime packages. Transitive package
// licenses also remain in app.asar; the renderer dependencies are bundled here.
for(const [workspace,names] of [['apps/web',['@antv/x6','react','react-dom']],['packages/shared',['@dagrejs/dagre','js-base64']],['apps/desktop',['@anthropic-ai/claude-agent-sdk','zod']]]){
 for(const name of names){
  const dir=resolve(workspace,'node_modules',name);
  for(const file of await readdir(dir))if(/^(license|notice|copyright)/i.test(file))await copyFile(join(dir,file),join(output,'licenses',`${name.replaceAll('/','-')}-${file}`));
 }
}
console.log(`Prepared ${files.length} unchanged local font partitions and license notices`);

await copyFile('apps/desktop/node_modules/@anthropic-ai/claude-agent-sdk/README.md',join(output,'licenses','Claude-Agent-SDK-README.md'));
const manifest=[];
for(const file of files){const data=await readFile(join(fontRoot,file));manifest.push({file:file.split('/').at(-1),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
await writeFile(join(output,'fonts','manifest.json'),JSON.stringify({package:'@fontsource-variable/noto-sans-sc',version:'5.3.0',license:'OFL-1.1',policy:'All partitions from upstream index.css; unchanged bytes',files:manifest},null,2));
