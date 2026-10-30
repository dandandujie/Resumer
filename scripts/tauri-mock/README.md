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

`pnpm test` 的 `test-workspace-plan.ts` 验证字段保留、多个新投递别名关联、轮次/目标合法性、真实日历日期与过期保护。

Rust 库测试使用本机 HTTP 服务验证全文末段被发送、完成段缓存及服务隔离；另检查录音原件保留且仅提炼内容入索引、来源变更保护、整批Wiki冲突拒绝、写入失败回滚、重试幂等、符号链接越界拒绝、Obsidian属性保留与问答回链。原生验收使用独立数据标识和本机假AI/语音服务，退出重开核对持久化，不操作真实用户资料。


## 多标签与文件式 Wiki

`node scripts/tauri-mock/test-wiki-tags.mjs` 覆盖一集多标签、交集/并集/未打标签筛选、增删标签、目录树、多笔记标签、前后导航、收藏、全文摘要/高亮、跨标签草稿、外部编辑冲突选择、新建文件夹/笔记、标题式双链、属性保存、辅助栏、大纲、快速打开以及1200/900/390px边界。

`test-knowledge-navigation.ts` 验证标签含义、旧分类兼容、大小写、实际目录层级、标题歧义、Markdown大纲、搜索上下文和原件路径。Rust测试另覆盖14→15迁移、标签交集/并集SQL、原有数据完整性、合法Markdown属性、标题链接、全文后段摘要及直接搜索/AI一跳扩展的区别。
