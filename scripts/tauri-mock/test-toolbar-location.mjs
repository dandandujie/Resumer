// 工作地点的编辑/保存/清空，以及常用操作的文字和自适应入口。
import assert from 'node:assert/strict';
import { launchBrowser, delay } from './browser.mjs';
const b=await launchBrowser({width:1200,height:800});
const {evaluate,click,key,send,waitFor}=b;
const base=process.env.BASE || 'http://127.0.0.1:5174';
const input='[data-editor-item-id="we-1"] [data-editor-field="location"]';
const preview='[data-item-id="we-1"] [data-field="location"]';
let checks=0;
const check=async(expr,message)=>{assert.equal(await evaluate(expr),true,message);checks++;};
const close=async()=>{await key('Escape');await waitFor("!document.querySelector('[role=dialog]')");};
try {
 await b.navigate(base+'/zh/editor/r-demo');
 await check("!!window.__TAURI_INTERNALS__ && document.documentElement.outerHTML.includes('Tauri 假后端')",'隔离后端');
 await click('text:工作经历');
 await check(`document.querySelector('${input}').getAttribute('aria-label')==='工作地点' && document.querySelector('${input}').textContent==='上海'`,'显示工作地点及已有值');
 await b.select(input,0,2);await send('Input.insertText',{text:'深圳 / 远程'});
 await check(`document.querySelector('${preview}').textContent==='深圳 / 远程'`,'地点编辑同步预览');
 await evaluate(`(async()=>{const s=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;await s.getState().flushPendingSave();})()`);
 await check(`(async()=>{const a=await window.__appModule('/src/lib/tauri-api.ts');const r=await a.getResume('r-demo');const i=r.sections.find(s=>s.id==='s-we').content.items;return i[0].location==='深圳 / 远程' && i[1].location==='杭州'})()`,'地点保存且不改其他经历');
 await b.select(input,0,7);await key('Backspace');
 await check(`!document.querySelector('${preview}')`,'清空地点后预览不留残留城市');
 await click('button[title="撤销"]');
 await check(`document.querySelector('${preview}').textContent==='深圳 / 远程'`,'清空地点可以撤销');
 await click('text:导出');await check("!!document.querySelector('[role=dialog]')",'直接导出入口有效');await close();
 for(const locale of ['zh','en']) {
  await b.navigate(base+`/${locale}/editor/r-demo`);
  for(const width of [1440,1200,900,390]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});await delay(250);
   await check("!document.querySelector('[data-editor-actions] button[title=\"排版\"], [data-editor-actions] button[title=\"Layout\"]')",`${locale} ${width} 无重复样式按钮`);
   await check("!!document.querySelector('[role=tab][id$=\"-trigger-style\"]')",'排版页签仍可使用');
   await check("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('[data-editor-actions] button')].filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1})",`${locale} ${width} 按钮不截断`);
   const labels=locale==='zh'?['导出','AI 工具','设置']:['Export','AI tools','Settings'];
   for(const label of labels) await check(`(()=>{const b=[...document.querySelectorAll('[data-editor-actions] button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});return !!b && b.getClientRects().length>0})()`,`${locale} ${width} ${label} 常显文字`);
   const interview=locale==='zh'?'模拟面试':'Mock interview';
   if(width>=1280) await check(`(()=>{const b=[...document.querySelectorAll('[data-editor-actions] button')].find(e=>e.textContent.trim()===${JSON.stringify(interview)});return !!b && b.getClientRects().length>0})()`,'大窗口直接显示面试');
   await click(locale==='zh'?'button[title="AI 工具"]':'button[title="AI tools"]');
   if(width<1280) await check(`(()=>{const e=[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.trim()===${JSON.stringify(interview)});return !!e && e.getClientRects().length>0})()`,'窄窗口的面试入口留在菜单中');
   await key('Escape');
  }
 }
 assert.deepEqual(b.errors,[]);
 console.log(`Toolbar and location: ${checks} checks passed`);
} finally {await b.close();}
