import assert from 'node:assert/strict';
import { launchBrowser, delay } from './browser.mjs';
const b=await launchBrowser({width:1200,height:850});
const {evaluate,click,key,waitFor,send}=b;
const base=process.env.BASE||'http://127.0.0.1:5176';let count=0;
const check=async(expr,label)=>{assert.equal(await evaluate(expr),true,label);count++;};
try {
 await b.navigate(base+'/zh/insights?ai_review=1');
 await check("!document.querySelector('.app-metrics') && document.querySelectorAll('.journal-application-row').length===6",'投递列表优先且不再重复大指标卡');
 await click('.applications-resume-filter');await waitFor("!!document.querySelector('[data-slot=select-content]')");
 await check("getComputedStyle(document.querySelector('[data-slot=select-content]')).borderRadius==='12px' && getComputedStyle(document.querySelector('[role=option]')).fontSize==='12px'",'菜单和选项使用共享尺度');
 await key('ArrowDown');await key('Enter');
 await check("!document.querySelector('[role=listbox]') && document.querySelectorAll('.journal-application-row').length===4",'键盘选择后筛选生效并收起');
 await click('.application-status-cell');await waitFor("!!document.querySelector('[role=listbox]')");
 await check("document.querySelector('[data-slot=select-content]').getBoundingClientRect().top>=0",'状态选择器不越过视口');
 await key('Escape');await check("document.activeElement.classList.contains('application-status-cell')",'Escape关闭返回原选择器焦点');
 await click('[aria-label=投递操作]');
 await check("document.querySelector('[role=menu]').textContent.includes('复盘并沉淀') && !document.querySelector('[role=menu]').textContent.includes('journal.')",'行操作中文命名完整');
 await key('Escape');
 await b.navigate(base+'/zh/work-notes?ai_review=1');
 await key('Meta+Shift+j');
 // Main notes page intentionally focuses its existing experience input; create form is reached explicitly.
 await b.navigate(base+'/zh/work-notes?no_experiences=1');
 await click('text:开始一段经历');
 await waitFor("!!document.querySelector('[role=combobox]')");
 await check("!document.querySelector('select:not([aria-hidden=true])')",'简单表单选择也使用统一交互');
 await click('[role=combobox]');await key('End');await key('Enter');
 await check("document.querySelector('[role=combobox]').textContent.includes('工作')",'原生表单迁移后键盘选择仍更新值');
 await b.navigate(base+'/zh/insights?ai_review=1');
 for(const theme of ['light','dark']) {
  await evaluate(`(async()=>{const {useUIStore}=await window.__appModule('/src/stores/ui-store.ts');useUIStore.getState().setTheme('${theme}')})()`);
  for(const width of [900,390]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});await delay(120);
   await click('.applications-resume-filter');await waitFor("!!document.querySelector('[data-slot=select-content]')");
   await check("(()=>{const r=document.querySelector('[data-slot=select-content]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})()",`${theme} ${width}下拉在视口内`);
   await key('Escape');
   await check('document.documentElement.scrollWidth<=innerWidth+1',`${theme} ${width}列表无横向溢出`);
  }
 }
 assert.deepEqual(b.errors,[]);console.log(`PASS 统一选择器 / 中文菜单 / 键盘 / 投递主次 ${count} 项`);
} finally {await b.close();}
