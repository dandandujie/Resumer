import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { launchBrowser, delay } from './browser.mjs';
const b = await launchBrowser({width:1200,height:850});
const { evaluate, click, key, send, waitFor } = b;
const base = process.env.BASE || 'http://127.0.0.1:5174';
const out = process.env.OUT || '/tmp/resumer-work-notes';
mkdirSync(out,{recursive:true});
let checks=0;
const check=async (expression,label)=>{assert.equal(await evaluate(expression),true,label);checks++;};
const enterExperience=async()=>{await waitFor("[...document.querySelectorAll('[data-experience-workspace] button')].some(b=>b.textContent.includes('鲸跃科技'))");await click('[data-work-experience]');await waitFor('!!document.querySelector("#work-note-body")');};
const fill=async (selector,text)=>{await click(selector);await key('Meta+a');await send('Input.insertText',{text});};
try {
  await b.navigate(base+'/zh/work-notes?note_fail_save=1');await enterExperience();
  await waitFor('!!document.querySelector("#work-note-body")');
  await check("document.querySelector('section[aria-label=\"随手记一段\"] summary').textContent.includes('仅本机记录')",'没有AI也能打开记录');
  await check("[...document.querySelectorAll('textarea')].filter(e=>e.checkVisibility()).length===1 && [...document.querySelectorAll('[role=combobox],input[type=checkbox]')].every(e=>!e.checkVisibility())",'默认只展示记录输入，不提前展示回顾表单和选择框');
  await check("[...document.querySelectorAll('[data-variant=primary]')].filter(e=>e.checkVisibility()).length===1",'默认只有一个主操作');
  await click('section[aria-label="随手记一段"] summary');
  await check("document.querySelector('#auto-note-analysis').checkVisibility() && document.querySelector('input[type=date]').checkVisibility()",'记录选项按需展开，AI控制与补记可发现');
  await click('section[aria-label="随手记一段"] summary');
  await fill('#work-note-body','每天维护报表，参与一次排查，结果还不清楚。');
  await evaluate(`document.querySelector('#work-note-body').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,isComposing:true,bubbles:true}))`);
  await check('window.__TAURI_MOCK__.workNotes.length===0','中文组字不误提交');
  await click('text:记下了');
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('写盘失败')");
  await check("document.querySelector('#work-note-body').value.includes('每天维护报表') && window.__TAURI_MOCK__.workNotes.length===0",'保存失败保留输入');
  await click('text:记下了'); await waitFor('window.__TAURI_MOCK__.workNotes.length===1');
  await check("window.__TAURI_MOCK__.workNotes[0].analysis===null && document.querySelector('#work-note-body').value===''",'无AI仍可独立保存');
  await fill('#work-note-body','稍后接着说的草稿');
  await b.navigate(base+'/zh/work-notes?ai_review=1&note_fail_analysis=1&note_fail_compose=1');await enterExperience();
  await check("document.querySelector('#work-note-body').value==='稍后接着说的草稿'",'刷新保留未提交输入');
  await fill('#work-note-body','上线时发现空值，我补上校验并参与回归。');
  await click('text:记下了');await waitFor('window.__TAURI_MOCK__.workNotes.length===2');
  await waitFor("document.body.textContent.includes('模拟 AI 离线')");
  await check("window.__TAURI_MOCK__.workNotes.some(n=>n.body.includes('空值')&&n.analysis===null)",'AI失败原话已落库');
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='重试整理'&&b.checkVisibility()&&!b.disabled)");
  await click('text:重试整理');await waitFor('window.__TAURI_MOCK__.workNotes.some(n=>n.analysis)');
  await click('text:找回片段');
  await check("document.querySelector('[data-note-recall-controls]').checkVisibility() && document.querySelector('[data-work-note] input[type=checkbox]').checkVisibility()",'回顾入口展开后可以检索与选片段');
  await check("!document.querySelector('[data-note-filters]').open && document.querySelector('textarea[aria-label=\"想回顾什么\"]').checkVisibility()",'回想先说需求，精确筛选按需展开');
  await click('[data-note-filters] > summary');
  await fill('input[aria-label="搜索随记原话"]','空值');await waitFor('document.querySelectorAll("[data-work-note]").length===1');
  await check("document.querySelector('[data-work-note]').textContent.includes('上线')",'原话检索生效');
  await click('text:收起回顾');
  await check("document.body.innerText.includes('筛选中') && document.body.innerText.includes('空值') && !document.querySelector('[data-note-recall-controls]').checkVisibility()",'收起仍明确展示正在生效的筛选');
  await click('text:找回片段');
  await fill('textarea[aria-label="想回顾什么"]','只想看看那次上线的处理');
  await click('text:整理成简历素材');await waitFor("document.body.textContent.includes('模拟整理失败')");
  await check('window.__TAURI_MOCK__.workNotes.length===2','整理失败不改原话');
  await check("document.querySelector('textarea[aria-label=\"想回顾什么\"]').value==='只想看看那次上线的处理' && Object.keys(localStorage).some(k=>k.startsWith('resumer_note_question:') && localStorage.getItem(k)==='只想看看那次上线的处理')",'快捷整理失败不覆盖未发送的问题');
  await click('text:整理成简历素材');await waitFor('!!document.querySelector("[data-note-draft]")');
  await check("document.querySelector('[data-note-draft]').textContent.includes('来源经历')",'提案明确来源');
  await check("document.querySelector('textarea[aria-label=\"想回顾什么\"]').value==='' && !document.querySelector('[data-note-materials]').open",'回顾成功后可继续聊，简历编辑按需展开');
  await click('[data-note-materials] > summary');
  await fill('[data-note-draft] textarea','参与上线空值校验和回归');
  await b.navigate(base+'/zh/work-notes?ai_review=1');await enterExperience();await waitFor('!!document.querySelector("[data-note-draft] textarea")');
  await check("document.querySelector('[data-note-draft] textarea').value==='参与上线空值校验和回归'",'审阅编辑关闭后恢复');
  await check("!document.querySelector('[data-note-draft]').open && document.querySelector('[data-note-draft] > summary').textContent.includes('上次的整理')",'旧提案留入口但不占满记录页面');
  await waitFor('!!document.querySelector("[data-work-note]")');await click('[data-work-note] [aria-label="随记操作"]');
  await click('text:修改原话');await fill('textarea[aria-label="修改原话"]','更正：我只是旁听上线排查。');await click('text:保存原话');
  await waitFor("document.querySelector('[data-note-draft]').textContent.includes('来源已修改')");checks++;
  await b.navigate(base+'/zh/editor/r-demo?ai_review=1');
  await waitFor('!!document.querySelector("[data-preview-paper]")');
  await evaluate(`(async()=>{const {useEditorStore}=await window.__appModule('/src/stores/editor-store.ts');useEditorStore.getState().selectSection('s-we');useEditorStore.getState().setActiveItem({sectionId:'s-we',itemId:'we-1'});})()`);
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='从随记补充')");
  await click('text:从随记补充');await waitFor("!!document.querySelector('[aria-label=选择素材来源经历]')");await click('[aria-label=选择素材来源经历]');await waitFor("document.querySelectorAll('[role=option]').length>1");await click('[role=option]:nth-child(2)');await waitFor("!![...document.querySelectorAll('button')].find(b=>b.textContent==='整理成简历素材'&&!b.disabled)");await click('text:整理成简历素材');await waitFor('!!document.querySelector("[data-note-draft]")');
  await check("[...document.querySelectorAll('[data-note-draft] button')].find(b=>b.textContent.includes('将选中素材')).disabled",'归属未经核对不能写简历');
  await click('[data-note-materials] label.bg-muted input');
  await click('text:将选中素材补入这段经历');
  await waitFor("document.querySelector('[data-note-draft]').textContent.includes('已补入草稿')");
  await key('Escape');
  await check(`(async()=>{const {useResumeStore}=await window.__appModule('/src/stores/resume-store.ts');return useResumeStore.getState().sections.find(s=>s.id==='s-we').content.items[0].highlights.length>3})()`,'采纳追加到正确经历');
  await evaluate(`(async()=>{const {useEditorStore}=await window.__appModule('/src/stores/editor-store.ts');const {useResumeStore}=await window.__appModule('/src/stores/resume-store.ts');const snapshot=useEditorStore.getState().undo(useResumeStore.getState().sections);useResumeStore.getState().reorderSections(snapshot.sections);})()`);
  await check(`(async()=>{const {useResumeStore}=await window.__appModule('/src/stores/resume-store.ts');return useResumeStore.getState().sections.find(s=>s.id==='s-we').content.items[0].highlights.length===3})()`,'撤销还原原有亮点');
  await b.navigate(base+'/zh/dashboard?ai_review=1');await key('Meta+Shift+j');await waitFor('!!document.querySelector("#work-note-body")');
  await fill('#work-note-body','未完成的随手记');await key('Escape');await key('Meta+Shift+j');
  await check("document.querySelector('#work-note-body').value==='未完成的随手记'",'快捷入口关闭可继续');await key('Escape');
  await b.navigate(base+'/zh/work-notes?ai_review=1');await enterExperience();
  for (const appearance of ['light','dark']) {
    await evaluate(`(async()=>{const {useUIStore}=await window.__appModule('/src/stores/ui-store.ts');useUIStore.getState().setTheme('${appearance}')})()`);
    for (const width of [1200,900,390]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});await delay(150);
      await check('document.documentElement.scrollWidth<=innerWidth+1',`${appearance} ${width}px无横向溢出`);
      if(width===390) await check("document.querySelector('.app-detail > nav').getBoundingClientRect().height<100",'移动导航不占四行');
      await b.screenshot(`${out}/${appearance}-${width}.png`);
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:850,deviceScaleFactor:1,mobile:false});
  await b.navigate(base+'/zh/editor/r-demo?ai_review=1');
  await click('[role=tab][data-state=inactive]:last-child');
  await waitFor(`!!document.querySelector('[aria-label="模型与渠道"]')`);
  await check("!document.querySelector('[data-ai-model-options]')",'AI输入区默认不展开渠道和模型表单');
  await fill('textarea[aria-label="和 AI 讨论简历"]','先保留这段讨论，不要发送');
  await click('[aria-label="模型与渠道"]');
  await check("document.querySelector('[data-ai-model-options] [aria-label=\"AI 渠道\"]')?.checkVisibility() && document.querySelector('[data-ai-model-options] [aria-label=\"模型\"]')?.checkVisibility()",'一个入口能找到渠道和模型');
  await key('Escape');await waitFor("!document.querySelector('[data-ai-model-options]')");
  await check("document.activeElement.getAttribute('aria-label')==='模型与渠道' && document.querySelector('textarea[aria-label=\"和 AI 讨论简历\"]').value==='先保留这段讨论，不要发送'",'关闭模型浮层返回入口且保留输入');
  await evaluate(`(()=>{const s=window.__jadeSettingsStore;const c=s.getState().channels.find(c=>c.id===s.getState().activeChannelId);s.getState().updateChannel(c.id,{models:['mock','qa-second-model']});})()`);
  await click('[aria-label="模型与渠道"]');await click('[data-ai-model-options] [aria-label="模型"]');await click('[role=option]:last-child');
  await waitFor("!document.querySelector('[data-ai-model-options]')");
  await check("document.querySelector('[aria-label=\"模型与渠道\"]').textContent.includes('qa-second-model')",'选择模型生效并收起配置浮层');
  await evaluate(`(()=>{const s=window.__jadeSettingsStore;const id=s.getState().addChannel('验收备用渠道');s.getState().updateChannel(id,{apiKey:'isolated-test-key',baseURL:'https://example.invalid/v1',model:'qa-backup-model',models:['qa-backup-model']});})()`);
  await check("document.querySelector('[aria-label=\"模型与渠道\"]').textContent.includes('qa-backup-model')",'设置中新增并激活渠道后，入口显示实际生效模型');
  await evaluate("window.__jadeSettingsStore.getState().selectChannel('review-ai')");
  await click('[aria-label="模型与渠道"]');await click('[data-ai-model-options] [aria-label="AI 渠道"]');await click('[role=option]:last-child');
  await check("document.querySelector('[data-ai-model-options] [aria-label=\"模型\"]').textContent.includes('qa-backup-model')",'切换渠道后显示该渠道的默认模型');await key('Escape');await waitFor("!document.querySelector('[data-ai-model-options]')");
  await click('[aria-label="模型与渠道"]');await click('text:渠道设置…');
  await waitFor("!!document.querySelector('[data-settings-workspace]')");
  await check(`(async()=>{const {useUIStore}=await window.__appModule('/src/stores/ui-store.ts');return useUIStore.getState().settingsTab==='ai'})()`,'渠道设置直达AI页，不让用户再次寻找');
  await click('text:返回应用');
  await check("document.querySelector('textarea[aria-label=\"和 AI 讨论简历\"]').value==='先保留这段讨论，不要发送'",'配置往返后保留讨论输入');
  for (const width of [1200,900,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});await delay(150);
    await click('[aria-label="模型与渠道"]');
    await check("(()=>{const r=document.querySelector('[data-ai-model-options]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1})()",`${width}px模型浮层不越界`);
    await b.screenshot(`${out}/model-options-${width}.png`);await key('Escape');await waitFor("!document.querySelector('[data-ai-model-options]')");
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:850,deviceScaleFactor:1,mobile:false});
  await b.navigate(base+'/zh/work-notes?ai_review=1');await enterExperience();
  await click('text:找回片段');
  await fill('textarea[aria-label="想回顾什么"]','旧问题 A：回顾上线排查');
  await evaluate(`(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command !== 'work_notes_compose') return original(command, args);
      window.__TAURI_INTERNALS__.invoke = original;
      return new Promise((resolve, reject) => {
        window.__releaseNoteReply = async () => {
          try { resolve(await original(command, args)); }
          catch (error) { reject(error); }
        };
      });
    };
  })()`);
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='一起回想'&&!b.disabled)");
  await click('text:一起回想');
  await waitFor("typeof window.__releaseNoteReply==='function'");
  await click('text:我的经历');
  await waitFor("!document.querySelector('textarea[aria-label=\"想回顾什么\"]')");
  await enterExperience();await click('text:找回片段');
  await fill('textarea[aria-label="想回顾什么"]','新问题 B：稍后想聊协作');
  await evaluate("(async()=>{await window.__releaseNoteReply();await new Promise(requestAnimationFrame);})()");
  await check("document.querySelector('textarea[aria-label=\"想回顾什么\"]').value==='新问题 B：稍后想聊协作' && Object.keys(localStorage).some(k=>k.startsWith('resumer_note_question:') && localStorage.getItem(k)==='新问题 B：稍后想聊协作')",'旧请求返回不清除重新进入后输入的新问题');
  await b.navigate(base+'/zh/work-notes?ai_review=1');await enterExperience();await click('text:找回片段');
  await check("document.querySelector('textarea[aria-label=\"想回顾什么\"]').value==='新问题 B：稍后想聊协作'",'旧请求完成后刷新仍恢复新问题');
  assert.deepEqual(b.errors,[],'新流程无运行时异常');
  console.log(`PASS 工作随记失败恢复 / 来源 / 采纳撤销 / 视口 ${checks} 项；截图 ${out}`);
} catch(e) { console.error(await evaluate('document.body.innerText.slice(-6000)'));await b.screenshot(out+'/error.png');throw e; } finally { await b.close(); }
