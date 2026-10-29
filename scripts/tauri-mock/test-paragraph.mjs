import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
const b=await launchBrowser();
const field='[data-editor-item-id="we-1"] [data-editor-field="description"]';
const preview='[data-item-id="we-1"] [data-field="description"] [data-paragraph]';
try {
  await b.navigate('http://127.0.0.1:5174/zh/editor/r-demo');
  await b.click('text:工作经历');
  await b.select(field,1,4);
  for(const [label,value] of [['段前（pt）','6'],['段后（pt）','8'],['行距（倍）','1.75']]) {
    await b.click('[role="toolbar"][aria-label="文字格式"] button[aria-label="段落"]');
    const selector=`input[aria-label="${label}"]`;
    await b.click(selector);
    await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);
    await b.send('Input.insertText',{text:value});
    await b.click(`[role="menu"] form:has(${selector}) button[type="submit"]`);
  }
  const style=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(preview)});const s=getComputedStyle(e);return {before:s.paddingTop,after:s.paddingBottom,line:s.lineHeight,size:s.fontSize,text:e.textContent};})()`);
  assert.equal(style.before,'8px');
  assert.ok(Math.abs(parseFloat(style.after)-32/3)<.01);
  assert.ok(Math.abs(parseFloat(style.line)/parseFloat(style.size)-1.75)<.01);
  const stored=await b.evaluate(`(async()=>{const s=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;await s.getState().flushPendingSave();return s.getState().sections.find(s=>s.id==='s-we').content.items[0].description;})()`);
  assert.ok(stored.includes('{{paragraph=6,8,1.75}}'));
  assert.deepEqual(b.errors,[]);
  console.log('PASS 单段间距：实际控件、预览计算样式及保存');
} finally {await b.close()}
