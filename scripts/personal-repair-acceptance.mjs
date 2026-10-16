import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
// Runs unchanged against browser + real store and installed Windows + real IPC.
export async function verifyRepairs({page,snapshot,restart,diskFault,externalRename,aiMode,propose,shot,check}){
 const saved=()=>expect(page.getByRole('status')).toHaveText('已保存到本机',{timeout:15000});
 const map=async()=>{const title=await page.getByLabel('导图名称').inputValue();return (await snapshot()).maps.find(m=>m.title===title)??(await snapshot()).maps.at(-1);};
 const panel=async name=>{const b=page.getByRole('button',{name,exact:true});if(await b.getAttribute('aria-pressed')!=='true')await b.click();};
 const dismiss=async()=>{if(await page.getByRole('button',{name:'关闭错误提示'}).count())await page.getByRole('button',{name:'关闭错误提示'}).click();};
 if(!await page.getByRole('button',{name:'＋ 新建导图'}).isVisible())await page.getByRole('button',{name:'☷ 导图库'}).click();
 await page.getByRole('button',{name:'＋ 新建导图'}).click();await page.getByLabel('新导图名称').fill('十项修复验收');await page.getByRole('button',{name:'创建',exact:true}).click();await saved();
 await check('F1 write failure keeps recoverable draft; reload synchronizes buffers without false saved status',async()=>{
  const before=await map();await diskFault(true);await page.getByLabel('主题内容').fill('磁盘失败后保留的中文草稿');await expect(page.getByRole('alert')).toContainText('磁盘空间不足');assert.deepEqual((await map()).document,before.document);await diskFault(false);
  await page.getByRole('button',{name:'重新读取',exact:true}).click();await expect(page.getByLabel('主题内容')).toHaveValue(before.document.nodes[0].label);await expect(page.getByRole('status')).toContainText('有未保存草稿');await expect(page.getByRole('region',{name:'未保存草稿'})).toContainText('磁盘失败后保留的中文草稿');await shot('31-draft-recovery');
  await page.getByRole('button',{name:'重试保存草稿'}).click();await saved();assert.equal((await map()).document.nodes[0].label,'磁盘失败后保留的中文草稿');await page.getByRole('button',{name:'撤销',exact:true}).click();await saved();
 });
 await check('F1 conflict reload refreshes title; restart retains unsaved draft independently of workspace',async()=>{
  const before=await map();await externalRename(before.id,'外部较新名称');await page.getByLabel('导图名称').fill('冲突中的名称草稿');await expect(page.getByRole('alert')).toContainText('版本已变化');await page.getByRole('button',{name:'重新读取'}).click();await expect(page.getByLabel('导图名称')).toHaveValue('外部较新名称');await page.getByRole('button',{name:'放弃草稿，恢复本机内容'}).click();
  await diskFault(true);await page.getByLabel('主题内容').fill('重启恢复草稿');await expect(page.getByRole('alert')).toContainText('磁盘空间不足');await diskFault(false);page=await restart();await page.getByRole('button',{name:'外部较新名称',exact:true}).click();await expect(page.getByRole('region',{name:'未保存草稿'})).toContainText('重启恢复草稿');assert.notEqual((await map()).document.nodes[0].label,'重启恢复草稿');await page.getByRole('button',{name:'重试保存草稿'}).click();await saved();
 });
 await check('F2 synthetic composition lifecycle and Windows 229 boundary do not blur or trigger structure actions',async()=>{
  const count=(await map()).document.nodes.length;
  for(const label of ['主题内容','导图名称']){const input=page.getByLabel(label);await input.focus();await input.dispatchEvent('compositionstart');await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});await expect(input).toBeFocused();await input.dispatchEvent('keydown',{key:'Enter',keyCode:229});await expect(input).toBeFocused();await input.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});await expect(input).toBeFocused();await page.waitForTimeout(40);await input.dispatchEvent('keydown',{key:'Enter',keyCode:229,isComposing:false});await expect(input).toBeFocused();await input.press('Enter');await expect(input).not.toBeFocused();}
  assert.equal((await map()).document.nodes.length,count);
  const before=await snapshot();await page.getByRole('button',{name:'＋ 新建导图'}).click();const name=page.getByLabel('新导图名称');await name.dispatchEvent('compositionstart');await name.dispatchEvent('keydown',{key:'Enter',isComposing:true});await expect(name).toBeFocused();assert.deepEqual(await snapshot(),before);await name.dispatchEvent('compositionend');await page.waitForTimeout(40);await name.press('Escape');
 });
 await check('F5 continuous typing groups history while every edit persists; blur, selection and timeout split groups',async()=>{
  const input=page.getByLabel('主题内容');const before=await map();await input.fill('');await input.pressSequentially('ABCDEFGHIJ',{delay:20});await saved();let m=await map();assert.equal(m.document.nodes[0].label,'ABCDEFGHIJ');assert.equal(m.undo.length,before.undo.length+1);
  await input.press('Tab');await page.getByRole('button',{name:'撤销',exact:true}).click();await saved();await expect(input).toHaveValue(before.document.nodes[0].label);await page.getByRole('button',{name:'重做',exact:true}).click();await saved();await expect(input).toHaveValue('ABCDEFGHIJ');
  await input.fill('ABCDEFGHIJK');await saved();const split=(await map()).undo.length;await input.press('Tab');await input.fill('ABCDEFGHIJKL');await saved();assert.equal((await map()).undo.length,split+1);await page.waitForTimeout(1600);await input.fill('ABCDEFGHIJKLM');await saved();assert.equal((await map()).undo.length,split+2);
  await page.locator('.outline.selected').click();await input.fill('ABCDEFGHIJKLMN');await saved();assert.equal((await map()).undo.length,split+3);const persisted=await map();page=await restart();await page.getByRole('button',{name:persisted.title,exact:true}).click();assert.deepEqual((await map()).undo,persisted.undo);
 });
 await check('F4 sibling, reparent and structural keyboard controls are discoverable and prevent cycles',async()=>{
  await page.getByRole('button',{name:'添加子主题',exact:true}).click();await saved();await page.getByLabel('主题内容').fill('分支甲');await saved();const a=(await map()).document.nodes.find(n=>n.label==='分支甲').id;
  await page.getByRole('button',{name:'添加同级',exact:true}).click();await saved();await page.getByLabel('主题内容').fill('分支乙');await saved();const b=(await map()).document.nodes.find(n=>n.label==='分支乙').id;
  await panel('◫ 属性');await page.getByLabel('新的父主题').selectOption(a);await page.getByRole('button',{name:'移动主题 · 可撤销'}).click();await saved();assert.equal((await map()).document.nodes.find(n=>n.id===b).parentId,a);
  await page.getByRole('button',{name:'分支甲',exact:true}).click();assert.equal(await page.getByLabel('新的父主题').locator(`option[value="${b}"]`).count(),0);await page.getByRole('button',{name:'收起右侧面板'}).click();
  const canvas=page.getByRole('region',{name:/导图画布/});await canvas.focus();const count=(await map()).document.nodes.length;await canvas.press('Enter');await saved();assert.equal((await map()).document.nodes.length,count+1);await canvas.focus();await canvas.press('Tab');await saved();assert.equal((await map()).document.nodes.length,count+2);await canvas.focus();await canvas.press('Delete');await saved();assert.equal((await map()).document.nodes.length,count+1);
  await page.getByLabel('主题内容').focus();await page.getByLabel('主题内容').press('Enter');assert.equal((await map()).document.nodes.length,count+1);
 });
 await check('F7 blank and overlong names stay visibly unsubmitted; create and rename count Unicode code points',async()=>{
  const before=await map();await page.getByLabel('导图名称').fill('');await expect(page.locator('#title-validation')).toContainText('不能为空');await expect(page.getByRole('status')).not.toHaveText('已保存到本机');assert.equal((await snapshot()).maps.find(m=>m.id===before.id).title,before.title);
  await page.getByLabel('导图名称').fill('文'.repeat(201));await expect(page.locator('#title-validation')).toContainText('200');assert.equal((await snapshot()).maps.find(m=>m.id===before.id).title,before.title);await page.getByLabel('导图名称').fill('😀'.repeat(200));await saved();assert.equal((await snapshot()).maps.find(m=>m.id===before.id).title,'😀'.repeat(200));await page.getByLabel('导图名称').fill(before.title);await saved();
  await page.getByRole('button',{name:'＋ 新建导图'}).click();await page.getByLabel('新导图名称').fill('文'.repeat(201));await expect(page.getByRole('button',{name:'创建',exact:true})).toBeDisabled();await expect(page.locator('#new-title-validation')).toContainText('200');await page.getByLabel('新导图名称').press('Escape');
 });
 await check('F8 long outline labels stay compact and full content remains selectable',async()=>{
  const full='长中文内容'.repeat(80);await page.getByLabel('主题内容').fill(full);await saved();const row=page.locator('.outline.selected');assert.ok((await row.boundingBox()).height<75);await page.getByRole('button',{name:'查看全文 / 移动'}).click();await expect(page.locator('.property-name')).toHaveText(full);await shot('32-outline-full-text');await page.getByRole('button',{name:'收起右侧面板'}).click();
 });
 await check('F6 640x700 AI panel leaves canvas and bottom controls reachable without forced clicks',async()=>{
  await page.setViewportSize({width:640,height:700});await panel('✧ AI 助手');await page.getByRole('button',{name:'适应画布'}).click();const canvas=await page.locator('.canvas-stage').boundingBox();assert.ok(canvas.height>=220,`visible canvas height ${canvas.height}`);
  for(const name of ['添加子主题','添加同级','删除主题','查看全文 / 移动']){const button=page.getByRole('button',{name,exact:true});await expect(button).toBeInViewport();const point=await button.boundingBox();assert.equal(await button.evaluate((el,p)=>el.contains(document.elementFromPoint(p.x+p.width/2,p.y+p.height/2)),point),true);}
  await page.getByLabel('主题内容').fill('窄窗可编辑');await saved();await page.getByRole('button',{name:'添加子主题',exact:true}).click();await saved();await shot('33-narrow-ai-reachable');await page.getByRole('button',{name:'收起右侧面板'}).click();await page.setViewportSize({width:1440,height:950});await page.getByRole('button',{name:'☷ 导图库'}).click();
 });
 await check('F9 Escape cancels create and rejects AI preview, restoring focus and never applying',async()=>{
  const button=page.getByRole('button',{name:'＋ 新建导图'});await button.click();await page.getByLabel('新导图名称').press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(button).toBeFocused();const before=await snapshot();await propose(await map());await expect(page.getByRole('dialog',{name:'AI 修改预览'})).toBeVisible();await page.getByRole('dialog',{name:'AI 修改预览'}).press('Escape');await expect(page.getByRole('dialog',{name:'AI 修改预览'})).toHaveCount(0);assert.deepEqual(await snapshot(),before);
 });
 await check('F3/F10 AI configuration, cancel, timeout, auth, provider and unknown errors have safe Chinese actions',async()=>{
  await panel('✧ AI 助手');await page.getByLabel('AI 请求').fill('合成错误路径测试');const before=await snapshot();
  for(const [mode,code] of [['missing','CONFIG_REQUIRED'],['auth','AI_AUTH'],['network','AI_NETWORK'],['provider','AI_PROVIDER'],['timeout','AI_TIMEOUT'],['cancel','AI_STOPPED'],['unknown','AI_PROVIDER']]){await aiMode(mode);await page.getByRole('button',{name:'发送给 DeepSeek'}).click();if(mode==='cancel')await page.getByRole('button',{name:'停止',exact:true}).click();await expect(page.getByRole('alert')).toContainText(code);const text=await page.getByRole('alert').innerText();assert.match(text,/[\u4e00-\u9fff]/);assert.doesNotMatch(text,/SYNTHETIC-secret|Bearer|Traceback|Error:|C:\\/);assert.equal(await page.getByRole('button',{name:'重新读取',exact:true}).count(),0);if(mode==='missing')await expect(page.getByRole('button',{name:'打开设置',exact:true})).toBeVisible();if(mode==='timeout')await expect(page.getByRole('button',{name:'重试 AI 请求'})).toBeVisible();if(mode==='provider')await shot('34-safe-chinese-ai-error');await dismiss();}
  assert.deepEqual(await snapshot(),before);await aiMode('restore');await page.getByRole('button',{name:'收起右侧面板'}).click();
 });
 return page;
}
