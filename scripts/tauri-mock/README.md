# 浏览器交互验收

使用内存中的示例简历、投递和知识页，不连接用户的实际资料库。`vite.config.ts` 只在开发服务器且 `MOCK_TAURI=1` 时注入模拟后端，正式构建不包含示例数据。

```sh
MOCK_TAURI=1 pnpm dev:vite --host 127.0.0.1 --port 5174
pnpm test:ui
```

浏览器脚本需要 Node.js 22+（使用原生 WebSocket）。默认自动查找本机 Playwright 缓存中最新的 Chromium headless shell，可用 `PLAYWRIGHT_BROWSERS_PATH` 指定缓存目录。其他环境通过 `CHROME=/绝对路径/chromium` 指定可执行文件；`BASE` 可覆盖服务器地址，`OUT` 可覆盖截图目录（默认 `/tmp/resumer-ui`）。不自动下载浏览器。

测试覆盖选区格式与预览高亮、保存回读、撤销重做、中文组字、回车新增条目、标签输入、两种模板、投递搜索与看板、详情分页、知识库读写和草稿、快速切页、页面崩溃恢复，以及中英文四种窗口宽度。原生鼠标事件发送前等待动画结束并检查命中点，控件遮挡、断言失败或运行时异常都会使进程以非零状态退出。截图是补充证据。

单独查看某个页面：

```sh
BASE=http://127.0.0.1:5174 node scripts/tauri-mock/shot.mjs /tmp/resumer-shots /zh/knowledge
```

动作可追加到路由的 `#` 后，用 `&` 分隔：`click=text:工作经历`、`select=css:[contenteditable]|0|2`、`key=Meta+b`、`assert=表达式`。复杂断言直接写进 `test-ui.mjs`，避免表达式里的 `&` 与动作分隔符冲突。

浏览器回归验证前端和接口往返；真实 AI 服务、系统文件对话框和 macOS WebKit 的人工操作不在模拟后端覆盖范围内。Rust 单测另由 `cargo test --lib` 验证。

## 原始需求核对

既有回归通过不表示所有用户需求完成。独立探针覆盖姓名/公司格式、修改后的高亮、合并字段、模板遗漏、离开知识库后的草稿、投递版本异步关联：

```sh
node scripts/tauri-mock/audit-requirements.mjs
```

结果及截图默认写到 `/tmp/resumer-requirement-audit`。退出码 `0` 表示探针全部符合预期，`1` 表示存在需求或能力边界缺口，`2` 表示探针执行异常。能力边界检查（如自定义字号）与用户逐字明确要求的区别见需求核对报告，不把每个 GAP 都算成一个独立缺陷。此脚本独立于原有回归，不能为了得到绿色结果而把缺失能力改写成成功断言。

## DOCX 原文档与 Word 回读

```sh
node scripts/tauri-mock/test-original-document.mjs
```

默认 `MOCK_ORIGIN=http://127.0.0.1:5174`，使用仓库内虚构 DOCX 样本。通过兼容接口置入既有原文档样本（新文件仍走 AI 结构化导入），验证未修改字节保留、键盘编辑、选区格式、保存失败/另存抢救、历史恢复及退出保存，并运行 `scripts/verify-original-document.py` 比对 OOXML。文档状态在隔离浏览器 sessionStorage 中持久化，用于刷新回读；不使用用户真实文件。

生产包验证：先 `pnpm build:vite` 和 `pnpm exec vite preview --host 127.0.0.1 --port 4174`，再执行：

```sh
MOCK_BUILD=1 MOCK_ORIGIN=http://127.0.0.1:4174 node scripts/tauri-mock/test-original-document.mjs
```

可选 `OFFICE_ROUNDTRIP=/绝对路径/word-roundtrip.docx`：使用 Word 打开测试输出的 `formatted.docx`，把日期改为 `2026-10-03` 并另存该文件后，测试会额外验证重新导入时的日期、两页与头像。此选项只用于上述生成样本，不传用户真实文件。测试输出位于 `/tmp/resumer-original-document-tests/`。

