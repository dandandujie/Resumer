// 先启动 MOCK_TAURI=1 pnpm dev:vite --host 127.0.0.1 --port 5174，再 pnpm test:ui。
// 所有写操作只针对注入的内存数据；原生鼠标点击会检查可见性和遮挡。
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { launchBrowser, delay } from './browser.mjs';

const base = process.env.BASE || 'http://127.0.0.1:5174';
const out = process.env.OUT || '/tmp/resumer-ui';
mkdirSync(out, {recursive:true});
const browser = await launchBrowser();
const {evaluate, click, select, key, waitFor, send} = browser;
const q = JSON.stringify;
let checks = 0;
async function check(expression, message) {
  assert.equal(await evaluate(expression), true, message);
  checks++;
}
async function visit(route) {
  await browser.navigate(base+route);
  await check("!!window.__TAURI_INTERNALS__ && document.documentElement.outerHTML.includes('Tauri 假后端')", '必须使用隔离的 mock 后端');
}
async function clean() { await delay(150); assert.deepEqual(browser.errors, [], '页面没有运行时错误'); }
const field = '[data-editor-item-id="we-1"] [data-editor-field="description"]';
const preview = '[data-item-id="we-1"] [data-field="description"]';
const toolbar = '[role="toolbar"][aria-label="文字格式"]';
const inputText = async text => { await send('Input.insertText',{text}); await delay(120); };
try {
  await visit('/zh/editor/r-demo');
  await click('text:工作经历');
  await waitFor(`!!document.querySelector(${q(field)})`);
  const original = await evaluate(`document.querySelector(${q(field)}).textContent`);
  await select(field, 3, 6);
  await check(`CSS.highlights.get('resume-editing-selection')?.values().next().value.toString() === ${q(original.slice(3,6))}`, '选中文字同步到预览');
  await click(`${toolbar} button[aria-label="粗体"]`);
  await check(`document.querySelector(${q(preview+' strong')})?.textContent === ${q(original.slice(3,6))}`, '粗体只应用选区');
  await click(`${toolbar} button[aria-label="颜色"]`);
  await click('[role="menu"][aria-label="颜色"] button[aria-label="#c0392b"]');
  await click(`${toolbar} button[aria-label="字号"]`);
  await click('text:14四号');
  await click(`${toolbar} button[aria-label="字体"]`);
  await click('text:宋体');
  await check(`(() => { const el=document.querySelector(${q(preview+' [data-fmt]')}); return !!el && el.style.color==='rgb(192, 57, 43)' && el.style.fontSize==='14pt' && el.style.fontFamily.includes('SimSun'); })()`, '字色、字号、字体在预览同时保留');
  await browser.screenshot(path.join(out,'editor-selection.png'));
  // 保存后重新加载同一份内存简历，验证经过持久化接口回读的标记没有丢失。
  const stored = await evaluate(`(async()=>{const s=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore; await s.getState().flushPendingSave(); return s.getState().sections.find(s=>s.id==='s-we').content.items[0].description;})()`);
  assert.ok(stored.includes('{{size=14}}') && stored.includes('{{font=songti}}'));
  await evaluate(`(async()=>{const api=await window.__appModule('/src/lib/tauri-api.ts'); const r=await api.getResume('r-demo'); window.__savedDescription=r.sections.find(s=>s.id==='s-we').content.items[0].description;})()`);
  await check(`window.__savedDescription===${q(stored)}`, '保存回读保持格式');
  await click(`${toolbar} button[aria-label="清除格式"]`);
  await check(`!document.querySelector(${q(preview+' strong')}) && !document.querySelector(${q(preview+' [data-fmt]')})`, '清除选区格式');
  await key('Meta+z');
  await check(`!!document.querySelector(${q(preview+' strong')})`, '字段撤销还原样式');
  await key('Meta+Shift+z');
  await check(`!document.querySelector(${q(preview+' strong')})`, '字段重做');
  await select(field, original.length, original.length);
  await inputText('，新增');
  await send('Input.imeSetComposition',{text:'zhongwen',selectionStart:8,selectionEnd:8});
  await send('Input.insertText',{text:'中文'});
  await delay(200);
  await check(`document.querySelector(${q(field)}).textContent.endsWith('，新增中文') && document.querySelector(${q(preview)}).textContent.endsWith('，新增中文')`, '中文组字不会丢失或重复');
  await key('Enter');
  await inputText('第二行');
  await check(`document.querySelector(${q(field)}).textContent.endsWith(${q('\n第二行')}) && document.querySelector(${q(preview)}).innerHTML.includes('<br>')`, '多行正文换行');
  const highlight='[data-editor-item-id="we-1"] [role="textbox"][aria-label="亮点 1"]';
  await select(highlight,0,0);
  const count=await evaluate(`document.querySelectorAll('[data-editor-item-id="we-1"] [contenteditable]').length`);
  await key('Enter');
  await check(`document.querySelectorAll('[data-editor-item-id="we-1"] [contenteditable]').length===${count+1} && document.activeElement.getAttribute('aria-label')==='亮点 2'`, '列表回车新增并聚焦下一条');
  await clean();

  // 换模板后字段仍能定位，新增渲染的项目要点也不能遗漏。
  await evaluate(`(async()=>{const s=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore; s.setState({currentResume:{...s.getState().currentResume,template:'modern'}});})()`);
  await delay(200);
  await check(`(async()=> (await window.__appModule('/src/stores/resume-store.ts')).useResumeStore.getState().currentResume.template==='modern')()`, '实际切换现代模板');
  await select(field,0,2);
  await check("CSS.highlights.get('resume-editing-selection')?.values().next().value.toString()==='负责'", '现代模板选区联动');
  await check(`document.querySelector('[data-item-id="p-1"] [data-field="highlights.0"]')?.textContent.includes('Schema')`, '现代模板包含项目要点');
  const tagInput = '[data-editor-item-id="we-1"] input[aria-label="技术栈"]';
  await click(tagInput);
  await inputText('Rust，Svelte');
  await check(`(async()=>{const s=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore.getState(); return s.sections.find(x=>x.id==='s-we').content.items[0].technologies.slice(-2).join(',')==='Rust,Svelte';})()`, '标签粘贴自动拆分');
  await send('Input.imeSetComposition',{text:'ce,shi',selectionStart:6,selectionEnd:6});
  await send('Input.insertText',{text:'测试'});
  await key('Enter');
  await check(`(async()=>{const s=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore.getState(); return s.sections.find(x=>x.id==='s-we').content.items[0].technologies.at(-1)==='测试';})()`, '标签输入法组字保留完整内容');
  await clean();
  console.log('PASS editor interactions');
  await visit('/zh/insights');
  await browser.screenshot(path.join(out,'journal-desktop.png'));
  await waitFor("document.querySelectorAll('.journal-application-row').length===6");
  await click('input[placeholder="搜索公司、职位或备注..."]');
  await inputText('字节');
  await check("document.querySelectorAll('.journal-application-row').length===1", '投递搜索');
  await click('text:看板');
  await check("document.querySelectorAll('button[aria-roledescription="+'"draggable"'+"]').length===1", '看板复用搜索条件');
  await click('button[aria-roledescription="draggable"]');
  await check("!!document.querySelector('[role=dialog]') && !!document.querySelector('input[placeholder="+'"公司"'+"]')", '看板普通点击打开投递详情');
  await click('text:面试记录 · 2');
  await check("[...document.querySelectorAll('[role=dialog] input')].some(el=>el.getClientRects().length && el.value==='一面 · 技术')", '详情面试记录可切换');
  await browser.screenshot(path.join(out,'journal-detail.png'));
  await key('Escape');
  await waitFor("!document.querySelector('[role=dialog]')");
  await delay(400);
  await click('text:列表视图');
  await clean();

  console.log('PASS journal interactions');
  await visit('/zh/knowledge');
  await browser.screenshot(path.join(out,'knowledge-desktop.png'));
  await waitFor("!!document.querySelector('.knowledge-workspace article')");
  await check("document.querySelector('.knowledge-workspace article').textContent.length>20", '知识库无提案时也正常渲染');
  await click('text:编辑');
  await waitFor("!!document.querySelector('.knowledge-workspace textarea')");
  await click('.knowledge-workspace textarea');
  await key('Meta+a');
  await inputText('前端 ');
  await inputText('架构与工程效能');
  await check("document.querySelector('.knowledge-workspace textarea').value==='前端 架构与工程效能'", '逐次输入保留单词间空格');
  await click('text:保存');
  await waitFor("!!document.querySelector('.knowledge-workspace article')");
  await check("document.querySelector('.knowledge-workspace article').textContent.includes('前端 架构与工程效能')", '知识库保存后回读');
  await click('text:编辑');
  await click('.knowledge-workspace textarea');
  await key('Meta+a');
  await inputText('保留这份未保存草稿');
  await click('[data-knowledge-path="schema.md"]');
  await click('[data-knowledge-path="purpose.md"]');
  await click('text:编辑');
  await check("document.querySelector('.knowledge-workspace textarea').value==='保留这份未保存草稿'", '跨页切换保留草稿');
  await click('text:阅读');
  await check("document.querySelector('.knowledge-workspace article').textContent.includes('前端 架构与工程效能')", '阅读模式显示已保存内容');
  await click('text:图谱');
  await waitFor("!!document.querySelector('svg')");
  await click('text:列表');
  await clean();

  await evaluate(`(async()=>{
    const state=(await window.__appModule('/src/stores/knowledge-store.ts')).useKnowledgeStore;
    const original=window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke=async (cmd,args)=>{if(cmd==='knowledge_read' && args.path==='schema.md') await new Promise(r=>setTimeout(r,150)); return original(cmd,args);};
    await Promise.all([state.getState().select('schema.md'),state.getState().select('purpose.md')]);
    window.__TAURI_INTERNALS__.invoke=original;
  })()`);
  await check(`(async()=> (await window.__appModule('/src/stores/knowledge-store.ts')).useKnowledgeStore.getState().selectedPath==='purpose.md')()`, '快速切页时最新选择优先');
  await clean();
  // 注入可恢复的渲染故障：错误边界必须保留导航且支持重试。
  await evaluate(`(async()=>{const s=(await window.__appModule('/src/stores/knowledge-store.ts')).useKnowledgeStore; window.__healthyPages=s.getState().pages; s.setState({pages:null});})()`);
  await waitFor(`!!document.querySelector('a[href="/"]')`);
  await check("!!document.querySelector('nav')", '错误发生后导航仍然存在');
  await evaluate(`(async()=>{const s=(await window.__appModule('/src/stores/knowledge-store.ts')).useKnowledgeStore; s.setState({pages:window.__healthyPages});})()`);
  browser.errors.length=0;
  await click('text:重试');
  await waitFor("!!document.querySelector('.knowledge-workspace article')");
  await clean();
  await evaluate(`(async()=>{const s=(await window.__appModule('/src/stores/knowledge-store.ts')).useKnowledgeStore; s.getState().setSelectedContent(${q('# 求职目标\n\n[[schema.md|打开结构页]]')});})()`);
  await click('text:打开结构页');
  await check(`(async()=> (await window.__appModule('/src/stores/knowledge-store.ts')).useKnowledgeStore.getState().selectedPath==='schema.md')()`, '知识库内部链接可以跳转');
  console.log('PASS knowledge interactions');
  // 中英文、桌面与窄窗口；只允许看板/预览等明确的内部滚动区横向滚动。
  for (const width of [1440,1200,900,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    for (const locale of ['zh','en']) {
      for (const route of ['insights','knowledge','editor/r-demo']) {
        await visit(`/${locale}/${route}`);
        await check("document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth", `${width}px ${locale}/${route} 没有整页横向溢出`);
        await check("![...document.querySelectorAll('button,input,[role=combobox]')].filter(el=>el.getClientRects().length).some(el=>{let r=el.getBoundingClientRect(); if (r.width<1) return false; for(let p=el.parentElement;p;p=p.parentElement) if(['auto','scroll'].includes(getComputedStyle(p).overflowX)) return false; return r.left < -1 || r.right > innerWidth+1;})", `${width}px ${locale}/${route} 操作控件不被窗口截断`);
        if (width===390 && locale==='zh' && route==='editor/r-demo') {
          await click('text:简历模块');
          await click('text:工作经历');
          await waitFor("!document.querySelector('[role=dialog]')");
          await check(`!!document.querySelector(${q(field)})`, '窄屏模块导航关闭抽屉并打开字段');
          await select(field,0,2);
          await click(`${toolbar} button[aria-label="颜色"]`);
          await click('[role="menu"][aria-label="颜色"] button[aria-label="#c0392b"]');
          await check(`document.querySelector(${q(field+' span')}).style.color==='rgb(192, 57, 43)'`, '窄屏格式菜单可见且可操作');
        }
        await clean();
        if(locale==='zh' || width===1200) await browser.screenshot(path.join(out,`${locale}-${route.replaceAll('/','-')}-${width}.png`));
      }
    }
  }
  console.log(`UI: ${checks} checks passed; screenshots: ${out}`);
} catch(error) {
  await browser.screenshot(path.join(out,'failure.png'));
  throw error;
} finally { await browser.close(); }
