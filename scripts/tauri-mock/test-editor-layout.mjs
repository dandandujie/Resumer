// 四项界面反馈的回归测试；所有修改只写入隔离的内存后端。
import assert from 'node:assert/strict';
import { launchBrowser, delay } from './browser.mjs';
const browser = await launchBrowser({width:1200,height:800});
const { evaluate, click, key, waitFor, send } = browser;
const base = process.env.BASE || 'http://127.0.0.1:5174';
let checks=0;
const check = async (expression, message) => { assert.equal(await evaluate(expression),true,message); checks++; };
const order = () => evaluate(`(async()=> (await window.__appModule('/src/stores/resume-store.ts')).useResumeStore.getState().sections.map(s=>s.id).join(','))()`);
const undo = async () => { await click('button[title="撤销"]'); await delay(100); };
try {
  await browser.navigate(base+'/zh/editor/r-demo');
  await check("!!window.__TAURI_INTERNALS__ && document.documentElement.outerHTML.includes('Tauri 假后端')",'使用隔离后端');
  await waitFor("!!document.querySelector('[data-module-id=\"s-we\"]')");
  const before = await order();
  await click('[data-module-id="s-we"] button[aria-label="上移：工作经历"]');
  assert.notEqual(await order(),before,'上移实际改变保存顺序'); checks++;
  await check("[...document.querySelectorAll('[data-section][data-section-id]')].findIndex(e=>e.dataset.sectionId==='s-we') < [...document.querySelectorAll('[data-section][data-section-id]')].findIndex(e=>e.dataset.sectionId==='s-sum')",'预览同步排序');
  await undo(); assert.equal(await order(),before,'排序可撤销'); checks++;
  // 使用 dnd-kit 的键盘拖拽路径，不绕过用户操作直接重排数据。
  await click('[aria-label="拖动排序：工作经历"]');
  await key('Space'); await key('ArrowDown'); await key('Space'); await delay(150);
  assert.notEqual(await order(),before,'拖拽手柄支持键盘排序'); checks++;
  await undo(); assert.equal(await order(),before); checks++;
  await click('[data-module-id="s-we"] button[aria-label="删除模块：工作经历"]');
  await check("!document.querySelector('[data-module-id=\"s-we\"]') && !document.querySelector('[data-section-id=\"s-we\"]')",'删除同步列表和预览');
  await undo(); assert.equal(await order(),before,'删除可撤销'); checks++;
  await click('text:自定义模块');
  await check(`(async()=> (await window.__appModule('/src/stores/resume-store.ts')).useResumeStore.getState().sections.at(-1).type==='custom')()`,'可直接添加模块');
  await undo();
  // 给示例添加测试头像，检查照片、姓名、联系方式三个区域的几何关系。
  await evaluate(`(async()=>{const s=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;const pi=s.getState().sections.find(s=>s.type==='personal_info');s.getState().updateSection(pi.id,{avatar:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='});})()`);
  await check(`(()=>{const h=document.querySelector('[data-personal-heading]'), p=h.getBoundingClientRect(),a=h.querySelector('img').getBoundingClientRect(),n=h.querySelector('h1').getBoundingClientRect(),c=h.nextElementSibling.getBoundingClientRect();return a.right<n.left && Math.abs((a.left+n.right)/2-(p.left+p.right)/2)<2 && c.top>=a.bottom && getComputedStyle(h.nextElementSibling).justifyContent==='center'})()`,'照片在左、姓名在右且整体居中，联系方式在下方居中');
  await click('[role=tab][id$="-trigger-style"]');
  await click('text:标准');
  await check(`(async()=> (await window.__appModule('/src/stores/resume-store.ts')).useResumeStore.getState().currentResume.themeConfig.primaryColor==='#1a1a1a')()`,'预设直接应用到主题');
  await undo();
  await click('text:小四 12pt');
  await check(`(async()=> (await window.__appModule('/src/stores/resume-store.ts')).useResumeStore.getState().currentResume.themeConfig.fontSize===16)()`,'字号直接应用');
  await undo();
  await click('text:工作经历');
  await check("document.querySelector('[role=tab][id$=\"-trigger-edit\"]').getAttribute('data-state')==='active'",'选中模块会回到编辑');
  for(const locale of ['zh','en']) {
    await browser.navigate(base+`/${locale}/editor/r-demo`);
    for(const [width,height] of [[1440,900],[1200,800],[900,600],[390,600]]) {
      console.log('Checking',locale,width,height);
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false}); await delay(300);
      if(width>=768) await check("(()=>{const e=document.querySelector('[data-module-id=\"s-we\"] button[aria-label]');return !!e && e.getClientRects().length>0 && getComputedStyle(e).visibility==='visible'})()",`${width} 模块管理常驻`);
      await click(locale==='zh'?'button[title="设置"]':'button[title="Settings"]'); await delay(250);
      for(const tab of ['general','ai']) {
        await click(`[role=dialog] [role=tab][id$="-trigger-${tab}"]`);
        await check(`(()=>{const d=document.querySelector('[role=dialog]'),r=d.getBoundingClientRect(),f=[...d.querySelectorAll('button')].find(e=>e.textContent.trim()==='${locale==='zh'?'完成':'Done'}').getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight+1 && r.left>=0 && r.right<=innerWidth+1 && f.bottom<=innerHeight && d.scrollHeight<=d.clientHeight+1})()`,`${locale} ${width}×${height} ${tab} 设置不越界`);
      }
      await click('[role=dialog] [role=tab][id$="-trigger-ai"]');
      await click(locale==='zh'?'text:挑选模型':'text:Pick models');
      await delay(250);
      await check("[...document.querySelectorAll('[role=dialog]')].every(e=>{const r=e.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight+1})",`${locale} ${width} 嵌套模型窗口不越界`);
      await key('Escape'); await waitFor("document.querySelectorAll('[role=dialog]').length===1");
      await click(locale==='zh'?'text:完成':'text:Done'); await waitFor("!document.querySelector('[role=dialog]')");
      await click('[role=tab][id$="-trigger-style"]');
      await check("(()=>{const e=document.querySelector('[role=region]'),r=e.getBoundingClientRect();return r.width>250 && r.right<=innerWidth+1 && e.scrollWidth<=e.clientWidth+1 && !e.querySelector('[data-slot=popover-trigger]')})()",`${locale} ${width} 排版为完整可滚动面板`);
      await check("document.documentElement.scrollWidth<=innerWidth",`${locale} ${width} 页面不横向溢出`);
    }
  }
  assert.deepEqual(browser.errors,[],'没有运行时错误');
  console.log(`Editor layout: ${checks} checks passed`);
} finally { await browser.close(); }