## 版本历史与常用操作

`node scripts/tauri-mock/test-version-history.mjs` 验证常显操作、草稿与历史身份、命名、重命名、变更对比、删除与恢复保护、写盘失败、保存队列和过期响应；覆盖中英文四种窗口宽度与 JSON 替换导入保护。Rust 版本仓储测试另覆盖权限、关联投递保护与自动快照合并窗口。

## 录音与低填写成本流程

`node scripts/tauri-mock/test-recording-intake.mjs` 验证一段描述生成草稿、按需配置后返回原任务、文件自动命名、招聘信息先提取预览再应用、录音不自动上传、转写前服务提示、校对稿保存、提炼预览与知识入库、独立语音配置持久化。服务响应为隔离 mock；Rust 另用本机 HTTP 服务器验证真实 multipart 请求，原生应用在独立数据标识下验收系统文件选择器与 FFmpeg 失败重试，不触及真实用户资料。

## 工作区与控件反馈

`node scripts/tauri-mock/test-stats-workspace.mjs` 验证浅深色跨页面继承、设置边界、可读字号、文档纸张的文字色/浅色模式隔离、主从导航与窄窗口。

`node scripts/tauri-mock/test-control-states.mjs` 使用实际指针/键盘事件验证普通与主按钮的悬停、按下和焦点反馈，以及暗色开关、空库单一引导和明确的危险菜单。原生 WebKit 另用隔离标识与虚构资料人工验收深色切换，避免仅检查白色纸张背景而漏掉文字不可见问题。


## 自然语言与持续 Wiki

`node scripts/tauri-mock/test-workspace-assistant.mjs` 验证缺失信息追问、后续上下文、预览后采纳、过期投递提案、50个分类检索与键盘操作、混合音频/文档导入、提炼草稿稍后找回、摘要入库、Wiki编译、引用问答保存、维护与窄窗口。服务均为隔离 mock；不代表真实模型输出质量。

`pnpm test` 的 `test-workspace-plan.ts` 验证字段保留、多个新投递别名关联、轮次/目标合法性、真实日历日期与过期保护。`test-journal-commit.ts` 执行真实 store 与编排、注入 IPC 故障，覆盖稳定请求重试、失败不改内存、批次前后保存队列及提交期间的新输入。Rust `db::repo::journal_plan` 测试用 SQLite 故障验证事务回滚、整批前置内容比较和持久化回执；不能用 mock 成功替代这些数据库测试。

Wiki 编译器测试以暂停生成模拟“读取 A → 生成等待时改成 B → 返回 A 的提案”，验证整批拒绝且磁盘/索引保留 B；旧导入测试覆盖索引重建后的去重、升级恢复、同名原件保留与删除来源页后重新导入。

Rust 库测试使用本机 HTTP 服务验证全文末段被发送、完成段缓存及服务隔离；另检查录音原件保留且仅提炼内容入索引、来源变更保护、整批Wiki冲突拒绝、写入失败回滚、重试幂等、符号链接越界拒绝、Obsidian属性保留与问答回链。原生验收使用独立数据标识和本机假AI/语音服务，退出重开核对持久化，不操作真实用户资料。


## 多标签与文件式 Wiki

`node scripts/tauri-mock/test-wiki-tags.mjs` 覆盖一集多标签、交集/并集/未打标签筛选、增删标签、目录树、多笔记标签、前后导航、收藏、全文摘要/高亮、跨标签草稿、外部编辑冲突选择、新建文件夹/笔记、标题式双链、属性保存、辅助栏、大纲、快速打开以及1200/900/390px边界。

`test-knowledge-navigation.ts` 验证标签含义、旧分类兼容、大小写、实际目录层级、标题歧义、Markdown大纲、搜索上下文和原件路径。Rust测试另覆盖14→15迁移、标签交集/并集SQL、原有数据完整性、合法Markdown属性、标题链接、全文后段摘要及直接搜索/AI一跳扩展的区别。


## 自定义模板与结构化练习（2026-11-01）

