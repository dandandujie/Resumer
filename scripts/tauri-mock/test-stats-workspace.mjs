// 验证整页设置的视口边界、跨页面外观继承、文档纸张隔离与主从导航。
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { launchBrowser, delay } from './browser.mjs';
const b = await launchBrowser({width:1200,height:800});
const {evaluate,click,waitFor,send}=b;
const base=process.env.BASE||'http://127.0.0.1:5174';
let checks=0;
const check=async(expr,label)=>{assert.equal(await evaluate(expr),true,label);checks++;};
const openSettings=async()=>{await evaluate("(()=>{const s=window.__jadeSettingsStore;return !!s})()");await evaluate("(async()=>{const m=await window.__appModule('/src/stores/ui-store.ts');m.useUIStore.getState().openModal('settings');})()");await waitFor("!!document.querySelector('[data-settings-workspace]')");};
const bounds=()=>check("(()=>{const r=document.querySelector('[data-settings-workspace]').getBoundingClientRect();return Math.abs(r.x)<1&&Math.abs(r.y)<1&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1})()",'整页设置完整位于视口，没有旧弹窗居中裁切');
const appearance=()=>evaluate("document.documentElement.getAttribute('data-appearance')");
try{
 await b.navigate(base+'/zh/dashboard');
 await check("document.documentElement.lang==='zh' && !/Fraunces|Instrument/.test(getComputedStyle(document.querySelector('h1')).fontFamily)",'中文使用系统无衬线，清除旧字体');
 await check("document.querySelector('h1').getBoundingClientRect().height<40",'页面标题保持紧凑');
 await openSettings();await bounds();
 await click('[data-appearance-choice=dark]');await waitFor("document.documentElement.dataset.appearance==='dark'");
 await click('text:返回应用');await waitFor("!document.querySelector('[data-settings-workspace]')");
 assert.equal(await appearance(),'dark');checks++;
 await check("getComputedStyle(document.querySelector('.app-detail')).backgroundColor==='rgb(13, 13, 15)'",'主画布继承深色而非页面内重置');
 await b.navigate(base+'/zh/knowledge');
 await check("document.documentElement.dataset.appearance==='dark' && getComputedStyle(document.querySelector('[data-library-workspace]')).backgroundColor==='rgb(13, 13, 15)'",'知识库跨路由维持深色');
 await b.navigate(base+'/zh/editor/r-demo');
 await check("document.documentElement.dataset.appearance==='dark'",'编辑器继承深色偏好');
 await check("getComputedStyle(document.querySelector('[data-preview-viewport] > div > div')).backgroundColor==='rgb(255, 255, 255)'",'深色界面不改变白色文档纸张');
 await check("parseFloat(getComputedStyle(document.querySelector('[data-document-actions] [data-ui-button] span')).fontSize)>=12",'文档操作标注保持可读尺寸，不被根字号再次缩小');
 await check("(()=>{const paper=document.querySelector('[data-theme-scope]');return getComputedStyle(paper).colorScheme.includes('light')&&[...paper.querySelectorAll('h1,h2,[data-field=company],[data-field=position]')].every(e=>getComputedStyle(e).color==='rgb(26, 26, 26)')})()",'深色外观不渗入纸张，姓名/标题/公司/职位仍使用文档文字色');
 await check("[...document.querySelectorAll('[data-document-actions] [data-ui-button]')].length===4 && [...document.querySelectorAll('[data-document-actions] [data-ui-button]')].every(b=>b.getClientRects().length)",'保存导入导出历史四个主操作常显');
 await click('[data-module-id="s-we"] button[aria-pressed]');
 await check("document.querySelector('[data-module-actions]').dataset.moduleActions==='s-we' && document.querySelectorAll('[data-module-actions] button').length===4",'当前板块操作集中常显，与选中目标一致');
 await openSettings();await bounds();await click('text:通用设置');await click('[data-appearance-choice=light]');await click('text:返回应用');
 await check("document.documentElement.dataset.appearance==='light'",'设置返回编辑器保留浅色');
 await b.navigate(base+'/zh/insights');await waitFor("!!document.querySelector('.journal-application-row')");await click('.journal-application-row');
 await check("!!document.querySelector('[data-application-detail]') && !document.querySelector('[role=dialog]')",'投递详情采用主从工作区，保留列表上下文');
 await check("document.querySelectorAll('.application-record-item').length===6",'详情工作区能直接切换其他投递');
 await check("[...document.querySelectorAll('[data-application-detail] [role=tablist] button')].every(button=>button.getBoundingClientRect().height<34)",'详情分段标签单行显示，不挤成两行');
 await click('[data-application-back]');await check("!document.querySelector('[data-application-detail]') && document.querySelectorAll('.journal-application-row').length===6",'返回恢复原投递列表');
 for(const [width,height]of [[1200,800],[900,600],[390,700]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const path of ['dashboard','knowledge','editor/r-demo']){
   await b.navigate(base+'/zh/'+path);await check("document.documentElement.scrollWidth<=innerWidth+1",`${width}px ${path} 无页面横向溢出`);
  }
  await openSettings();await bounds();await check("document.documentElement.scrollWidth<=innerWidth+1",`${width}px 设置保持页面边界`);await click('text:返回应用');
 }
 mkdirSync('/tmp/resumer-stats-proof',{recursive:true});await b.screenshot('/tmp/resumer-stats-proof/editor-mobile.png');
 assert.deepEqual(b.errors,[],'新工作区无运行时异常');console.log(`PASS 参考风格工作区与外观 ${checks} 项`);
}catch(e){console.log(await evaluate('document.body.innerText.slice(-4500)'));await b.screenshot('/tmp/resumer-stats-workspace-error.png');throw e;}finally{await b.close();}
