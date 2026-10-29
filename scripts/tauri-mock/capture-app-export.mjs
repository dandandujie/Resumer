// 从完整 Resumer 编辑页面与导出对话框捕获请求；Rust 验收使用同一生产导出函数生成文件。
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
const out=process.env.OUT || '/tmp/resumer-app-export';mkdirSync(out,{recursive:true});
const b=await launchBrowser({width:1600,height:1000});
try {
 await b.navigate('http://127.0.0.1:5174/zh/editor/r-demo');
 // 经真实头像上传入口加入多色图片，用于识别缩放、裁切和丢图。
 await b.evaluate(`(()=>{const c=document.createElement('canvas');c.width=240;c.height=320;const x=c.getContext('2d');x.fillStyle='#d9e5ef';x.fillRect(0,0,240,320);x.fillStyle='#405a73';x.beginPath();x.arc(120,110,50,0,Math.PI*2);x.fill();x.beginPath();x.ellipse(120,280,90,95,0,0,Math.PI*2);x.fill();x.fillStyle='#cf9d57';x.fillRect(10,10,24,24);c.toBlob(blob=>{const d=new DataTransfer();d.items.add(new File([blob],'avatar.png',{type:'image/png'}));const i=document.querySelector('input[type=file]');i.files=d.files;i.dispatchEvent(new Event('change',{bubbles:true}));});})()`);
 await b.waitFor("!!document.querySelector('[data-section-type=personal_info] img, [data-section] img')");
 await b.click('text:工作经历');
 const f='[data-editor-item-id="we-1"] [data-editor-field="description"]';
 await b.select(f,0,2);
 await b.click('[role="toolbar"][aria-label="文字格式"] button[aria-label="粗体"]');
 await b.evaluate(`window.__savedInvoke=window.__TAURI_INTERNALS__.invoke;window.__exportRequests={};window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{if(cmd==='export_docx'||cmd==='export_pdf'){window.__exportRequests[cmd]=args;return null;}return window.__savedInvoke(cmd,args);}`);
 await b.click('text:文件');
 await b.click('[role=menuitem]:has(svg.lucide-download)');
 await b.waitFor("!!document.querySelector('[role=dialog]')");
 await b.click('[role=dialog] button:has(svg.lucide-file-text)');
 await b.click('[role=dialog] button.bg-brand');
 await b.waitFor('!!window.__exportRequests.export_docx');
 await b.click('[role=dialog] button:has(svg.lucide-file-down)');
 await b.click('[role=dialog] button.bg-brand');
 await b.waitFor('!!window.__exportRequests.export_pdf');
 const capture=await b.evaluate(`({resume:window.__TAURI_MOCK__.resumes['r-demo'],requests:window.__exportRequests})`);
 // 记录浏览器真正使用的字体；CSS 声明本身不能证明实际命中的字体。
 await b.send('DOM.enable'); await b.send('CSS.enable');
 const {root}=await b.send('DOM.getDocument');
 const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'[data-field="fullName"]'});
 assert.ok(nodeId,'完整简历应显示姓名');
 const platform=await b.send('CSS.getPlatformFontsForNode',{nodeId});
 capture.previewFonts=platform.fonts;
 const expected=capture.requests.export_docx.theme.officeFonts.eastAsia;
 const aliases={'Noto Sans SC':'Reseumer Hei','Noto Serif CJK SC':'Reseumer Song','LXGW WenKai Lite':'Reseumer Kai'};
 assert.ok(platform.fonts.some(font=>font.familyName===expected || font.familyName===aliases[expected]),
   `DOCX 中文字体 ${expected} 与姓名预览实际字体不符: ${JSON.stringify(platform.fonts)}`);
 assert.ok(capture.resume.sections.length>=5,'必须使用完整简历验收');
 assert.equal(b.errors.length,0,JSON.stringify(b.errors));
 writeFileSync(`${out}/app-export.json`,JSON.stringify(capture,null,2));
 writeFileSync(`${out}/app-preview.html`,capture.requests.export_pdf.options.html);
 await b.key('Escape');
 await b.screenshot(`${out}/app-editor.png`);
 // 独立导出 HTML 必须具有与编辑预览相同的居中头部和联系信息间距。
 const {frameTree}=await b.send('Page.getFrameTree');
 await b.send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:capture.requests.export_pdf.options.html});
 await b.waitFor("!!document.querySelector('[data-personal-heading] img')");
 assert.equal(await b.evaluate(`(()=>{const h=document.querySelector('[data-personal-heading]'),a=h.querySelector('img').getBoundingClientRect(),n=h.querySelector('h1').getBoundingClientRect(),c=getComputedStyle(h.nextElementSibling);return getComputedStyle(h).justifyContent==='center' && a.right<n.left && c.justifyContent==='center' && c.columnGap==='12px' && c.rowGap==='4px'})()`),true,'导出 CSS 与当前个人信息模板一致');
 assert.equal(await b.evaluate(`(()=>{const item=document.querySelector('[data-item-id="we-1"]'),company=item.querySelector('[data-field="company"]').getBoundingClientRect(),location=item.querySelector('[data-field="location"]').getBoundingClientRect();return location.left>=company.right && location.top<company.bottom && location.bottom>company.top})()`),true,'导出中的地点紧跟公司名右侧');
 console.log('已捕获完整简历的 App 导出请求，并验证头部与公司地点同行布局',out);
}finally{await b.close()}