打开 `/zh/editor/r-demo?ai_review=1` 使用隔离示例与假AI响应。模板/练习/笔记放在当前隔离浏览器的sessionStorage；真实应用仍使用SQLite和既有备份，不依赖浏览器示例存储。

手工交互验收覆盖1200/900/390px和深色：版式与侧栏、浅色对比、模板保存/撤销/刷新、跨简历新建空内容、单条定位、回答/解释/跳题、关闭恢复、改写过期拒绝、模型设置往返、复习笔记/状态/来源筛选、Wiki提案全文审阅及采纳。

一次性故障入口：`?ai_review=1&practice_fail_step=1&practice_fail_summary=1`。首次提交应保留输入且不追加轮次，重试只新增一轮；总结失败保留问答并允许重试。mock成功只证明前端交互，真实SQLite原子性/并发保护和DOCX结构由Rust测试验证，不代表已用真实AI或Office全流程联调。

`pnpm test` 包含模板内容隔离、稳定定位、过期改写及纯规则依赖守卫；`cargo test --lib` 包含原文引用过滤、澄清不计掌握、版本保护、事务失败回滚、完整长回答留存和自定义DOCX几何/文字色检查。

## 工作随记

`/zh/work-notes?ai_review=1` 使用隔离假 AI。一次性故障入口追加 `&note_fail_save=1&note_fail_analysis=1&note_fail_compose=1`。覆盖本机先保存、失败保留、后台接话、刷新、关键词/经历筛选、原话修改、来源过期、素材审阅与编辑器采纳/撤销。随记和提案保存在隔离 sessionStorage；正式应用使用 SQLite。`pnpm test` 与 `cargo test --lib` 分别覆盖采纳规则及真实数据库的并发/失败边界。

随记自动回归：`BASE=http://127.0.0.1:5174 node scripts/tauri-mock/test-work-notes.mjs`。覆盖失败恢复、来源与采纳、默认单任务界面、按需展开、隐藏筛选提示、模型浮层与键盘焦点，截图默认输出到 `/tmp/resumer-work-notes`。


## 桌面随记提醒

`BASE=http://127.0.0.1:5175 node scripts/tauri-mock/test-desktop-reminder.mjs` 覆盖默认关闭/设置保存失败/刷新、桌面与主窗草稿隔离、IME、Esc、落盘失败不收起、先保存再收起、AI失败回到主界面重试、320/390/400宽度浅深色及逐条改写/练习入口。Mock只记录预览和收起调用，不能证明原生窗口显隐、焦点或系统调度。

`cargo test --lib db::repo::note_reminder` 覆盖真实SQLite提醒回执：启用/星期/时间/休眠宽限、重启/时钟回拨去重、延后过期与关闭、非法设置保护、写盘失败回滚重试。原生窗口必须另用独立identifier构建并人工验收，不访问真实应用数据。


## v2经历归属与视觉迭代

`BASE=http://127.0.0.1:5175 node scripts/tauri-mock/test-experience-capture.mjs`验证无经历引导、创建、稳定归属、跨经历隔离、独立草稿及旧原话归组。`test-work-notes.mjs`继续保留40项回归。`test-desktop-reminder.mjs`已升级为38项，包含360/390/320px浅深色、动态高度请求/上限和无经历引导。`?no_experiences=1`为空经历隔离场景。模拟经历不代表用户真实工作事实。

## 基础简历与定向空间（2026-11-04）

`BASE=http://127.0.0.1:5177 node scripts/tauri-mock/test-resume-workspaces.mjs`覆盖基础/全部、多个场景、创建失败/响应丢失/刷新幂等、需求保存与来源快照、目标AI请求、独立编辑、源更新/删除、浅深窄窗。Mock存储关系和简历于隔离sessionStorage；正式使用SQLite022迁移。故障开关：`window.__TAURI_MOCK__.workspaceDeriveError`、`workspaceDeriveResponseError`、`workspaceContextError`一次性。真实原子性、所有权、DOCX冻结保留和非法输入由Rust工作空间测试验证。
