// Regression: unlayered workspace rules previously suppressed hover and keyboard feedback.
import assert from 'node:assert/strict';
import { launchBrowser, delay } from './browser.mjs';
const b = await launchBrowser({width:1200,height:800});
const base = process.env.BASE || 'http://127.0.0.1:5174';
let checks = 0;
const check = (value, label) => { assert.ok(value,label); checks++; };
const state = selector => b.evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(b);return {bg:s.backgroundColor,border:s.borderColor,shadow:s.boxShadow,outline:s.outlineStyle,width:s.outlineWidth,visible:b.matches(':focus-visible')}})()`);
async function pointerStates(selector) {
 const normal=await state(selector);
 const point=await b.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await delay(160);
 const hover=await state(selector);
 check(hover.bg!==normal.bg || hover.border!==normal.border,selector+' has hover feedback');
 await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await delay(160);
 const pressed=await state(selector);
 check(pressed.bg!==hover.bg && pressed.shadow!==hover.shadow,selector+' has pressed feedback');
 await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1,buttons:1});
 await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:1,y:1,button:'left',clickCount:1});await delay(160);
}
try {
 await b.navigate(base+'/zh/dashboard');
 await pointerStates('.app-actions [data-variant="outline"]');
 await pointerStates('.app-actions [data-variant="primary"]');
 await b.evaluate(`document.querySelector('.app-actions [data-variant="outline"]').focus()`);await b.key('Tab');
 const focused=await b.evaluate(`(()=>{const b=document.activeElement,s=getComputedStyle(b);return b.dataset.variant==='primary'&&b.matches(':focus-visible')&&s.outlineStyle==='solid'&&parseFloat(s.outlineWidth)>=2})()`);
 check(focused,'keyboard focus visibly distinguishes the active button');
 await b.navigate(base+'/zh/knowledge');
 check(await b.evaluate(`!document.querySelector('input[aria-label="检索知识原文"]') && [...document.querySelectorAll('button')].filter(b=>b.textContent==='新建资料集').length===1`),'empty library has one creation action and no idle search form');
 await b.navigate(base+'/zh/insights');await b.waitFor("!!document.querySelector('.journal-application-row')");await b.click('.journal-application-row');await b.waitFor("!!document.querySelector('[data-application-detail]')");
 await b.click('[aria-label="投递操作"]');
 check(await b.evaluate(`!![...document.querySelectorAll('[role="menuitem"]')].find(b=>b.textContent.includes('删除投递')&&b.dataset.variant==='destructive')`),'dangerous operation is explicitly named in the record menu');
 await b.key('Escape');
 await b.navigate(base+'/zh/editor/r-demo');
 await b.evaluate(`(async()=>{const m=await window.__appModule('/src/stores/ui-store.ts');m.useUIStore.getState().setTheme('dark')})()`);
 await b.waitFor("document.documentElement.dataset.appearance==='dark'");
 check(await b.evaluate(`getComputedStyle(document.querySelector('[data-slot="switch-thumb"]')).backgroundColor==='rgb(255, 255, 255)'`),'dark appearance keeps switch thumb visible');
 await b.evaluate(`(async()=>{const m=await window.__appModule('/src/stores/ui-store.ts');m.useUIStore.getState().openModal('settings')})()`);
 await b.waitFor("!!document.querySelector('[data-settings-workspace]')");
 await b.click('text:通用设置');
 await pointerStates('[data-settings-workspace] [data-ui-button][data-variant="default"]');
 await b.click('[data-appearance-choice="light"]');await b.click('text:返回应用');
 check(await b.evaluate(`getComputedStyle(document.querySelector('[data-preview-viewport] > div > div')).backgroundColor==='rgb(255, 255, 255)'`),'control palette does not recolor resume paper');
 await b.evaluate(`(()=>{window.__designMutations=[];window.__designObserver=new MutationObserver(records=>window.__designMutations.push(...records.map(r=>r.oldValue)));window.__designObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-design'],attributeOldValue:true})})()`);
 for (const appearance of ['dark','light','dark','light']) {
  await b.evaluate(`(async()=>{const m=await window.__appModule('/src/stores/ui-store.ts');m.useUIStore.getState().openModal('settings')})()`);
  await b.waitFor("!!document.querySelector('[data-settings-workspace]')");await b.click(`[data-appearance-choice="${appearance}"]`);await b.click('text:返回应用');
  check(await b.evaluate(`!!document.querySelector('[data-preview-paper] h1') && document.querySelector('[data-preview-paper]').offsetHeight>=1123 && getComputedStyle(document.querySelector('[data-preview-paper] h1')).color==='rgb(26, 26, 26)'`),'returning from settings preserves populated document and text color');
 }
 const scrollBefore=await b.evaluate(`(()=>{const v=document.querySelector('[data-preview-viewport]');v.scrollTop=60;v.dispatchEvent(new Event('scroll'));return v.scrollTop})()`);
 await b.evaluate(`(async()=>{const m=await window.__appModule('/src/stores/ui-store.ts');m.useUIStore.getState().openModal('settings')})()`);
 await b.waitFor("!!document.querySelector('[data-settings-workspace]')");await b.click('text:返回应用');await delay(100);
 check(await b.evaluate(`Math.abs(document.querySelector('[data-preview-viewport]').scrollTop-${scrollBefore})<1`),'returning from settings preserves preview scroll position when returning to the workspace');
 check(await b.evaluate(`window.__designMutations.length===0`),'appearance changes never remove or reinstall the shared design scope');
 await b.evaluate(`window.__designObserver.disconnect()`);
 check(await b.evaluate(`(()=>{const frame=document.querySelector('[data-preview-frame]'),paper=document.querySelector('[data-preview-paper]');const f=frame.getBoundingClientRect(),p=paper.getBoundingClientRect();return Math.abs(f.width-p.width)<1&&Math.abs(f.height-p.height)<1&&f.width<=document.querySelector('[data-preview-viewport]').clientWidth&&getComputedStyle(paper).zoom==='1'})()`),'scaled paper frame matches painted size without layout zoom');
 check(await b.evaluate(`(async()=>{const samples=[];for(let n=0;n<40;n++){await new Promise(requestAnimationFrame);const p=document.querySelector('[data-preview-paper]').getBoundingClientRect();samples.push([p.width,p.height].join(','))}return new Set(samples).size===1})()`),'preview dimensions remain stable across frames after theme switching');
 assert.deepEqual(b.errors,[]);console.log(`PASS 控件交互与信息层级 ${checks} 项`);
} finally {await b.close();}
