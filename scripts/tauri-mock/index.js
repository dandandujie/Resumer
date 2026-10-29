// 浏览器里跑前端用的 Tauri 假后端：`MOCK_TAURI=1 pnpm dev:vite` 时由 vite.config.ts 注入。
// 只为看界面与交互，数据都在内存里，刷新即丢。不会进入正式构建。
(function () {
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

  // 仅测试页使用 sessionStorage 模拟设置落库，便于验证刷新后的持久化。
  let mockSettings = { autoSave: true, autoSaveInterval: 500 };
  try { mockSettings = { ...mockSettings, ...JSON.parse(sessionStorage.getItem('resumer-mock-settings') || '{}') }; } catch { /* 测试缓存损坏时使用初始配置 */ }
  const handlers = {
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
      return null;
    },
    delete_resume: ({ id }) => { delete resumes[id]; return null; },
    duplicate_resume: ({ id }) => { const nid = `${id}-copy`; resumes[nid] = { ...resumes[id], id: nid, title: `${resumes[id].title}（副本）` }; return nid; },
    list_resume_versions: ({ resumeId }) => versions.filter((v) => v.resumeId === resumeId),
    get_resume_version: ({ id }) => { const v = versions.find((x) => x.id === id); return v ? { ...v, snapshot: resume } : null; },
    create_resume_version: () => id('v'),
    restore_resume_version: () => null,
    list_applications: () => applications,
    save_application: ({ application: record }) => { const i = applications.findIndex((a) => a.id === record.id); if (i >= 0) applications[i] = record; else applications.unshift(record); return record; },
    delete_application: ({ id }) => { const i = applications.findIndex((a) => a.id === id); if (i >= 0) applications.splice(i, 1); return null; },
    list_mock_interviews: () => mocks,
    delete_mock_interview: () => null,
    create_mock_interview: ({ mock: record }) => ({ ...record, createdAt: now }),
    import_legacy_journal: () => null,
    knowledge_list: () => pages,
    knowledge_read: ({ path }) => contents[path] || `# ${path}\n\n（示例内容）`,
    knowledge_write: ({ path, content }) => { contents[path] = content; return null; },
    knowledge_graph: () => graph,
    knowledge_lint: () => ({ issues: ['wiki/roles/frontend.md 缺少 summary', 'raw/bytedance-jd.md 未被任何页面引用'], proposals: [] }),
    knowledge_reindex: () => pages.length,
    knowledge_purpose: () => contents['purpose.md'],
    knowledge_create_page: () => null,
    knowledge_search: () => [],
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
    const entry = { id:id('dv'), resumeId:rid, event, label, resumeTitle:resumes[rid].title, createdAt:now+documentVersions.length,
      snapshot:structuredClone(resumes[rid]), document:structuredClone(documents[rid]) };
    documentVersions.unshift(entry);
    persistDocuments();
    return entry.id;
  };
  handlers.import_original_docx = ({ filename, bytes, targetResumeId }) => {
    const rid = targetResumeId || id('doc');
    resumes[rid] = { ...resume, id:rid, template:'original-docx', title:filename, sections:[] };
    documents[rid] = { filename, bytes, revision:1 };
    documentSnapshot(rid,'save','导入原文档');
    return rid;
  };
  handlers.get_original_docx = ({ resumeId, versionId }) => structuredClone(versionId ? documentVersions.find((v)=>v.id===versionId && v.resumeId===resumeId)?.document : documents[resumeId]);
  handlers.save_original_docx = ({ resumeId, revision, bytes }) => {
    const doc = documents[resumeId];
    if (revision !== doc.revision) throw new Error('文档已在其他窗口更新');
    doc.bytes = bytes; doc.revision++;
    documentSnapshot(resumeId,'save','');
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
  handlers.create_resume_version = ({resumeId,event,label=''}) => documents[resumeId] ? documentSnapshot(resumeId,event,label) : id('v');
  handlers.restore_resume_version = ({versionId}) => {
    const version=documentVersions.find((v)=>v.id===versionId);
    if(!version)return;
    const revision=documents[version.resumeId].revision+1;
    documents[version.resumeId]={...structuredClone(version.document),revision};
    resumes[version.resumeId]=structuredClone(version.snapshot);
    persistDocuments();
  };
  handlers.save_docx_copy = ({filename,bytes}) => { window.__TAURI_MOCK__.exportedDocument={filename,bytes}; return '/tmp/mock-recovery.docx'; };
  const eventListeners = new Map();
  let callbackSeq = 1;
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
  window.__TAURI_MOCK__ = { resumes, applications, pages, contents, documents };
})();
