// 浏览器里跑前端用的 Tauri 假后端：`MOCK_TAURI=1 pnpm dev:vite` 时由 vite.config.ts 注入。
// 只为看界面与交互，数据都在内存里，刷新即丢。不会进入正式构建。
(function () {
  if(new URLSearchParams(location.search).has('ai_review')){localStorage.setItem('jade_channels',JSON.stringify([{id:'review-ai',name:'隔离演示 AI',provider:'openai',baseURL:'https://example.invalid/v1',apiKey:'isolated-test-key',model:'mock',models:['mock']}]));localStorage.setItem('jade_active_channel','review-ai');}
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

  const resume = {
    id: 'r-demo',
    userId: 'u-demo',
    title: '前端工程师 · 通用版',
    template: 'classic',
    themeConfig: {},
    isDefault: true,
    language: 'zh',
    createdAt: now - 20 * day,
    updatedAt: now - 2 * day,
    sections: [
      {
        id: 's-pi', resumeId: 'r-demo', type: 'personal_info', title: '个人信息', sortOrder: 0, visible: true,
        content: {
          fullName: '林晚晴', jobTitle: '高级前端工程师', email: 'wanqing.lin@example.com', phone: '138 0000 1234',
          location: '上海', wechat: 'lwq_dev', website: 'lwq.dev', yearsOfExperience: '6 年', educationLevel: '硕士',
        },
        createdAt: now, updatedAt: now,
      },
      {
        id: 's-sum', resumeId: 'r-demo', type: 'summary', title: '个人总结', sortOrder: 1, visible: true,
        content: { text: '6 年 Web 前端经验，主导过 **3 个日活百万级** 产品的架构升级；擅长性能优化与工程化，{{color=#c0392b}}热爱把复杂问题讲清楚{{/color}}。' },
        createdAt: now, updatedAt: now,
      },
      {
        id: 's-we', resumeId: 'r-demo', type: 'work_experience', title: '工作经历', sortOrder: 2, visible: true,
        content: {
          items: [
            {
              id: 'we-1', company: '鲸跃科技', position: '高级前端工程师', location: '上海', startDate: '2021-07', endDate: null, current: true,
              description: '负责 B 端 SaaS 工作台的前端架构与团队工程化建设。',
              technologies: ['React', 'TypeScript', 'Vite', 'Node.js'],
              highlights: [
                '主导微前端拆分，首屏时间从 4.2s 降到 **1.3s**，Lighthouse 性能分 92',
                '搭建组件库与设计令牌体系，UI 走查返工率下降 60%',
                '推动 CI 质量门禁（类型检查 / lint / 视觉回归），线上 UI 缺陷减少 45%',
              ],
            },
            {
              id: 'we-2', company: '云帆网络', position: '前端工程师', location: '杭州', startDate: '2018-07', endDate: '2021-06', current: false,
              description: '参与电商中台前端开发，负责营销活动页与交易链路。',
              technologies: ['Vue', 'Webpack', 'Nuxt'],
              highlights: ['独立完成大促活动页搭建系统，支撑 200+ 活动上线', '交易链路性能优化，转化率提升 3.8%'],
            },
          ],
        },
        createdAt: now, updatedAt: now,
      },
      {
        id: 's-edu', resumeId: 'r-demo', type: 'education', title: '教育经历', sortOrder: 3, visible: true,
        content: {
          items: [
            { id: 'edu-1', institution: '浙江大学', degree: '硕士', field: '计算机科学与技术', startDate: '2016-09', endDate: '2018-06', gpa: '3.8/4.0', highlights: [] },
            { id: 'edu-2', institution: '华中科技大学', degree: '学士', field: '软件工程', startDate: '2012-09', endDate: '2016-06', highlights: [] },
          ],
        },
        createdAt: now, updatedAt: now,
      },
      {
        id: 's-proj', resumeId: 'r-demo', type: 'projects', title: '项目经历', sortOrder: 4, visible: true,
        content: {
          items: [
            {
              id: 'p-1', name: '低代码表单引擎', startDate: '2022-03', endDate: '2023-01',
              description: '面向业务同学的可视化表单搭建工具，覆盖公司 80% 的内部审批流程。',
              technologies: ['React', 'JSON Schema', 'Zustand'],
              highlights: ['设计 Schema 驱动的渲染层，支持 40+ 控件与联动规则', '表单搭建平均耗时从 2 天缩短到 2 小时'],
            },
          ],
        },
        createdAt: now, updatedAt: now,
      },
      {
        id: 's-skills', resumeId: 'r-demo', type: 'skills', title: '专业技能', sortOrder: 5, visible: true,
        content: {
          categories: [
            { id: 'c-1', name: '前端', skills: ['React', 'TypeScript', 'Vue', 'Tailwind CSS'] },
            { id: 'c-2', name: '工程化', skills: ['Vite', 'Webpack', 'GitHub Actions', 'Playwright'] },
            { id: 'c-3', name: '其他', skills: ['Node.js', 'SQLite', 'Rust（入门）'] },
          ],
        },
        createdAt: now, updatedAt: now,
      },
    ],
  };
  const resume2 = { ...resume, id: 'r-demo-2', title: '前端工程师 · 投递字节版', template: 'modern', isDefault: false, updatedAt: now - 5 * day };
  const resumes = { [resume.id]: resume, [resume2.id]: { ...resume2, sections: resume.sections.map((s) => ({ ...s, resumeId: 'r-demo-2' })) } };

  const cardSummary = (r) => ({
    fullName: '林晚晴', jobTitle: '高级前端工程师', latestCompany: '鲸跃科技', latestPosition: '高级前端工程师',
    skills: ['React', 'TypeScript', 'Vite'], sectionCount: r.sections.length, filledSections: r.sections.length,
  });

  const applications = [
    {
      id: 'app-1', resumeId: 'r-demo-2', resumeVersionId: 'v-1', company: '字节跳动', role: '前端工程师（抖音电商）', channel: 'Boss直聘',
      appliedDate: '2026-09-01', status: 'interview', hrName: '王HR', hrContact: 'wechat: hr_wang', jd: '负责抖音电商商家端前端研发……\n要求：3 年以上 React 经验，熟悉性能优化。',
      notes: '一面反馈不错，二面偏系统设计。', nextFollowUp: '', interviews: [
        { id: 'iv-1', round: '一面 · 技术', format: 'video', scheduledAt: '2026-09-05T14:00', durationMin: 60, interviewer: '前端 leader', topics: 'React 原理 / 性能优化', notes: '', createdAt: Date.now() },
        { id: 'iv-2', round: '二面 · 系统设计', format: 'video', scheduledAt: '2026-09-12T10:30', durationMin: 60, location: 'https://meeting.example.com/abc', createdAt: Date.now() },
      ], outcome: null, createdAt: now - 9 * day, updatedAt: now - day,
    },
    {
      id: 'app-2', resumeId: 'r-demo', resumeVersionId: null, company: '米哈游', role: '高级前端工程师', channel: '内推',
      appliedDate: '2026-08-28', status: 'screening', hrName: '', hrContact: '', jd: '', notes: '', nextFollowUp: '2026-09-08', interviews: [], outcome: null,
      createdAt: now - 12 * day, updatedAt: now - 3 * day,
    },
    {
      id: 'app-3', resumeId: 'r-demo', resumeVersionId: null, company: '蚂蚁集团', role: '体验技术工程师', channel: '官网直投',
      appliedDate: '2026-08-20', status: 'submitted', hrName: '', hrContact: '', jd: '', notes: '', nextFollowUp: '2026-09-10', interviews: [], outcome: null,
      createdAt: now - 20 * day, updatedAt: now - 6 * day,
    },
    {
      id: 'app-4', resumeId: 'r-demo', resumeVersionId: null, company: '小红书', role: '前端工程师', channel: '猎聘',
      appliedDate: '2026-08-10', status: 'offer', hrName: '', hrContact: '', jd: '', notes: '', nextFollowUp: '', interviews: [
        { id: 'iv-3', round: '一面', format: 'phone', scheduledAt: '2026-08-15T15:00', createdAt: Date.now() },
        { id: 'iv-4', round: 'HR 面', format: 'video', scheduledAt: '2026-08-22T11:00', createdAt: Date.now() },
      ], outcome: { result: 'offer', reason: '薪资符合预期', reflection: '' }, createdAt: now - 30 * day, updatedAt: now - 8 * day,
    },
    {
      id: 'app-5', resumeId: null, resumeVersionId: null, company: '某创业公司', role: '全栈工程师', channel: '脉脉',
      appliedDate: '2026-08-05', status: 'rejected', hrName: '', hrContact: '', jd: '', notes: '', nextFollowUp: '', interviews: [], outcome: { result: 'rejected', reason: '方向不匹配' },
      createdAt: now - 36 * day, updatedAt: now - 20 * day,
    },
    {
      id: 'app-6', resumeId: 'r-demo', resumeVersionId: null, company: '拼多多', role: '前端开发', channel: '智联招聘',
      appliedDate: '2026-07-30', status: 'ghosted', hrName: '', hrContact: '', jd: '', notes: '', nextFollowUp: '', interviews: [], outcome: null,
      createdAt: now - 42 * day, updatedAt: now - 30 * day,
    },
  ];
  const mocks = [
    { id: 'mock-1', resumeId: 'r-demo-2', applicationId: 'app-1', company: '字节跳动', role: '前端工程师', feedback: '回答结构清晰，但对并发渲染的理解还可以更深入。', transcript: 'Q: 说说 React 18 的并发特性……\nA: ……', createdAt: now - 2 * day },
  ];

  const pages = [
    { path: 'purpose.md', title: '求职目标', type: 'root', tags: [], summary: '目标岗位、城市与硬约束', updated: '2026-09-02', sources: [] },
    { path: 'schema.md', title: '知识库结构', type: 'root', tags: [], summary: '页面类型与命名约定', updated: '2026-08-30', sources: [] },
    { path: 'index.md', title: '总索引', type: 'root', tags: [], summary: '', updated: '2026-08-30', sources: [] },
    { path: 'wiki/companies/bytedance.md', title: '字节跳动', type: 'company', tags: ['大厂', '电商'], summary: '面试流程三轮，重视系统设计与性能', updated: '2026-09-06', sources: ['raw/bytedance-jd.md'] },
    { path: 'wiki/roles/frontend.md', title: '前端工程师', type: 'role', tags: ['前端'], summary: '岗位通用要求与高频考点', updated: '2026-09-01', sources: [] },
    { path: 'wiki/skills/react-performance.md', title: 'React 性能优化', type: 'skill', tags: ['React', '性能'], summary: '常见瓶颈与对应手段', updated: '2026-08-29', sources: [] },
    { path: 'wiki/sop/interview-prep.md', title: '面试准备 SOP', type: 'sop', tags: ['面试'], summary: '面前一天 / 面中 / 面后的固定动作', updated: '2026-08-25', sources: [] },
    { path: 'wiki/experience/app-1.md', title: '字节跳动 · 一面复盘', type: 'experience', tags: ['复盘'], summary: '问到的题与不足', updated: '2026-09-06', sources: [] },
    { path: 'raw/bytedance-jd.md', title: '字节 JD 原文', type: 'source', tags: [], summary: '', updated: '2026-09-01', sources: [] },
  ];
  const contents = {
    'purpose.md': '# 求职目标\n\n## 目标岗位\n高级前端工程师 / 前端架构\n\n## 期望城市\n上海、杭州\n\n## 目标行业\n互联网、AI 应用\n\n## 硬约束\n不接受 996；base 不低于当前 20%\n\n## 其他\n希望团队有明确的技术方向\n',
    'wiki/companies/bytedance.md': '---\ntitle: 字节跳动\ntype: company\ntags: [大厂, 电商]\n---\n# 字节跳动\n\n## 面试流程\n- 一面：技术基础 + 手写代码\n- 二面：系统设计（见 [[wiki/skills/react-performance|React 性能优化]]）\n- HR 面\n\n## 关注点\n1. 性能优化的量化结果\n2. 复杂业务的抽象能力\n\n> 二面前记得复习 [[wiki/sop/interview-prep|面试准备 SOP]]。\n',
    'wiki/skills/react-performance.md': '# React 性能优化\n\n| 症状 | 手段 |\n| --- | --- |\n| 首屏慢 | 代码分割、SSR、预加载 |\n| 交互卡 | memo、虚拟列表、并发渲染 |\n\n```ts\nconst Heavy = lazy(() => import("./Heavy"));\n```\n',
  };
  const graph = {
    nodes: pages.filter((p) => p.path.startsWith('wiki/')).map((p) => ({ id: p.path, title: p.title, type: p.type })),
    edges: [
      { source: 'wiki/companies/bytedance.md', target: 'wiki/skills/react-performance.md', type: 'wikilink' },
      { source: 'wiki/companies/bytedance.md', target: 'wiki/sop/interview-prep.md', type: 'wikilink' },
      { source: 'wiki/roles/frontend.md', target: 'wiki/skills/react-performance.md', type: 'wikilink' },
    ],
  };
  const versions = [
    { id: 'v-1', resumeId: 'r-demo-2', event: 'apply', label: '字节跳动 · 前端工程师', resumeTitle: '前端工程师 · 投递字节版', createdAt: now - 9 * day },
    { id: 'v-2', resumeId: 'r-demo', event: 'save', label: '', resumeTitle: '前端工程师 · 通用版', createdAt: now - 2 * day },
  ];

  const versionSnapshots = Object.fromEntries(versions.map(v => [v.id, structuredClone(resumes[v.resumeId] || resume)]));
  versionSnapshots['v-2'].sections.find(s=>s.type==='work_experience').content.items[0].company='历史公司';
  function snapshotResume(resumeId,event,label='') {
    const snapshot=structuredClone(resumes[resumeId]);
    if(event==='save'||event==='ai_accept')return null;
    const existing=versions.find(v=>v.resumeId===resumeId && JSON.stringify(versionSnapshots[v.id])===JSON.stringify(snapshot) && (event!=='manual'||v.name===label));
    if(existing){existing.events??=[{event:existing.event,label:existing.label,createdAt:existing.createdAt}];if(!existing.events.some(e=>e.event===event&&e.label===label))existing.events.push({event,label,createdAt:Math.floor(Date.now()/1000)});return existing.id;}
    const entry={id:id('v'),resumeId,event,label,name:event==='manual'?label:'',resumeTitle:snapshot.title,createdAt:Math.floor(Date.now()/1000),events:[{event,label,createdAt:Math.floor(Date.now()/1000)}]};
    versions.unshift(entry);versionSnapshots[entry.id]=snapshot;return entry.id;
  }

  // 仅测试页使用 sessionStorage 模拟设置落库，便于验证刷新后的持久化。
  let mockSettings = { autoSave: true, autoSaveInterval: 500 };
  try { mockSettings = { ...mockSettings, ...JSON.parse(sessionStorage.getItem('resumer-mock-settings') || '{}') }; } catch { /* 测试缓存损坏时使用初始配置 */ }
  const libraryCollections=[],libraryFiles=[],libraryTexts={};
  const recordings=[];
  const handlers = {
    set_exit_guard_ready:()=>null,
    finish_app_exit:()=>{window.__mockExited=true;return null;},
    recording_list:({applicationId})=>recordings.filter(r=>r.applicationId===applicationId),
    recording_import:({applicationId,roundId})=>{const old=recordings.find(r=>r.applicationId===applicationId);if(old)return [old];const r={id:id('recording'),applicationId,roundId,filename:'示例面试.m4a',extension:'m4a',size:1024*1024,transcript:'',error:'',createdAt:now};recordings.unshift(r);return [r];},
    recording_save:({id,transcript,roundId})=>{const r=recordings.find(r=>r.id===id);Object.assign(r,{transcript,roundId,error:''});return r;},
    recording_open:()=>null,
    recording_delete:({id})=>{const index=recordings.findIndex(r=>r.id===id);if(index>=0)recordings.splice(index,1);return null;},
    recording_transcribe:({id,config})=>{window.__TAURI_MOCK__.speechRequest={id,config};const r=recordings.find(r=>r.id===id);r.transcript='面试官：如何处理缓存失效？\n候选人：先分析缓存穿透、击穿与雪崩，再选择对应方案。';return r;},
    recording_publish:({id})=>{const r=recordings.find(r=>r.id===id);window.__TAURI_MOCK__.publishedTranscript=r.transcript;return 'interview-'+r.applicationId;},
    intake_extract:({text})=>({company:text.includes('星河')?'星河科技':'',role:text.includes('前端')?'前端工程师':'',jd:text}),
    ai_generate_resume:args=>{window.__TAURI_MOCK__.generationRequest=args;return 'r-demo';},
    library_choose_files:()=>null,
    library_release_picks:()=>null,
    library_collections:()=>libraryCollections.map(c=>({...c,tags:c.tags??(c.category?[c.category]:[])})),
    library_put_collection:args=>{args={...args,tags:args.tags??(args.category?[args.category]:[])};args.category=args.tags[0]||'';const existing=libraryCollections.find(c=>c.id===args.id);if(existing){Object.assign(existing,args);return existing.id;}const item={...args,id:id("collection"),assetCount:0,readyCount:0,updatedAt:Date.now()/1000};libraryCollections.push(item);return item.id;},
    library_assets:({collectionId})=>libraryFiles.filter(f=>f.collectionId===collectionId),
    library_import_file:({collectionId,filename,bytes})=>{const text=new TextDecoder().decode(new Uint8Array(bytes));const c=libraryCollections.find(c=>c.id===collectionId);const item={id:id("asset"),collectionId,filename,extension:filename.split(".").pop(),status:"ready",error:"",characters:[...text].length};libraryFiles.push(item);libraryTexts[item.id]=text;c.assetCount++;c.readyCount++;return item;},
    library_read_asset:({assetId,offset=0})=>{const text=libraryTexts[assetId]||"";return {assetId,filename:libraryFiles.find(f=>f.id===assetId)?.filename,content:[...text].slice(offset,offset+6000).join(""),total:[...text].length,offset,nextOffset:offset+6000<[...text].length?offset+6000:null};},
    library_search:({query,kind,category,tags,tagMatch,untagged,collectionId})=>libraryFiles.filter(f=>{const c=libraryCollections.find(c=>c.id===f.collectionId),actual=c.tags??(c.category?[c.category]:[]),wanted=tags??(category?[category]:[]);return c.enabled&&f.status==='ready'&&(!kind||c.kind===kind)&&(!collectionId||c.id===collectionId)&&(!untagged||!actual.length)&&(!wanted.length||(tagMatch==='any'?wanted.some(t=>actual.includes(t)):wanted.every(t=>actual.includes(t))))&&libraryTexts[f.id].includes(query)}).map(f=>{const c=libraryCollections.find(c=>c.id===f.collectionId);return {assetId:f.id,filename:f.filename,collectionId:f.collectionId,collection:c.title,tags:c.tags??(c.category?[c.category]:[]),category:c.category,kind:c.kind,offset:0,excerpt:libraryTexts[f.id]};}),

    library_open_original:()=>null,
    ensure_user: () => ({ id: 'u-demo' }),
    get_settings: () => structuredClone(mockSettings),
    update_settings: ({settings}) => { mockSettings = { ...mockSettings, ...settings }; sessionStorage.setItem('resumer-mock-settings', JSON.stringify(mockSettings)); return null; },
    list_resumes: () => Object.values(resumes).map((r) => ({ ...r, sections: undefined, summary: cardSummary(r) })),
    get_resume: ({ id }) => resumes[id] || null,
    create_resume: ({ title, template, language }) => {
      const nid = id('r');
      resumes[nid] = { ...resume, id: nid, title: title || '未命名简历', template: template || 'classic', language: language || 'zh', sections: [] };
      return nid;
    },
    update_resume: ({ payload }) => {
      const target = resumes[payload.id];
      if (target) Object.assign(target, JSON.parse(JSON.stringify({ title: payload.title, template: payload.template, themeConfig: payload.themeConfig, sections: payload.sections })));
      if(target)snapshotResume(payload.id,'save');
      return null;
    },
    delete_resume: ({ id }) => { delete resumes[id]; return null; },
    duplicate_resume: ({ id }) => { const nid = `${id}-copy`; resumes[nid] = { ...resumes[id], id: nid, title: `${resumes[id].title}（副本）` }; return nid; },
    list_resume_versions: ({ resumeId }) => versions.filter((v) => v.resumeId === resumeId),
    get_resume_version: ({ id }) => { const v = versions.find((x) => x.id === id); return v ? { ...v, snapshot: structuredClone(versionSnapshots[id]) } : null; },
    create_resume_version: ({resumeId,event,label}) => snapshotResume(resumeId,event,label),
    restore_resume_version: ({versionId,label}) => { const v=versions.find(v=>v.id===versionId); if(!v)throw new Error('版本不存在');snapshotResume(v.resumeId,'restore',label);resumes[v.resumeId]=structuredClone(versionSnapshots[versionId]); },
    list_applications: () => applications,
    save_application: ({ application: record }) => { const i = applications.findIndex((a) => a.id === record.id); if (i >= 0) applications[i] = record; else applications.unshift(record); return record; },
    delete_application: ({ id }) => { const i = applications.findIndex((a) => a.id === id); if (i >= 0) applications.splice(i, 1); return null; },
    list_mock_interviews: () => mocks,
    delete_mock_interview: () => null,
    create_mock_interview: ({ mock: record }) => ({ ...record, createdAt: now }),
    import_legacy_journal: () => null,
    knowledge_list: () => pages,
    knowledge_read: ({ path }) => contents[path] || `# ${path}\n\n（示例内容）`,
    knowledge_write: ({ path, content, expected }) => {if(expected!=null&&contents[path]!==expected)throw Error('笔记已在其他编辑器更新，草稿仍保留');contents[path] = content; return null; },
    knowledge_graph: () => graph,
    knowledge_lint: () => ({ issues: ['wiki/roles/frontend.md 缺少 summary', 'raw/bytedance-jd.md 未被任何页面引用'], proposals: [] }),
    knowledge_reindex: () => pages.length,
    knowledge_purpose: () => contents['purpose.md'],
    knowledge_create_page: ({path,title,kind,body,sources=[]}) => {if(contents[path]!=null)throw Error('页面已存在');contents[path]=body;pages.push({path,title,type:kind,tags:[],summary:body.slice(0,120),sources,updated:new Date().toISOString()});return null;},
    knowledge_search: ({query}) => pages.filter(p=>(contents[p.path]||'').includes(query)).map(p=>({...p,excerpt:(contents[p.path]||'').slice(0,700)})),
    list_chat_sessions: () => [],
    list_chat_messages: () => [],
    list_jd_analyses: () => [],
    list_grammar_checks: () => [],
    ai_list_models: () => [],
    ai_test_search: ({config}) => ({engine:config.webSearchMode,results:[{title:'测试来源',url:'https://example.com/search',content:'隔离搜索结果'}]}),
  };

  // 原文档回读测试使用隔离浏览器的 sessionStorage，不接触真实数据库。
  const documents = JSON.parse(sessionStorage.getItem('mock-original-documents') || '{}');
  const documentVersions = JSON.parse(sessionStorage.getItem('mock-original-versions') || '[]');
  Object.assign(resumes, JSON.parse(sessionStorage.getItem('mock-original-resumes') || '{}'));
  const persistDocuments = () => {
    sessionStorage.setItem('mock-original-documents', JSON.stringify(documents));
    sessionStorage.setItem('mock-original-versions', JSON.stringify(documentVersions));
    sessionStorage.setItem('mock-original-resumes', JSON.stringify(Object.fromEntries(Object.entries(resumes).filter(([, r]) => r.template === 'original-docx'))));
  };
  const documentSnapshot = (rid, event, label) => {
    if(event==='save')return null;
    const entry = { id:id('dv'), resumeId:rid, event, label, name:event==='manual'?label:'', resumeTitle:resumes[rid].title, createdAt:now+documentVersions.length,
      snapshot:structuredClone(resumes[rid]), document:structuredClone(documents[rid]) };
    documentVersions.unshift(entry);
    persistDocuments();
    return entry.id;
  };
  handlers.import_original_docx = ({ filename, bytes, targetResumeId }) => {
    const rid = targetResumeId || id('doc');
    resumes[rid] = { ...resume, id:rid, template:'original-docx', title:filename, sections:[] };
    documents[rid] = { filename, bytes, revision:1 };
    persistDocuments();
    return rid;
  };
  handlers.get_original_docx = ({ resumeId, versionId }) => structuredClone(versionId ? documentVersions.find((v)=>v.id===versionId && v.resumeId===resumeId)?.document : documents[resumeId]);
  handlers.save_original_docx = ({ resumeId, revision, bytes }) => {
    const doc = documents[resumeId];
    if (revision !== doc.revision) throw new Error('文档已在其他窗口更新');
    doc.bytes = bytes; doc.revision++;
    persistDocuments();
    return doc.revision;
  };
  handlers.export_original_docx = ({ resumeId }) => {
    window.__TAURI_MOCK__.exportedDocument = structuredClone(documents[resumeId]);
    return '/tmp/mock-export.docx';
  };
  const listVersions = handlers.list_resume_versions;
  const getVersion = handlers.get_resume_version;
  handlers.list_resume_versions = (args) => documents[args.resumeId] ? documentVersions.filter((v)=>v.resumeId===args.resumeId).map(({document,snapshot,...v})=>v) : listVersions(args);
  handlers.get_resume_version = (args) => documentVersions.find((v)=>v.id===args.id) || getVersion(args);
  const createVersion=handlers.create_resume_version;
  const restoreVersion=handlers.restore_resume_version;
  handlers.create_resume_version = (args) => documents[args.resumeId] ? documentSnapshot(args.resumeId,args.event,args.label||'') : createVersion(args);
  handlers.restore_resume_version = ({versionId,label}) => {
    const version=documentVersions.find((v)=>v.id===versionId);
    if(!version)return restoreVersion({versionId,label});
    const revision=documents[version.resumeId].revision+1;
    documents[version.resumeId]={...structuredClone(version.document),revision};
    resumes[version.resumeId]=structuredClone(version.snapshot);
    persistDocuments();
  };
  handlers.rename_resume_version=({id,name})=>{const v=[...versions,...documentVersions].find(v=>v.id===id);if(!v)throw new Error('版本不存在');v.name=name;persistDocuments();};
  handlers.delete_resume_version=({id})=>{if(applications.some(a=>a.resumeVersionId===id))throw new Error('此版本已关联投递记录');for(const list of [versions,documentVersions]){const at=list.findIndex(v=>v.id===id);if(at>=0)list.splice(at,1);}persistDocuments();};
  handlers.save_docx_copy = ({filename,bytes}) => { window.__TAURI_MOCK__.exportedDocument={filename,bytes}; return '/tmp/mock-recovery.docx'; };
  const wikiFolders=new Set(['wiki','wiki/guides',...pages.filter(p=>p.path.startsWith('wiki/')).map(p=>p.path.split('/').slice(0,-1).join('/'))]);
  handlers.knowledge_folders=()=>[...wikiFolders].sort();
  handlers.knowledge_create_folder=({path})=>{if(wikiFolders.has(path))throw Error('同名文件夹已存在');const parts=path.split('/');for(let i=1;i<=parts.length;i++)wikiFolders.add(parts.slice(0,i).join('/'));return null;};
  handlers.knowledge_update_properties=({path,title,tags,expected})=>{if(contents[path]!==expected)throw Error('页面已被其他编辑器更新');const page=pages.find(p=>p.path===path),oldTitle=page.title;page.title=title;page.tags=tags;page.updated=new Date().toISOString();let body=contents[path].replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'');if(body.startsWith('# '+oldTitle+'\n'))body=body.replace('# '+oldTitle+'\n','# '+title+'\n');contents[path]='---\ntitle: '+JSON.stringify(title)+'\ntags: '+JSON.stringify(tags)+'\n---\n'+body;return null;};
  handlers.knowledge_open_file=({path})=>{window.__TAURI_MOCK__.openedFile=path;return null;};
  const eventListeners = new Map();
  let callbackSeq = 1;
  const knowledgeDrafts=[];const audioNotes={};
  const draft=(kind,payload,extra={})=>{const row={id:id('draft'),kind,payload,status:'pending',...extra};knowledgeDrafts.push(row);return row;};
  const updateCounts=()=>{for(const c of libraryCollections){const files=libraryFiles.filter(f=>f.collectionId===c.id);c.assetCount=files.length;c.readyCount=files.filter(f=>f.status==='ready').length;}};
  const importFile=handlers.library_import_file;
  handlers.library_import_file=args=>{const row=importFile(args);if(/\.(mp3|m4a|wav|mp4|webm|ogg|flac)$/i.test(args.filename)){row.status='needs_transcription';row.characters=0;libraryTexts[row.id]='';audioNotes[row.id]={transcript:'',distillation:''};updateCounts();}return row;};
  handlers.library_audio_state=({assetId})=>({...audioNotes[assetId],assetId,filename:libraryFiles.find(f=>f.id===assetId).filename,status:libraryFiles.find(f=>f.id===assetId).status});
  handlers.library_audio_save=({assetId,transcript})=>{audioNotes[assetId]??={transcript:'',distillation:''};if(audioNotes[assetId].transcript!==transcript){audioNotes[assetId].transcript=transcript;libraryFiles.find(f=>f.id===assetId).status=transcript?'needs_distillation':'needs_transcription';libraryTexts[assetId]='';updateCounts();}return handlers.library_audio_state({assetId});};
  handlers.library_audio_transcribe=({assetId,config})=>{window.__TAURI_MOCK__.speechRequest={assetId,config};return handlers.library_audio_save({assetId,transcript:'面试官：如何处理缓存失效？候选人：先区分缓存穿透、击穿与雪崩，再制定对应策略。'});};
  handlers.knowledge_distill_prepare=({sourceKind,sourceId})=>{const text=sourceKind==='asset'?audioNotes[sourceId]?.transcript:recordings.find(r=>r.id===sourceId)?.transcript;if(!text)throw Error('请先获得文字稿');return draft('distill',{title:'缓存问题 · 面试经验',markdown:'# 缓存问题复盘\n\n## 可复用知识\n先区分缓存穿透、击穿与雪崩，再制定对应策略。\n\n## 需要改进\n补充各场景的具体边界。',questions:['如何验证策略有效？'],insights:['把概念和措施对应起来'],evidence:[{quote:text.slice(0,30)}],sourceKind,sourceId,chunks:1},{sourceHash:text});};
  handlers.knowledge_compile_prepare=({collectionId})=>{const files=libraryFiles.filter(f=>f.collectionId===collectionId&&f.status==='ready');if(!files.length)throw Error('尚无可编译资料');const sourcePath='wiki/sources/'+files[0].id+'.md';const source={path:sourcePath,title:files[0].filename,kind:'source',body:'# 来源\n\n'+libraryTexts[files[0].id],sources:[],before:contents[sourcePath]??null};const path='wiki/concepts/cache.md';return draft('wiki',{title:'整理缓存面试知识',pages:[source,{path,title:'缓存面试',kind:'concept',body:'# 缓存面试\n\n先区分缓存穿透、击穿与雪崩。\n\n[['+sourcePath+']]',sources:[sourcePath],before:contents[path]??null}],insights:['形成可持续更新的概念页'],conflicts:[],questions:['需要补充哪些边界？'],coverage:{files:files.length,chunks:files.length,skipped:libraryFiles.filter(f=>f.collectionId===collectionId&&f.status!=='ready').map(f=>({filename:f.filename,status:f.status}))}},{collectionId,sourceHash:JSON.stringify(files.map(f=>[f.id,libraryTexts[f.id]]))});};
  handlers.knowledge_drafts=()=>knowledgeDrafts.filter(d=>d.status==='pending');
  handlers.knowledge_update_draft=({id,markdown})=>{knowledgeDrafts.find(d=>d.id===id).payload.markdown=markdown;return null;};
  handlers.knowledge_discard_draft=({id})=>{knowledgeDrafts.find(d=>d.id===id).status='discarded';return null;};
  handlers.knowledge_apply_draft=({id,markdown})=>{const d=knowledgeDrafts.find(d=>d.id===id);if(d.status==='applied')return d.result;if(d.kind==='distill'){const p=d.payload;const text=p.sourceKind==='asset'?audioNotes[p.sourceId]?.transcript:recordings.find(r=>r.id===p.sourceId)?.transcript;if(text!==d.sourceHash)throw Error('转写稿已变化，请重新提炼');let assetId=p.sourceId,collectionId;if(p.sourceKind==='asset'){const f=libraryFiles.find(f=>f.id===assetId);collectionId=f.collectionId;audioNotes[assetId].distillation=markdown||p.markdown;libraryTexts[assetId]=markdown||p.markdown;f.status='ready';f.characters=[...libraryTexts[assetId]].length;}else{const r=recordings.find(r=>r.id===p.sourceId);collectionId='interview-'+r.applicationId;if(!libraryCollections.some(c=>c.id===collectionId))libraryCollections.push({id:collectionId,title:'面试复盘',purpose:'提炼后的经验',category:'面试复盘',kind:'document',enabled:true,assetCount:0,readyCount:0,updatedAt:now});assetId=handlers.library_import_file({collectionId,filename:p.sourceId+'-knowledge.md',bytes:[...new TextEncoder().encode(markdown||p.markdown)]}).id;}d.result={assetId,collectionId,pages:[]};updateCounts();}else{for(const p of d.payload.pages||[]){if((contents[p.path]??null)!==p.before)throw Error('页面已变化，请重新生成');}for(const p of d.payload.pages||[]){contents[p.path]=p.body;let page=pages.find(f=>f.path===p.path);if(!page){page={path:p.path,title:p.title,type:p.kind,tags:[],summary:p.body.slice(0,120),updated:new Date().toISOString(),sources:p.sources};pages.push(page);}else Object.assign(page,{title:p.title,summary:p.body.slice(0,120),sources:p.sources});}d.result={pages:(d.payload.pages||[]).map(p=>p.path)};}d.status='applied';return d.result;};
  handlers.knowledge_save_answer=({question,reply,citations})=>{const path='wiki/questions/'+id('answer')+'.md';contents[path]='# '+question+'\n\n'+reply;pages.push({path,title:question,type:'question',tags:[],summary:reply,updated:new Date().toISOString(),sources:citations.map(c=>c.path).filter(Boolean)});return path;};
  handlers.knowledge_maintain_prepare=()=>draft('maintenance',{title:'Wiki维护检查',pages:[],insights:['没有发现需要立即修改的事实'],questions:['补充更多面试证据'],coverage:{pages:pages.length},structural:{issues:[]}});
  handlers.knowledge_propose_edit=({actions})=>draft('wiki',{title:'自然语言整理Wiki',pages:actions.map(a=>({path:a.targetId,title:a.fields.title||pages.find(p=>p.path===a.targetId)?.title,kind:'concept',body:a.fields.body??contents[a.targetId],before:a.before,sources:[]}))});
  handlers.knowledge_open_vault=()=>null;
  handlers.workspace_assist=args=>{window.__TAURI_MOCK__.workspaceRequest=args;if(window.__TAURI_MOCK__.workspaceError)throw Error(window.__TAURI_MOCK__.workspaceError);if(window.__TAURI_MOCK__.workspaceAnswer)return structuredClone(window.__TAURI_MOCK__.workspaceAnswer);const {scope,text,context}=args;if(text==='我刚投递了一个岗位')return {question:text,reply:'是哪家公司、什么岗位？也可以直接粘贴招聘信息。',actions:[],citations:[]};let actions=[];if(scope==='activity')actions=[{kind:'application',targetId:'new:1',roundId:'',fields:{company:'星河科技',role:'前端工程师',channel:'Boss直聘',appliedDate:context.today},reason:'记录今天的投递'}];else if(scope==='application')actions=[{kind:'interview',targetId:context.applications[0].id,roundId:'',fields:{round:'二面',scheduledAt:context.today+'T14:00',format:'video'},reason:'添加面试安排'}];else if(scope==='mock')actions=[{kind:'mock',targetId:'',roundId:'',fields:{company:'星河科技',role:'前端工程师',round:'二面',focus:'重点追问项目架构，每次只问一道题'},reason:'准备练习方向'}];else if(scope==='upload')actions=[{kind:'collection',targetId:'',roundId:'',fields:{title:'星河科技面试',tags:['前端','面试'],purpose:'支持二面准备'},reason:'按共同主题整理'}];return {question:text,reply:actions.length?'已根据描述整理，请确认后应用。':'基于已有来源，建议先区分问题场景，再准备具体措施和边界。',actions,citations:[]};};
  if(new URLSearchParams(location.search).has('category_review')){
    for(let i=0;i<50;i++){const name=i===0?'面试准备 111111111111111111111111111111111111':i===1?'Architecture and Distributed Systems Interview Notes':'分类 '+String(i+1).padStart(2,'0');const collectionId='category-demo-'+i;libraryCollections.push({id:collectionId,title:i===0?'面试准备':'资料集 '+(i+1),purpose:'隔离演示资料，非真实用户内容',category:name,kind:'document',enabled:true,assetCount:0,readyCount:0,updatedAt:now});handlers.library_import_file({collectionId,filename:'面经.txt',bytes:[...new TextEncoder().encode('缓存穿透、击穿与雪崩需要不同的应对策略。')]});}
  }
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener: (_event,id) => eventListeners.delete(id)};
  window.isTauri = true;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' }, windows: [], webviews: [] },
    transformCallback(callback) {
      const key = callbackSeq++;
      window[`_${key}`] = callback;
      return key;
    },
    convertFileSrc: (path) => path,
    async invoke(cmd, args = {}) {
      if (cmd === 'plugin:event|listen') {
        eventListeners.set(args.handler, args.event);
        return args.handler;
      }
      if (cmd === 'plugin:event|unlisten') return null;
      if (cmd.startsWith('plugin:')) return null;
      const handler = handlers[cmd];
      if (!handler) throw new Error(`mock: 未实现的命令 ${cmd}`);
      await new Promise((r) => setTimeout(r, 30));
      return handler(args);
    },
  };
  window.__TAURI_MOCK__ = { eventListeners, recordings, libraryCollections, libraryFiles, libraryTexts, knowledgeDrafts, audioNotes, resumes, applications, pages, contents, documents };
})();
