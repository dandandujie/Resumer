import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
const b=await launchBrowser();
const field='[data-editor-item-id="we-1"] [data-editor-field="startDate"]';
const preview='[data-item-id="we-1"] [data-field="startDate endDate"]';
try {
  await b.navigate('http://127.0.0.1:5174/zh/editor/r-demo');
  await b.waitFor("document.body.textContent.includes('工作经历')");
  await b.click('text:工作经历');
  await b.waitFor(`!!document.querySelector(${JSON.stringify(field)})`);
  await b.select(field,0,4);
  await b.click('[role="toolbar"][aria-label="文字格式"] button[aria-label="粗体"]');
  assert.ok(await b.evaluate(`document.querySelector(${JSON.stringify(preview+' strong')})?.textContent.includes('202')`));
  const stored=await b.evaluate(`(async()=>{const s=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;await s.getState().flushPendingSave();return s.getState().sections.find(s=>s.id==='s-we').content.items[0].startDate;})()`);
  assert.ok(stored.includes('**'));
  await b.evaluate(`history.pushState(null,'','/zh/dashboard');dispatchEvent(new PopStateEvent('popstate'));`);
  await b.waitFor("!document.querySelector('[data-editor-item-id]')");
  await b.evaluate(`history.pushState(null,'','/zh/editor/r-demo');dispatchEvent(new PopStateEvent('popstate'));`);
  await b.waitFor("document.body.textContent.includes('工作经历')");
  await b.click('text:工作经历');
  await b.waitFor(`!!document.querySelector(${JSON.stringify(field)})`);
  assert.ok(await b.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(field+' [data-s]')})).some(e=>JSON.parse(e.dataset.s).bold)`));
  assert.deepEqual(b.errors,[]);
  console.log('PASS 日期选区加粗、预览、保存和重开');
} finally {await b.close();}
