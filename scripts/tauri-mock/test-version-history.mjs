// 隔离数据验证版本身份、持久化动作、恢复保护、失败与异步竞态。
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, delay } from './browser.mjs';
const b=await launchBrowser({width:1440,height:900});
const {evaluate,click,key,send,waitFor}=b;
const base=process.env.BASE||'http://127.0.0.1:5174';
let checks=0;
const check=async(expr,label)=>{assert.equal(await evaluate(expr),true,label);checks++;};
const api=code=>evaluate(`(async()=>{const a=await window.__appModule('/src/lib/tauri-api.ts');return ${code};})()`);
const store=code=>evaluate(`(async()=>{const s=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;${code}})()`);
const close=async()=>{await waitFor("!document.querySelector('[role=alertdialog]')");await key('Escape');await waitFor("!document.querySelector('[data-version-workspace]')");};
const open=async()=>{await click('button[title="版本历史"]');await waitFor("document.querySelector('[data-current-draft]') && !document.querySelector('[data-version-workspace] [role=status]')");};
const inputName=async(name)=>{await click('input[aria-label="版本名称"]');await key('Meta+a');await send('Input.insertText',{text:name});};
const submit=async()=>{await click('[data-version-workspace] form button[type=submit]');await waitFor("!document.querySelector('[data-version-workspace] form')");};
try {
 await b.navigate(base+'/zh/editor/r-demo');
 await check("!!window.__TAURI_INTERNALS__",'隔离测试后端');
 const count=await api("(await a.listResumeVersions('r-demo')).length");
 await open();
 await check("document.querySelector('[data-current-draft]').getAttribute('aria-current')==='true' && !document.querySelector('[data-resume-version][aria-current=true]')",'当前草稿独立于所有历史记录');
 assert.equal(await api("(await a.listResumeVersions('r-demo')).length"),count,'打开历史不自动写版本');checks++;
 await click('[data-resume-version="v-2"]');await waitFor("document.querySelector('[data-version-preview]')?.textContent.includes('历史公司')");
 await check("![...document.querySelectorAll('button')].find(e=>e.textContent==='恢复此版本')?.disabled",'唯一或最新的历史版本仍能恢复');
 await click('text:变更对比 · 1');
 await check("document.querySelector('[data-version-comparison]').textContent.includes('历史公司') && document.querySelector('[data-version-comparison]').textContent.includes('鲸跃科技')",'对比展示历史和当前内容');
 await click('text:保存为版本');await inputName('投递前定稿');await submit();
 const named=await api("(await a.listResumeVersions('r-demo')).find(v=>v.name==='投递前定稿')");assert.ok(named);checks++;
 await check("document.querySelector('[data-version-workspace]').textContent.includes('与当前内容相同')",'手动保存的是当前草稿而非选中旧版');
 await click('[data-version-workspace] button[title="重命名"]');await inputName('产品经理最终版');await submit();
 assert.equal((await api(`a.getResumeVersion('${named.id}')`)).name,'产品经理最终版');checks++;
 await click('input[aria-label="搜索版本名称或时间"]');await send('Input.insertText',{text:'不存在的名称'});
 await check("document.querySelector('[data-version-workspace]').textContent.includes('没有匹配的记录')",'空搜索有明确反馈');
 await key('Meta+a');await key('Backspace');await close();
 await store("s.getState().updateSection('s-we',{items:s.getState().sections.find(x=>x.id==='s-we').content.items.map((i,n)=>n===0?{...i,company:'今天的新修改'}:i)});await s.getState().flushPendingSave();");
 await open();await click(`[data-resume-version="${named.id}"]`);await waitFor("document.querySelector('[data-version-preview]')?.textContent.includes('鲸跃科技')");
 await check("!document.querySelector('[data-version-preview]').textContent.includes('今天的新修改')",'命名版本不被后续保存覆盖');
 await click('text:恢复此版本');await waitFor("!!document.querySelector('[role=alertdialog]')");
 await check("document.querySelector('[role=alertdialog]').textContent.includes('恢复前')",'恢复前说明草稿保护');
 await click('[role=alertdialog] button:last-child');await waitFor("!document.querySelector('[data-version-workspace]')");
 assert.equal((await api("a.getResume('r-demo')")).sections.find(x=>x.id==='s-we').content.items[0].company,'鲸跃科技');checks++;
 const safety=await api("(await a.listResumeVersions('r-demo')).find(v=>v.event==='restore')");
 assert.equal((await api(`a.getResumeVersion('${safety.id}')`)).snapshot.sections.find(x=>x.id==='s-we').content.items[0].company,'今天的新修改');checks++;
 await open();await check("document.querySelector('[data-current-draft]').getAttribute('aria-current')==='true' && !document.querySelector('[data-resume-version][aria-current=true]')",'恢复前记录不能冒充当前草稿');
 await click(`[data-resume-version="${named.id}"]`);await waitFor("document.querySelector('[data-version-preview]')?.textContent.includes('鲸跃科技')");
 await click('[data-version-workspace] button[title="删除"]');await waitFor("!!document.querySelector('[role=alertdialog]')");await click('text:取消');
 assert.ok(await api(`a.getResumeVersion('${named.id}')`));checks++;
 await click('[data-version-workspace] button[title="删除"]');await click('[role=alertdialog] button:last-child');await waitFor(`!document.querySelector('[data-resume-version="${named.id}"]')`);
 assert.equal(await api(`a.getResumeVersion('${named.id}')`),null);checks++;
 await check("document.querySelector('[data-current-draft]').getAttribute('aria-current')==='true'",'删除历史后回到工作稿');
 // 历史详情慢返回时切回草稿，旧响应不能替换当前预览。
 await evaluate("(()=>{const base=window.__TAURI_INTERNALS__.invoke;window.__detailInvoke=base;window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{if(cmd==='get_resume_version' && args.id==='v-2')await new Promise(r=>setTimeout(r,250));return base(cmd,args)};})()");
 await click('[data-resume-version="v-2"]');await click('[data-current-draft]');await delay(300);
 await check("document.querySelector('[data-current-draft]').getAttribute('aria-current')==='true' && !document.querySelector('[data-version-preview]').textContent.includes('历史公司')",'详情过期响应不能覆盖草稿');
 await evaluate("window.__TAURI_INTERNALS__.invoke=window.__detailInvoke;void 0");
 assert.deepEqual(b.errors,[],'此前所有动作无运行时异常');
 // 保存失败必须阻止版本创建；保留名称和表单，便于重试。
 await close();await store("s.getState().setTitle('未落盘的草稿');");
 await evaluate("window.__savedInvoke=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{if(cmd==='update_resume')throw new Error('模拟写盘失败');return window.__savedInvoke(cmd,args)}");
 await open();await click('text:保存为版本');await inputName('失败不应留档');await click('[data-version-workspace] form button[type=submit]');await delay(150);
 await check("!!document.querySelector('[data-version-workspace] form') && document.querySelector('[role=alert]').textContent.includes('模拟写盘失败')",'写盘失败不关闭表单且显示原因');
 assert.ok(!(await api("a.listResumeVersions('r-demo')")).some(v=>v.name==='失败不应留档'));checks++;
 await evaluate("window.__TAURI_INTERNALS__.invoke=window.__savedInvoke");await submit();
 await check("document.querySelector('[data-version-workspace]').textContent.includes('失败不应留档')",'失败后可原地重试');
 await close();
 // 慢保存期间继续输入，flush 必须等待第二轮保存。
 await evaluate("window.__writes=[];window.__savedInvoke=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{if(cmd==='update_resume'){window.__writes.push(args.payload.title);if(window.__writes.length===1)await new Promise(r=>setTimeout(r,200));}return window.__savedInvoke(cmd,args)}");
 await store("s.getState().setTitle('第一次写入');window.__flush=s.getState().flushPendingSave();");
 await delay(60);await store("s.getState().setTitle('保存期间继续输入');");await evaluate('window.__flush');
 await check("window.__writes.join('|')==='第一次写入|保存期间继续输入'",'保存队列不丢保存期间的新输入');
 await check("window.__TAURI_MOCK__.resumes['r-demo'].title==='保存期间继续输入'",'最终草稿实际落库');
 await evaluate("window.__TAURI_INTERNALS__.invoke=window.__savedInvoke");
 await b.navigate(base+'/zh/editor/r-demo');
 await click('button[title="导入"]');
 await click('text:替换当前简历（保留历史版本）');
 await evaluate(`(()=>{const data=structuredClone(window.__TAURI_MOCK__.resumes['r-demo']);data.title='JSON 导入的新内容';data.sections.find(s=>s.type==='work_experience').content.items[0].company='导入公司';const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(data)],'history-test.json',{type:'application/json'}));const input=document.querySelector('[role=dialog] input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await click('[role=dialog] [data-slot=dialog-footer] button:last-child');
 await waitFor("!document.querySelector('[role=dialog]')");
 const beforeImport=await api("(await a.listResumeVersions('r-demo')).find(v=>v.event==='import')");
 assert.ok(beforeImport);checks++;
 assert.equal((await api(`a.getResumeVersion('${beforeImport.id}')`)).snapshot.sections.find(s=>s.type==='work_experience').content.items[0].company,'鲸跃科技');checks++;
 assert.equal((await api("a.getResume('r-demo')")).sections.find(s=>s.type==='work_experience').content.items[0].company,'导入公司');checks++;
 for(const locale of ['zh','en']) {
  await b.navigate(base+`/${locale}/editor/r-demo`);
  for(const width of [1440,1200,900,390]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});await delay(100);
   for(const label of locale==='zh'?['保存','导入','导出','版本历史']:['Save','Import','Export','Version history']) await check(`[...document.querySelectorAll('[data-document-actions] button')].some(e=>e.textContent.trim()===${JSON.stringify(label)} && e.getClientRects().length)`,`${width} ${locale} ${label} 常显`);
   await click(locale==='zh'?'button[title="版本历史"]':'button[title="Version history"]');await waitFor("!!document.querySelector('[data-current-draft]')");
   await check("(()=>{const el=document.querySelector('[data-version-workspace]'),r=el.getBoundingClientRect();return r.x>=0 && r.y>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1 && el.scrollWidth<=el.clientWidth+1})()",`${width} ${locale} 版本面板不超窗`);
   await close();
  }
 }
 mkdirSync('/tmp/resumer-history-ui',{recursive:true});
 await b.navigate(base+'/zh/editor/r-demo');await open();await click('[data-resume-version="v-2"]');await waitFor("document.querySelector('[data-version-preview]')?.textContent.includes('历史公司')");await b.screenshot('/tmp/resumer-history-ui/preview.png');
 assert.deepEqual(b.errors.filter(e=>!e.includes('Failed to save resume:') && !e.includes('模拟写盘失败')),[],'没有非预期运行时错误');
 console.log(`Version history: ${checks} checks passed`);
} catch(error) {mkdirSync('/tmp/resumer-history-ui',{recursive:true});await b.screenshot('/tmp/resumer-history-ui/failure.png');writeFileSync('/tmp/resumer-history-ui/failure.html',await evaluate('document.documentElement.outerHTML'));throw error;} finally {await b.close();}
