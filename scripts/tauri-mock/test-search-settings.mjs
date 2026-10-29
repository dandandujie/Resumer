// 设置页合并、全部搜索配置常显、凭据独立传递及测试结果过期保护。
import assert from 'node:assert/strict';
import { launchBrowser, delay } from './browser.mjs';
const b=await launchBrowser({width:1200,height:800});
const {evaluate,click,send,key,waitFor}=b;
const base=process.env.BASE || 'http://127.0.0.1:5174';
let checks=0;
const check=async(expr,message)=>{assert.equal(await evaluate(expr),true,message);checks++;};
// 此处只做标签范围定位，避免相同 API Key 标签互相串台。
const fill=async(id,label,value)=>{
 const selector=await evaluate(`(()=>{const s=document.querySelector('[data-search-service="${id}"]'),labels=[...s.querySelectorAll('label')],l=labels.find(l=>l.querySelector('span')?.textContent==='${label}'),i=l?.querySelector('input');if(!i)throw new Error('字段未找到');i.dataset.testField='${id}-${label}';return '[data-test-field="${id}-${label}"]'})()`);
 await click(selector);await key('Meta+a');await send('Input.insertText',{text:value});await delay(80);
};
try {
 await b.navigate(base+'/zh/editor/r-demo');await click('button[title="设置"]');
 await check("!!window.__TAURI_INTERNALS__ && document.documentElement.outerHTML.includes('Tauri 假后端')",'使用隔离后端');
 await check("document.querySelectorAll('[role=dialog] [role=tab]').length===2 && document.querySelector('[role=tab][id$=\"-trigger-general\"]').dataset.state==='active'",'设置只保留通用与 AI 两个入口');
 await check("document.querySelector('[role=tabpanel][id$=\"-content-general\"]').textContent.includes('自动保存') && document.querySelector('[role=tabpanel][id$=\"-content-general\"]').textContent.includes('数据与备份')",'偏好、搜索和备份在同一页');
 await check("document.querySelectorAll('[data-search-service]').length===11",'全部既有与新增搜索方式列出');
 const fields=await evaluate("[...document.querySelectorAll('[data-search-service] input:not([type=radio])')].length");
 await click('[data-search-service="off"] input[type=radio]');
 await check(`document.querySelectorAll('[data-search-service] input:not([type=radio])').length===${fields} && [...document.querySelectorAll('[data-search-service] input:not([type=radio])')].every(e=>e.getClientRects().length>0)`, '关闭搜索也不隐藏配置');
 await fill('deepseek','API Key','test-deepseek-secret');
 await fill('deepseek','API 地址','https://search.example.test/anthropic/v1');
 await fill('deepseek','搜索模型','deepseek-v4-flash');
 await fill('deepseek-api','API 地址','https://search.example.test/v1/tools');
 await fill('doubao','API Key','test-ark-secret');
 await fill('doubao','搜索模型','ep-test');
 await fill('doubao','API 地址','https://ark.example.test/api/v3');
 await click('[data-search-service="deepseek-api"] input[type=radio]');
 await check(`(async()=>{const c=(await window.__appModule('/src/lib/tauri-api.ts')).getAIConfig();return c.webSearchMode==='deepseek-api' && c.deepseekApiKey==='test-deepseek-secret' && c.deepseekSearchUrl==='https://search.example.test/v1/tools' && c.doubaoApiKey==='test-ark-secret' && c.doubaoModel==='ep-test' && c.doubaoBaseUrl==='https://ark.example.test/api/v3'})()`,'新凭据与端点传到请求层，保持各服务独立');
 await click('[data-search-service="doubao"] button');await waitFor("document.querySelector('[data-search-service=\"doubao\"] [role=status]')?.textContent.includes('1 条来源')");checks++;
 await check("document.querySelector('[data-search-service=\"deepseek-api\"] input[type=radio]').checked",'测试其他服务不更改当前搜索选择');
 await evaluate(`window.__searchInvoke=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=(cmd,args)=>cmd==='ai_test_search'?new Promise(resolve=>window.__resolveSearch=resolve):window.__searchInvoke(cmd,args)`);
 await click('[data-search-service="deepseek"] button');
 await waitFor('!!window.__resolveSearch');await fill('deepseek','搜索模型','different-model');
 await evaluate(`window.__resolveSearch({engine:'deepseek',results:[{url:'https://example.com'}]})`);await delay(100);
 await check("!document.querySelector('[data-search-service=\"deepseek\"] [role=status]')",'配置改变后丢弃旧测试响应');
 await evaluate('window.__TAURI_INTERNALS__.invoke=window.__searchInvoke');
 await check(`(async()=>{const api=await window.__appModule('/src/lib/tauri-api.ts');const backup=api.collectLocalSettings(),entries=JSON.parse(backup);localStorage.setItem('resumer_doubao_search_model','changed-after-backup');api.applyLocalSettings(backup);return entries.resumer_deepseek_search_key==='test-deepseek-secret' && entries.resumer_doubao_search_key==='test-ark-secret' && localStorage.getItem('resumer_doubao_search_model')==='ep-test'})()`,'新搜索配置随备份导出和恢复');
 await key('Escape');await b.navigate(base+'/zh/editor/r-demo');await click('button[title="设置"]');
 await check("document.querySelector('[data-search-service=\"deepseek-api\"] input[type=radio]').checked && document.querySelector('[data-search-service=\"deepseek-api\"] input[type=password]').value==='test-deepseek-secret'",'刷新保留搜索模式与配置');
 for(const width of [1440,1200,900,390]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:600,deviceScaleFactor:1,mobile:false});await delay(300);
  for(const id of ['general','ai']) {
   await click(`[role=dialog] [role=tab][id$="-trigger-${id}"]`);
   await check("(()=>{const d=document.querySelector('[role=dialog]'),r=d.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight+1 && r.left>=0 && r.right<=innerWidth+1 && d.scrollHeight<=d.clientHeight+1})()",`${width} 设置不超出窗口`);
  }
  await click('[role=dialog] [role=tab][id$="-trigger-general"]');
  await check("(()=>{const p=document.querySelector('[role=tabpanel][id$=\"-content-general\"]');return p.scrollWidth<=p.clientWidth+1})()",`${width} 全部搜索配置不横向溢出`);
 }
 assert.deepEqual(b.errors,[]);
 console.log(`Search settings: ${checks} checks passed`);
} finally {await b.close();}
