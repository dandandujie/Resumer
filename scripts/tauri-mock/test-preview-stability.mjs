// 保留真实滚动条，持续采样临界高度：静态截图无法发现缩放反馈循环。
import assert from 'node:assert/strict';
import {launchBrowser, delay} from './browser.mjs';
const b=await launchBrowser({width:1200,height:900});
try {
 await b.send('Page.addScriptToEvaluateOnNewDocument',{source: `window.__layoutErrors=[];addEventListener('error',e=>window.__layoutErrors.push(e.message))`});
 await b.navigate((process.env.BASE || 'http://127.0.0.1:5174')+'/zh/editor/r-demo');
 await b.evaluate(`document.fonts.ready`);
 const dimensions=await b.evaluate(`(()=>{const p=document.querySelector('[data-theme-scope]').parentElement,v=p.parentElement.parentElement;return {paperHeight:p.offsetHeight,width:v.offsetWidth,header:innerHeight-v.clientHeight,bar:parseInt(getComputedStyle(v,'::-webkit-scrollbar').width)}})()`);
 const withoutBar=Math.floor((dimensions.width-32)/794*100);
 const withBar=Math.floor((dimensions.width-32-dimensions.bar)/794*100);
 const critical=Math.round(dimensions.header+32+dimensions.paperHeight*(withoutBar+withBar)/200);
 console.log({dimensions,withoutBar,withBar,critical});
 await b.send('Emulation.setDeviceMetricsOverride',{width:1200,height:critical,deviceScaleFactor:1,mobile:false});
 await delay(500);
 const sample=await b.evaluate(`new Promise(resolve=>{const values=[];let frames=0;const read=()=>{const p=document.querySelector('[data-theme-scope]').parentElement,v=p.parentElement.parentElement;values.push({zoom:p.style.zoom,width:v.clientWidth,height:v.clientHeight,paper:p.getBoundingClientRect().height,scrollTop:v.scrollTop});if(++frames<150)requestAnimationFrame(read);else resolve(values)};requestAnimationFrame(read)})`);
 const sizes=new Set(sample.map(v=>v.zoom+':'+v.width));
 console.log('preview samples',JSON.stringify([...sizes]),'frames',sample.length);
 assert.equal(sizes.size,1,'静置预览不能在有/无滚动条的宽度和缩放比例之间反复切换');
 assert.deepEqual(b.errors,[]);
 let scenarios=1;
 const stable = async (name) => {
   await delay(500);
   const values=await b.evaluate(`new Promise(resolve=>{const values=[];let n=0;const sample=()=>{const p=document.querySelector('[data-theme-scope]').parentElement,v=document.querySelector('[data-preview-viewport]');values.push([p.style.zoom,v.clientWidth,v.clientHeight,Math.round(p.getBoundingClientRect().height),Math.round(v.scrollTop)].join(':'));if(++n<90)requestAnimationFrame(sample);else resolve([...new Set(values)])};requestAnimationFrame(sample)})`);
   assert.equal(values.length,1,`${name} 应在尺寸变化后稳定：${values.join(',')}`);
   scenarios++;
 };
 for (const [width,height] of [[1200,critical-4],[1200,critical+4],[900,600],[1440,900]]) {
   await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   await stable(`${width}×${height}`);
 }
 await b.click('[role=tab][id$="-trigger-style"]');
 for (const label of ['四号 14pt','小五 9pt','标准']) { await b.click('text:'+label); await stable(label); }
 await b.click('button[aria-label="放大预览"]'); await stable('手动放大');
 await b.click('button[title="适合页面宽度"]'); await stable('恢复自动缩放');
 await b.waitFor("!!document.querySelector('[data-module-id=\"s-we\"]')");
 await b.click('[data-module-id="s-we"] button[aria-pressed]');
 const field='[data-editor-item-id="we-1"] [data-editor-field="description"]';
 await b.select(field,0,0); await b.send('Input.insertText',{text:'新增一段需要折行的工作描述。'.repeat(12)}); await stable('编辑长内容');
 await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:700,deviceScaleFactor:1,mobile:false});
 await b.click('text:预览'); await stable('手机预览页签重新显示');
 await b.send('Emulation.setDeviceMetricsOverride',{width:1200,height:critical,deviceScaleFactor:1,mobile:false});
 await stable('返回桌面临界高度');
 // 用真实文字测量引擎验证最近布局改动没有遗漏在页数预估中。
 const estimates=await b.evaluate(`(async()=>{
   const url=performance.getEntriesByType('resource').map(e=>e.name).find(u=>u.includes('@chenglou_pretext'));
   const pretext=await import(url);
   const {estimateClassicPages}=await window.__appModule('/src/lib/pretext-classic-estimate.ts');
   const {useResumeStore}=await window.__appModule('/src/stores/resume-store.ts');
   const r=useResumeStore.getState().currentResume;
   const work={id:'work',type:'work_experience',visible:true,title:'经历',content:{items:[{position:'工程师',company:'公司',location:'',startDate:'2022-01',endDate:'2023-01'}]}};
   const pi={id:'pi',type:'personal_info',visible:true,content:{fullName:'姓名'}};
   const estimate=(sections,theme={})=>estimateClassicPages(pretext,{...r,themeConfig:{...r.themeConfig,...theme},sections}).totalHeight;
   const noLocation=estimate([pi,work]);work.content.items[0].location='上海';const location=estimate([pi,work]);
   pi.content.avatar='data:image/png;base64,test';const circle=estimate([pi],{avatarStyle:'circle'}),oneInch=estimate([pi],{avatarStyle:'oneInch'});
   return {noLocation,location,circle,oneInch};
 })()`);
 assert.equal(estimates.location,estimates.noLocation,'短地点与公司同行，不应虚增一行');
 assert.equal(Math.round(estimates.oneInch-estimates.circle),26,'一寸照按90px高预估，圆形按64px');
 assert.deepEqual(await b.evaluate('window.__layoutErrors'),[],'没有 ResizeObserver 循环等窗口错误');
 assert.deepEqual(b.errors,[]);
 console.log(`Preview stability: ${scenarios} sustained scenarios and page estimate checks passed`);
} finally {await b.close();}
