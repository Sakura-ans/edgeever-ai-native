import {test,expect} from 'bun:test';
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
 const script=await readFile('scripts/prepare-mind-assets.mjs','utf8');expect(script).toContain('copyFile(join(fontRoot,file)');
});
