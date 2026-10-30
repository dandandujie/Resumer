// 需求核对探针：覆盖旧回归遗漏的字段和生命周期；发现缺口返回 1，执行异常返回 2。
// 使用内存 mock，结果和截图默认保存到 /tmp/resumer-requirement-audit。
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launchBrowser, delay } from './browser.mjs';

const base = process.env.BASE || 'http://127.0.0.1:5174';
const out = process.env.OUT || '/tmp/resumer-requirement-audit';
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const { evaluate, click, select, key, send, waitFor } = browser;
const findings = [];
const toolbar = '[role="toolbar"][aria-label="文字格式"]';
const q = JSON.stringify;
function record(id, expected, observed, passed) {
  findings.push({ id, expected, observed, passed });
  console.log(`${passed ? 'PASS' : 'GAP'} ${id}: ${JSON.stringify(observed)}`);
}
async function visit(route) {
  await browser.navigate(base + route);
  assert.equal(await evaluate("!!window.__TAURI_MOCK__ && document.documentElement.outerHTML.includes('Tauri 假后端')"), true, '必须使用隔离 mock');
}
const highlight = "[...(CSS.highlights.get('resume-editing-selection')?.values() || [])].map(range=>range.toString()).join('')";
async function selectField(selector, length) {
  await select(selector, 0, 0);
  // React textarea 的 onSelect 需要真实键盘/鼠标事件，单独派发 DOM select 事件不足以复现用户操作。
  for (let i = 0; i < length; i++) await key('Shift+ArrowRight');
}
try {
  await visit('/zh/editor/r-demo');
  await selectField('[data-editor-field="fullName"]', 2);
  const name = await evaluate(`({boldEnabled:!document.querySelector(${q(toolbar + ' button[aria-label="粗体"]')}).disabled,highlight:${highlight}})`);
  record('name-format', '姓名选区可以设置粗体，预览定位到所选文字', name, name.boldEnabled && name.highlight === '林晚');
  await browser.screenshot(path.join(out, 'name-format.png'));

  await click(`${toolbar} button[aria-label="字体"]`);
  await click('text:Calibri');
  await click(`${toolbar} button[aria-label="字号"]`);
  await click('[role="menu"][aria-label="字号"] input');
  await key('Meta+a'); await send('Input.insertText', {text:'13.5'}); await key('Enter');
  await click(`${toolbar} button[aria-label="间距"]`);
  await click('[role="menu"][aria-label="间距"] input');
  await key('Meta+a'); await send('Input.insertText', {text:'-0.5'}); await key('Enter');
  const actualFormat = await evaluate(`(() => {
    const span = document.querySelector('[data-section-id="s-pi"] [data-field="fullName"] [data-fmt]');
    return {text:span?.textContent,style:span?.getAttribute('style'),highlight:${highlight}};
  })()`);
  record('name-actual-format', '姓名局部应用 Calibri、13.5pt、负字距并保持选区', actualFormat,
    actualFormat.text === '林晚' && actualFormat.style?.includes('Calibri') && actualFormat.style?.includes('13.5pt') && actualFormat.style?.includes('-0.5pt') && actualFormat.highlight === '林晚');
  await key('Meta+z');
  const undone = await evaluate("document.querySelector('[data-section-id=s-pi] [data-field=fullName] [data-fmt]')?.style.letterSpacing");
  record('spacing-undo', '撤销只移除刚设置的字距', undone, undone === '');
  await key('Meta+Shift+z');
  const savedName = await evaluate(`(async()=>{
    const store=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;
    await store.getState().save();
    const saved=await window.__TAURI_INTERNALS__.invoke('get_resume',{id:'r-demo'});
    return saved.sections.find(s=>s.type==='personal_info').content.fullName;
  })()`);
  record('name-format-save', '局部格式经过保存后保持', savedName, savedName.includes('{{font=calibri}}') && savedName.includes('{{size=13.5}}') && savedName.includes('{{spacing=-0.5}}'));
  await click('text:工作经历');
  await selectField('[data-editor-field="company"]', 2);
  const company = await evaluate(`({boldEnabled:!document.querySelector(${q(toolbar + ' button[aria-label="粗体"]')}).disabled,highlight:${highlight}})`);
  record('company-format', '公司名称选区可以设置格式', company, company.boldEnabled);

  const field = '[data-editor-item-id="we-1"] [data-editor-field="description"]';
  await select(field, 0, 2);
  const initialSelection = await evaluate(highlight);
  record('body-initial-selection', '正文初始选区映射正确（对照组）', initialSelection, initialSelection === '负责');
  await click(`${toolbar} button[aria-label="粗体"]`);
  const body = await evaluate(`({highlight:${highlight},bold:document.querySelector('[data-item-id="we-1"] [data-field="description"] strong')?.textContent})`);
  record('body-format-and-selection', '正文加粗后仍保持逐字预览高亮', body, body.highlight === '负责' && body.bold === '负责');
  await click(`${toolbar} button[aria-label="字体"]`);
  const fonts = await evaluate("[...document.querySelectorAll('[role=menu][aria-label=字体] [role=menuitemradio]')].map(e=>e.textContent.trim())");
  record('selection-latin-font', '选区字体包含 Calibri、Aptos、Times New Roman', fonts, ['Calibri', 'Aptos', 'Times New Roman'].every(font => fonts.includes(font)));
  await key('Escape');
  await click(`${toolbar} button[aria-label="字号"]`);
  const sizes = await evaluate("({options:[...document.querySelectorAll('[role=menu][aria-label=字号] [role=menuitemradio]')].map(e=>e.textContent.trim()),custom:!!document.querySelector('[role=menu][aria-label=字号] input')})");
  record('selection-custom-size', 'Word 式调整可以设置常用列表以外的有效字号（能力边界核对）', sizes, sizes.custom);
  await key('Escape');

  const longText = '这是一段用于核对聚焦展开与失焦收起的较长公司名称'.repeat(4);
  await click('[data-editor-field="company"]');
  await key('Meta+a');
  await send('Input.insertText', { text: longText });
  await delay(200);
  const focusedHeight = await evaluate("document.querySelector('[data-editor-field=company]').offsetHeight");
  await click('[data-editor-field="position"]');
  const blurredHeight = await evaluate("document.querySelector('[data-editor-field=company]').offsetHeight");
  record('input-collapse', '长输入框聚焦时展开，离开后恢复一行', { focusedHeight, blurredHeight }, blurredHeight < focusedHeight);

  await click('text:教育经历');
  await selectField('[data-editor-field="institution"]', 2);
  const school = await evaluate(`({outline:document.querySelector('[data-editing]')?.textContent,highlight:${highlight}})`);
  record('school-preview-selection', '选择学校中的“浙江”，预览高亮同样两个字', school, school.highlight === '浙江');
  await selectField('[data-editor-field="gpa"]', 3);
  const gpa = await evaluate(`({selected:document.querySelector('[data-editor-field=gpa]').textContent.slice(0,3),highlight:${highlight}})`);
  record('gpa-preview-selection', 'GPA 选区高亮数值，不把显示前缀纳入偏移', gpa, gpa.highlight === gpa.selected);
  await browser.screenshot(path.join(out, 'education-selection.png'));

  await evaluate(`(async()=>{
    const store=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;
    const project=store.getState().sections.find(section=>section.id==='s-proj');
    store.getState().updateSection(project.id,{items:project.content.items.map((item,i)=>i ? item : {...item,url:'https://example.com/audit-project'})});
  })()`);
  await delay(100);
  const projectUrl = await evaluate("document.querySelector('[data-item-id=" + q('p-1') + "]')?.textContent.includes('https://example.com/audit-project')");
  record('classic-project-url', '项目链接填写后在经典模板显示', { visible: projectUrl }, projectUrl);

  await evaluate(`(async()=>{
    const store=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;
    const state=store.getState();
    store.setState({currentResume:{...state.currentResume,template:'modern'},sections:[...state.sections,{
      id:'s-audit-github',resumeId:'r-demo',type:'github',title:'GitHub 核对',sortOrder:99,visible:true,
      content:{items:[{id:'audit-repo',name:'audit-project',repoUrl:'https://github.com/example/audit',description:'**重点**描述',language:'TypeScript',stars:1}]}
    }]});
  })()`);
  await waitFor("!!document.querySelector('[data-section-id=" + q('s-audit-github') + "]')");
  const github = await evaluate("(()=>{const section=document.querySelector('[data-section-id=" + q('s-audit-github') + "]');return {text:section.textContent,formatted:section.querySelector('strong')?.textContent,fieldMapped:!!section.querySelector('[data-field=description]')};})()");
  record('modern-github-format', 'GitHub 描述渲染格式，且可映射到预览字段', github, github.formatted === '重点' && github.fieldMapped);

  await visit('/zh/knowledge');
  await waitFor("!!document.querySelector('.knowledge-workspace article')");
  record('knowledge-no-blank', '知识库进入后正文可见且无运行时错误', browser.errors, browser.errors.length === 0);
  await click('text:编辑');
  await click('.knowledge-workspace main textarea');
  await key('Meta+a');
  const draft = '核对草稿：离开知识库返回后仍应可恢复';
  await send('Input.insertText', { text: draft });
  await click('nav button');
  await waitFor("location.pathname.endsWith('/dashboard')");
  await click('text:知识库');
  await waitFor("!!document.querySelector('.knowledge-workspace article')");
  await click('text:编辑');
  const returnedDraft = await evaluate("document.querySelector('.knowledge-workspace main textarea').value");
  record('knowledge-draft-navigation', '正常应用内导航不静默丢弃未保存草稿', { returnedDraft }, returnedDraft === draft);

  await visit('/zh/knowledge');
  await click('text:编辑');
  const refreshedDraft = await evaluate("document.querySelector('.knowledge-workspace main textarea').value");
  record('knowledge-draft-refresh', '刷新后恢复未保存草稿', refreshedDraft, refreshedDraft === draft);
  await evaluate(`window.__writeOriginal=window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke=(cmd,args)=>cmd==='knowledge_write'
      ? new Promise(resolve=>{window.__finishWrite=()=>window.__writeOriginal(cmd,args).then(resolve);}) : window.__writeOriginal(cmd,args);`);
  await click('text:保存');
  await waitFor("typeof window.__finishWrite==='function'");
  await click('.knowledge-workspace main textarea'); await key('Meta+a');
  await send('Input.insertText',{text:'保存等待期间的新草稿'});
  await evaluate('window.__finishWrite()');
  await delay(200);
  const duringSave = await evaluate("document.querySelector('.knowledge-workspace main textarea')?.value");
  record('knowledge-edit-during-save', '保存旧快照时继续输入，新草稿不得被清掉', duringSave, duringSave === '保存等待期间的新草稿');
  await evaluate('window.__TAURI_INTERNALS__.invoke=window.__writeOriginal');
  await visit('/zh/insights');
  await browser.screenshot(path.join(out, 'journal-desktop.png'));
  await click('text:看板');
  await browser.screenshot(path.join(out, 'journal-kanban.png'));
  // 人为控制请求完成次序，复现切换简历时旧请求覆盖新关联的真实异步路径。
  const race = await evaluate(`(async()=>{
    const store=(await window.__appModule('/src/stores/journal-store.ts')).useJournalStore;
    const original=window.__TAURI_INTERNALS__.invoke;
    const responses=[];
    window.__TAURI_INTERNALS__.invoke=(cmd,args)=>cmd==='create_resume_version'
      ? new Promise(resolve=>responses.push({resumeId:args.resumeId,resolve})) : original(cmd,args);
    try {
      const app=await store.getState().createApplication({company:'需求核对',role:'版本关联测试'});
      store.getState().updateApplication(app.id,{resumeId:'r-demo'});
      store.getState().updateApplication(app.id,{resumeId:'r-demo-2'});
      await new Promise(resolve=>setTimeout(resolve,100));
      if(responses.length!==2) throw new Error('版本请求数量不符');
      responses[1].resolve('audit-version-new');
      await new Promise(resolve=>setTimeout(resolve,20));
      responses[0].resolve('audit-version-old');
      await new Promise(resolve=>setTimeout(resolve,20));
      const result=store.getState().applications.find(a=>a.id===app.id);
      return {resumeId:result.resumeId,resumeVersionId:result.resumeVersionId};
    } finally { window.__TAURI_INTERNALS__.invoke=original; }
  })()`);
  record('application-version-race', '最后选择的简历必须关联同一份简历的版本', race, race.resumeId === 'r-demo-2' && race.resumeVersionId === 'audit-version-new');
  const versionEdges = await evaluate(`(async()=>{
    const store=(await window.__appModule('/src/stores/journal-store.ts')).useJournalStore;
    const original=window.__TAURI_INTERNALS__.invoke;
    const responses=[];
    window.__TAURI_INTERNALS__.invoke=(cmd,args)=>cmd==='create_resume_version'
      ? new Promise((resolve,reject)=>responses.push({resolve,reject})) : original(cmd,args);
    const wait=()=>new Promise(r=>setTimeout(r,30));
    const results={};
    try {
      const app=await store.getState().createApplication({company:'版本边界测试'});
      const change=resumeId=>store.getState().updateApplication(app.id,{resumeId});
      const current=()=>store.getState().applications.find(a=>a.id===app.id);
      change('r-demo'); change('r-demo-2'); change('r-demo'); await wait();
      responses[2].resolve('A-current'); await wait();
      responses[0].resolve('A-stale'); responses[1].resolve('B-stale'); await wait();
      results.sameResume=current().resumeVersionId==='A-current';
      change('r-demo-2'); await wait(); change(null); responses[3].resolve('cancelled'); await wait();
      results.clear=current().resumeId===null && current().resumeVersionId===null;
      change('r-demo'); await wait(); responses[4].reject(new Error('受控版本失败')); await wait();
      results.failure=current().resumeId==='r-demo' && current().resumeVersionId===null;
      change('r-demo-2'); await wait(); await store.getState().deleteApplication(app.id); responses[5].resolve('deleted'); await wait();
      results.deleted=!current();
      results.persistedDeleted=!(await original('list_applications',{})).some(a=>a.id===app.id);
      return results;
    } finally {window.__TAURI_INTERNALS__.invoke=original;}
  })()`);
  record('version-edge-cases', 'A→B→A、清空、失败、删除均不接收过期快照', versionEdges, Object.values(versionEdges).every(Boolean));
  const savedRace = await evaluate(`(async()=>{
    const store=(await window.__appModule('/src/stores/journal-store.ts')).useJournalStore;
    const original=window.__TAURI_INTERNALS__.invoke;
    const app=await store.getState().createApplication({company:'写入顺序测试'});
    let finish, calls=0;
    window.__TAURI_INTERNALS__.invoke=(cmd,args)=>cmd==='save_application' && args.application.id===app.id
      ? (++calls===1 ? new Promise(resolve=>{finish=()=>original(cmd,args).then(resolve);}) : original(cmd,args)) : original(cmd,args);
    try {
      store.getState().updateApplication(app.id,{company:'旧值'});
      await new Promise(r=>setTimeout(r,500));
      store.getState().updateApplication(app.id,{company:'新值'});
      await new Promise(r=>setTimeout(r,500));
      const queued=calls===1;
      await finish(); await new Promise(r=>setTimeout(r,100));
      const saved=(await original('list_applications',{})).find(a=>a.id===app.id);
      return {queued,saved:saved.company,calls};
    } finally {window.__TAURI_INTERNALS__.invoke=original;}
  })()`);
  record('application-persist-order', '慢旧保存完成后才写入最新值', savedRace, savedRace.queued && savedRace.saved==='新值' && savedRace.calls===2);

  const agendaApp = await evaluate(`(async()=>{
    const store=(await window.__appModule('/src/stores/journal-store.ts')).useJournalStore;
    return (await store.getState().createApplication({company:'日程验收',role:'工程师',status:'interview',interviews:[
      {id:'round-old',round:'已完成轮次',format:'video',scheduledAt:'2020-01-01T09:00',createdAt:Date.now()},
      {id:'round-target',round:'目标系统设计面试',format:'video',scheduledAt:new Date(Date.now()+3600000).toISOString(),location:'线上会议室A',createdAt:Date.now()}
    ]})).id;
  })()`);
  await click('[data-agenda-round="round-target"]');
  const agendaTarget=await evaluate(`(() => {const target=document.querySelector('[data-interview-round="round-target"]'); return {tab:document.querySelector('[role=dialog] [role=tab][aria-selected=true]')?.textContent,visible:!!target && target.getBoundingClientRect().bottom>0 && target.getBoundingClientRect().top<innerHeight};})()`);
  record('agenda-opens-round','日程直接打开面试页并定位目标轮次',agendaTarget,agendaTarget.tab?.includes('面试') && agendaTarget.visible);
  await key('Escape');
  const nextCard=await evaluate(`document.querySelector('[data-kanban-app="'+${q(agendaApp)}+'"]')?.textContent`);
  record('kanban-next-interview','看板展示下一场面试及地点',nextCard,nextCard?.includes('目标系统设计面试') && nextCard?.includes('线上会议室A'));

  await visit('/zh/editor/r-demo');
  await click('text:专业技能');
  await select('[data-editor-item-id="c-1"] [data-editor-field="skills.3"]',0,8);
  await click(`${toolbar} button[aria-label="粗体"]`);
  const skillHighlight=await evaluate(highlight);
  record('skill-selection-mapping','技能标签格式与预览选区逐字对应',skillHighlight,skillHighlight==='Tailwind');
  await click('[data-editor-item-id="c-1"] input'); await key('Backspace');
  const chipEdit=await evaluate("({field:document.activeElement.dataset.editorField,text:document.activeElement.textContent})");
  record('tag-backspace-keeps-format','空输入框退格直接编辑已有标签，不显示内部标记',chipEdit,chipEdit.field==='skills.3' && chipEdit.text==='Tailwind CSS');
  await send('Input.insertText',{text:'!'});
  const chipStored=await evaluate(`(async()=>{const store=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;return store.getState().sections.find(s=>s.id==='s-skills').content.categories[0].skills[3];})()`);
  record('tag-edit-keeps-format','标签继续输入后保留原有局部粗体',chipStored,chipStored.includes('**Tailwind**') && chipStored.endsWith('!'));
  await evaluate(`(async()=>{
    const store=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;
    store.setState({sections:[...store.getState().sections,{id:'s-github-edit',resumeId:'r-demo',type:'github',title:'GitHub排序验收',visible:true,sortOrder:90,content:{items:[
      {id:'repo-one',repoUrl:'',name:'第一个项目',description:'',stars:0,language:''},
      {id:'repo-two',repoUrl:'',name:'第二个项目',description:'',stars:0,language:''}
    ]}}]});
  })()`);
  await click('text:GitHub排序验收');
  await evaluate(`window.__repoOriginal=window.__TAURI_INTERNALS__.invoke;
    window.__repoCalls=[];
    window.__TAURI_INTERNALS__.invoke=(cmd,args)=>cmd==='ai_fetch_github_repo'
      ? new Promise(resolve=>window.__repoCalls.push({args,resolve})) : window.__repoOriginal(cmd,args);`);
  await click('[data-editor-item-id="repo-one"] [data-editor-field="repoUrl"]');
  await send('Input.insertText',{text:'https://github.com/example/first'});
  await click('[data-editor-item-id="repo-one"] button[aria-label="下移"]');
  await waitFor('window.__repoCalls.length===1');
  await evaluate(`window.__repoCalls[0].resolve({name:'接口名称',description:'接口描述',stars:77,language:'Rust'})`);
  await delay(100);
  const githubSorted=await evaluate(`(async()=>{const store=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;return store.getState().sections.find(s=>s.id==='s-github-edit').content.items.map(({id,name,stars})=>({id,name,stars}));})()`);
  record('github-sort-before-response','延迟获取期间排序，结果仍回填正确项目且保留自定义名称',githubSorted,githubSorted[0].id==='repo-two' && githubSorted[0].stars===0 && githubSorted[1].id==='repo-one' && githubSorted[1].stars===77 && githubSorted[1].name==='第一个项目');
  await evaluate('window.__TAURI_INTERNALS__.invoke=window.__repoOriginal');
  await click('text:个人信息');
  await send('Emulation.setDeviceMetricsOverride',{width:900,height:600,deviceScaleFactor:1,mobile:false});
  await delay(300);
  await browser.screenshot(path.join(out,'editor-900x600.png'));
  const readable=await evaluate(`({zoom:[...document.querySelectorAll('button')].map(e=>e.textContent).find(t=>/^\\d+%$/.test(t)),overflow:document.documentElement.scrollWidth>innerWidth})`);
  record('editor-900-readable', '小窗口自动适配完整纸张且页面不横向溢出', readable, parseInt(readable.zoom)>0 && parseInt(readable.zoom)<=100 && !readable.overflow);
  assert.deepEqual(browser.errors, [], '核对期间不应产生脚本或页面运行时错误');
  process.exitCode = findings.some(finding => !finding.passed) ? 1 : 0;
} catch (error) {
  console.error(error);
  process.exitCode = 2;
} finally {
  writeFileSync(path.join(out, 'findings.json'), JSON.stringify(findings, null, 2) + '\n');
  await browser.close();
}
