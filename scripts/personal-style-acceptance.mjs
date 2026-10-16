import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
// Shared behavioral suite: the native caller uses the installed app and real IPC.
export async function verifyStyles({page,snapshot,restart,shot,check,emitProposal}) {
 const saved=()=>expect(page.getByRole('status')).toHaveText('已保存到本机');
 const current=async()=>{const title=await page.getByLabel('导图名称').inputValue();return (await snapshot()).maps.find(m=>m.title===title);};
 const panel=async()=>{const b=page.getByRole('button',{name:'◈ 主题',exact:true});if(await b.getAttribute('aria-pressed')!=='true')await b.click();};
 await check('local Chinese font is loaded; narrow drawers remain mutually exclusive',async()=>{
  const fonts=await page.evaluate(async()=>{const loaded=await document.fonts.load('500 16px "Noto Sans SC Variable"','中文导图 ABC 0123456789');await document.fonts.ready;return loaded.map(f=>({family:f.family,status:f.status}));});
  assert.ok(fonts.length>0,'Local Chinese font faces must exist, not only a system fallback');assert.ok(fonts.every(f=>f.status==='loaded'&&f.family.includes('Noto Sans SC')));
  const verified=await page.evaluate(async()=>{const manifest=await fetch('/fonts/manifest.json').then(r=>r.json());let count=0;for(const file of manifest.files){const bytes=await fetch('/fonts/'+file.file).then(r=>r.arrayBuffer());if(bytes.byteLength!==file.bytes)throw new Error('Font size mismatch: '+file.file);const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(digest!==file.sha256)throw new Error('Font hash mismatch: '+file.file);count++;}return count;});assert.equal(verified,101);
  await page.setViewportSize({width:680,height:820});await page.getByRole('button',{name:'◈ 主题',exact:true}).click();await expect(page.locator('.library')).toHaveCount(0);await page.getByRole('button',{name:'☷ 导图库'}).click();await expect(page.locator('.assistant')).toHaveCount(0);await page.getByRole('button',{name:'收起导图库',exact:true}).click();await expect(page.locator('.library')).toHaveCount(0);await page.setViewportSize({width:1440,height:950});await page.getByRole('button',{name:'☷ 导图库'}).click();
 });
 await check('all 13 color presets are selectable and keep exact node geometry',async()=>{
  await panel();const before=(await current()).document.nodes;
  for(const id of ['plain','brand','cosmos','dune','slate','prism','sunrise','marine','blossom','mint','macaron','parchment','studio']){
   await page.locator(`[data-theme-id="${id}"]`).click();await page.getByRole('button',{name:'应用配色',exact:true}).click();await saved();assert.equal((await current()).document.theme,id);assert.deepEqual((await current()).document.nodes,before);
  }
 });
 await check('preview cancellation and closing theme panel never write a revision',async()=>{
  const before=await snapshot();await page.locator('[data-theme-id=prism]').click();await expect(page.getByRole('region',{name:'主题预览'})).toBeVisible();await page.getByRole('button',{name:'取消预览'}).click();assert.deepEqual(await snapshot(),before);
  await page.locator('[data-theme-id=brand]').click();await page.getByRole('button',{name:'收起右侧面板'}).click();assert.deepEqual(await snapshot(),before);await panel();await expect(page.getByRole('region',{name:'主题预览'})).toHaveCount(0);
 });
 await check('all 13 structures reflow through shared layout and undo restores exact coordinates',async()=>{
  for(const id of ['map','line','capsule','box','circle','ellipse','hexagon','logic','brace','org','tree','timeline','fishbone']){
   const before=(await current()).document;await page.locator(`[data-structure-id="${id}"]`).click();await saved();assert.equal((await current()).document.structure,id);
   await page.getByRole('button',{name:'撤销',exact:true}).click();await saved();assert.deepEqual((await current()).document,before);
  }
 });
 await check('styled AI mock approval and undo retain original theme and structure',async()=>{
  await page.locator('[data-structure-id=org]').click();await saved();const m=await current();await emitProposal(m);await expect(page.getByRole('dialog',{name:'AI 修改预览'})).toBeVisible();await shot('24-styled-ai-preview-mock');await page.getByRole('button',{name:'确认应用 · 可撤销'}).click();await saved();const after=await current();assert.equal(after.document.theme,m.document.theme);assert.equal(after.document.structure,m.document.structure);
  await page.getByRole('button',{name:'撤销',exact:true}).click();await saved();assert.deepEqual((await current()).document,m.document);
 });
 await check('same map in both shells preserves document, coordinates and style; restart persists shell',async()=>{
  await panel();await page.locator('[data-theme-id=parchment]').click();await page.getByRole('button',{name:'应用配色'}).click();await saved();await page.locator('[data-structure-id=map]').click();await saved();
  await page.getByRole('button',{name:'适应画布'}).click();await page.locator('.assistant').evaluate(el=>el.scrollTop=0);await shot('23-theme-library');await page.getByRole('button',{name:'收起右侧面板'}).click();
  if(await page.locator('html').getAttribute('data-shell')!=='paper')await page.getByLabel('切换外壳').click();await page.getByRole('button',{name:'适应画布'}).click();await shot('21-warm-paper');const before=(await current()).document,title=(await current()).title;
  await page.getByLabel('切换外壳').click();await expect(page.locator('html')).toHaveAttribute('data-shell','studio');await shot('22-dark-studio');assert.deepEqual((await current()).document,before);
  page=await restart();await expect(page.locator('html')).toHaveAttribute('data-shell','studio');await page.getByRole('button',{name:title,exact:true}).click();assert.deepEqual((await current()).document,before);
 });
 await check('sidebar collapse persists; narrow window, full Chinese labels and keyboard undo',async()=>{
  await page.getByRole('button',{name:'☷ 导图库'}).click();await expect(page.locator('.library')).toHaveCount(0);await page.getByRole('button',{name:'☰ 大纲'}).click();await expect(page.locator('.outline-panel')).toHaveCount(0);
  page=await restart();await expect(page.locator('.library')).toHaveCount(0);await expect(page.locator('.outline-panel')).toHaveCount(0);
  await expect(page.locator('.assistant')).toHaveCount(0);await page.setViewportSize({width:680,height:820});
  const before=(await current()).document;await page.getByLabel('主题内容').fill('长中文主题：离线保存与可撤销编辑，认真记录每一个想法。'.repeat(5));await saved();await page.getByLabel('主题内容').press('Tab');await page.keyboard.press('Control+z');await saved();assert.deepEqual((await current()).document,before);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await shot('25-narrow-keyboard');
  await page.setViewportSize({width:1440,height:950});await page.getByRole('button',{name:'☷ 导图库'}).click();await page.getByRole('button',{name:'☰ 大纲'}).click();
 });
 await check('narrow resizing leaves canvas controls unobstructed',async()=>{
  await page.setViewportSize({width:680,height:820});await expect(page.locator('.assistant')).toHaveCount(0);await page.getByRole('button',{name:'适应画布'}).click();
  await page.setViewportSize({width:1440,height:950});await page.getByRole('button',{name:'✧ AI 助手',exact:true}).click();await expect(page.locator('.assistant')).toBeVisible();await page.setViewportSize({width:680,height:820});await expect(page.locator('.assistant')).toHaveCount(0);await page.getByRole('button',{name:'适应画布'}).click();await page.setViewportSize({width:1440,height:950});
 });
 return page;
}
