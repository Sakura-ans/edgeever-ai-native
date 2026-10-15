import {test,expect} from 'bun:test';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,resolve,join} from 'node:path';
const require=createRequire(resolve('apps/web/package.json'));
test('font source includes all upstream partitions and local-only urls with OFL attribution',async()=>{
 const root=dirname(require.resolve('@fontsource-variable/noto-sans-sc/package.json'));
 const css=await readFile(join(root,'index.css'),'utf8');
 const files=[...new Set([...css.matchAll(/url\(\.\/(files\/[^)]+)\)/g)].map(m=>m[1]))];
 expect(files.length).toBe(101);expect(css).not.toMatch(/url\(['"]?https?:/);
 for(const f of files)expect((await readFile(join(root,f))).length).toBeGreaterThan(0);
 expect(await readFile(join(root,'LICENSE'),'utf8')).toContain('SIL OPEN FONT LICENSE');
 execFileSync(process.execPath,['scripts/prepare-mind-assets.mjs']);
 const manifest=JSON.parse(await readFile('apps/web/public/fonts/manifest.json','utf8'));
 expect(manifest.files.length).toBe(files.length);
 for(const f of files){const name=f.split('/').at(-1);const source=await readFile(join(root,f));const shipped=await readFile(join('apps/web/public/fonts',name));expect(shipped.equals(source)).toBe(true);expect(manifest.files.find(x=>x.file===name).sha256).toBe(createHash('sha256').update(source).digest('hex'));}
 const shippedCss=await readFile('apps/web/public/fonts/noto-sans-sc.css','utf8');expect(shippedCss).toBe(css.replaceAll('./files/','./'));
});
