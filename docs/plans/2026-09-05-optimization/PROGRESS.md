# Resumer 优化执行进度

## WP0 基线固化与验证环境

- 完成项
  - 已创建分支 `feat/2026-09-optimization`。
  - 已提交精简后的工作树基线：`55937de wip: 固化精简后的工作树基线（74 文件，含未提交删除）`。
  - 已执行 `pnpm install --frozen-lockfile`。
  - 已运行完整验收命令。
- 未完成项与原因
  - 无。
- 验收输出摘要
  - 首次安装失败：pnpm 11 发现 `pnpm-workspace.yaml` 中 `allowBuilds` 仍是交互命令生成的占位值，拒绝执行 `esbuild@0.27.7`、`msw@2.13.4` 构建脚本。
  - 按总方案 §3.8 选择最小修复：允许构建 Vite 必需的 `esbuild`，拒绝非运行必需的 `msw`，并删除与 `allowBuilds` 重复的旧 `onlyBuiltDependencies` 配置。修复后冻结安装通过。
  - `pnpm type-check`：通过。
  - `pnpm lint`：通过，0 error、35 warning（均为既有告警）。
  - `cargo test`：通过，12 个测试全部通过。
  - `pnpm build:vite`：通过；保留既有动态/静态导入与大 chunk 警告。
  - 完整命令 `pnpm type-check && pnpm lint && (cd src-tauri && cargo test) && pnpm build:vite`：退出码 0。
- 下一步建议
  - 严格只执行 WP1（排版内核统一），完成验收与独立提交后停止，不进入 WP2。

## WP1 排版内核统一

- 完成项
  - `src/lib/theme-config.ts` 成为主题唯一事实源：统一默认主题、字体方案、字号档位、主题迁移、CSS 变量与预设。
  - 预览、HTML/PDF 导出共用 `buildThemeCss`；导出改为服务端复用 `ResumePreview`，删除重复的静态 classic HTML 模板。
  - classic/modern 预览统一使用正文颜色变量、日期格式化和本地字体方案；classic 头像改为右侧，支持 inline/grid 联系信息布局。
  - 新增前端日期归一化/显示模块与断言脚本；Rust 导出日期模块及单测；编辑器日期支持直接输入、失焦归一化和“至今”开关。
  - JSON/AI 导入边界统一归一化日期；导入建模块失败改为上抛；AI 导入使用标准主题。
  - 将同源字体复制到 `public/fonts/` 并增加 `scripts/sync-fonts.sh`，预览不再依赖 Google Fonts。
  - DOCX/Markdown/TXT 的日期拼接点改用日期内核；未开始 WP2 的 DOCX 样式表重写。
- 未完成项与原因
  - 未做真实断网桌面预览、PDF 逐像素截图及 WPS/Word 人工核对；当前执行环境没有可复现的桌面/WPS 验收入口，避免伪造截图或把 WP2 工作提前带入本 WP。
  - `pnpm lint` 仍有 33 条既有 warning（0 error），主要是 React 19 hooks 规则与既有预览拖拽实现；本 WP 未扩展范围修复。
  - `cargo fmt --check` 会报告基线已有的 `src-tauri/src/db/repo/user.rs` 格式差异；未运行全仓格式化，避免改写无关文件。
- 验收输出摘要
  - `pnpm type-check`：通过。
  - `pnpm lint`：通过，0 error、33 warning。
  - `(cd src-tauri && cargo test)`：通过，13 个测试全部通过（新增日期测试通过）。
  - `pnpm build:vite`：通过；保留既有动态/静态导入与大 chunk 警告。
  - 最终验收串 `pnpm type-check && pnpm lint && (cd src-tauri && cargo test) && pnpm build:vite`：退出码 0。
  - `pnpm test:date`：通过，9 条断言。
  - `grep -rn "DEFAULT_THEME" src | wc -l`：1（仅主题事实源导出）。
  - `git diff --check`：通过。
- 决策记录
  - 按 §3.8 选择同一份 `Reseumer Hei/Song/Kai` 本地字体在预览和导出中优先，确定性优先于系统字体相似度；未新增字体依赖。
  - 页边距按 WP1 规定迁移为 mm；旧值大于 40 按 px×0.2646 迁移，其余沿用数值以避免扩大迁移范围。
  - HTML/PDF 直接服务端渲染现有预览组件，保留二维码预生成；跳过另一套模板实现，避免再次产生排版事实源。
- 下一步建议
  - 停止执行，不开始 WP2；由调度方核对本提交与 PROGRESS.md 后再决定是否派发后续工作包。

## WP2 DOCX 导出重写

- 完成项
  - 重写 `src-tauri/src/export/docx.rs`：DOCX 主题参数改为严格反序列化，缺少字段或未知字体方案直接报错，不补默认值。
  - 建立 Office 样式表：Normal、Title、Heading1、Heading2、ListBullet；统一字体、字号、正文/标题颜色、行距、段后距、A4 页面及 mm 页边距。
  - 支持 `standard` 主题约定的日期样式、头像、个人信息 inline/grid 布局、工作经历、教育、技能、项目、证书、语言及自定义区块。
  - DOCX 复用 Rust 日期内核和内联标记解析器；支持粗体、斜体、下划线、代码标记，TXT 导出统一剥离标记。
  - 前端导出调用链显式传递已解析主题；Markdown 保留原始标记；新增 `标记语法.md` 记录跨格式约定。
  - 增加 DOCX 单测：缺字段拒绝、DOCX 可读取、Office 样式/字体存在、内联标记已转换、头像媒体已打包。
- 未完成项与原因
  - 未进行真实 Word/WPS 人工打开、打印和逐像素比对；当前环境无可复现的桌面验收入口。
  - `avatarStyle: circle` 在 DOCX 中使用等尺寸图片，未引入图片裁剪/形状依赖；预览端的圆形裁剪不影响导出内容。
  - 保留既有 lint warning（33 条、0 error）和 Vite 动态/静态导入及大 chunk 警告，均非 WP2 回归。
- 验收输出摘要
  - `pnpm type-check`：通过。
  - `pnpm lint`：通过，0 error、33 warning。
  - `(cd src-tauri && cargo test)`：通过，15 个测试全部通过。
  - `pnpm build:vite`：通过；保留既有构建警告。
  - 完整验收串 `pnpm type-check && pnpm lint && (cd src-tauri && cargo test) && pnpm build:vite`：退出码 0。
  - `git diff --check`：通过。
- 决策记录
  - 主题参数沿用 WP1 的 `ResolvedTheme` JSON camelCase 结构，Rust 端不设置 serde 默认值；这是命令边界的 fail-fast 选择。
  - DOCX 使用 docx-rs 已有样式、表格和图片 API，不新增导出依赖；头像按主题样式选择尺寸，避免引入图片处理库。
  - `filled` 标题使用 Run shading，`underline` 标题使用段落底边框；圆形头像只保留尺寸语义，裁剪留待具备稳定 Office 形状支持时处理。
- 下一步建议
  - 按用户要求停止于 WP2，不开始 WP3；如需人工视觉核对，应在具备 Word/WPS 或桌面预览入口后单独执行。

## WP3 导入链路

- 完成项
  - 增加 `lopdf` 与限定特性的 `image` 依赖；支持 DOCX、PDF、JSON、PNG/JPEG/WebP 统一导入入口。
  - DOCX 使用 `docx_rs::read_docx` 校验并读取结构，结合 OOXML 段落/表格/列表提取文本；读取 `word/media` 挑选头像，并从 `styles.xml`、`document.xml` 推断字体方案、字号和 mm 页边距。
  - PDF 使用 lopdf 抽取第一页 XObject 图片，支持 JPEG 与 Flate RGB/灰度图片转 PNG；从页面字体 `/BaseFont` 推断 `songti`、`heiti`、`yahei`、`kaiti` 等方案。
  - 新增独立 `pick_avatar_candidate` 函数，按最小尺寸、证件照比例和面积选择候选头像；图片视觉导入支持 `avatarBox` 归一化坐标并由 Rust 裁剪。
  - 导入主题以 standard 为基底合并推断结果；日期继续经过现有归一化内核。
  - 建简历、AI 建简历、导入/替换简历及建模块均使用 SQLite 事务；模块失败上抛并整体回滚，不吞导入错误。替换当前简历仅更新标题和模块，保留原主题与模板。
  - 合并为 `ImportResumeDialog`：统一支持 JSON/PDF/DOCX/图片；编辑器可选择新建或替换当前内容，仪表盘新建入口复用同一导入对话框；删除旧的两个 JSON/文件导入对话框。
  - 新增程序化样本测试：用 docx-rs 生成带头像 DOCX，用 lopdf 生成带 JPEG、BaseFont 的 PDF；验证文本、头像、BaseFont、候选头像、头像裁剪及事务回滚。
- 未完成项与原因
  - 未使用真实 DOCX/PDF 样本进行人工视觉核对；环境没有可复现样本和桌面/WPS 验收入口，因此仅记录程序化测试结果，不伪造人工结论。
  - PDF 字号无法从当前 lopdf 文本提取 API 稳定获得，沿用 standard 字号；字体和页边距仍按可推断数据覆盖主题。
  - AI 结构化解析仍需要用户配置的模型服务；导入链路本身不添加离线模型。
- 验收输出摘要
  - `pnpm type-check`：通过。
  - `pnpm lint`：通过，0 error、31 warning。
  - `(cd src-tauri && cargo test)`：通过，20 个测试全部通过；其中 WP3 导入测试 5 个通过。
  - `pnpm build:vite`：通过；保留既有动态/静态导入与大 chunk 警告。
  - 完整验收串 `pnpm type-check && pnpm lint && (cd src-tauri && cargo test) && pnpm build:vite`：退出码 0。
  - `git diff --check`：通过。
- 决策记录
  - 按 §3.8 选择在现有 `commands/ai.rs` 中实现导入解析，避免为单一导入链路增加额外服务层；解析辅助函数保持独立并直接单测。
  - PDF 图片优先保留 DCT JPEG 原始字节，Flate RGB/灰度数据转 PNG；不引入 PDF 渲染器或 OCR 依赖。
  - 仪表盘保留空白模板创建入口，文件导入统一由 shell 层的 `ImportResumeDialog` 承担；编辑器通过路由识别当前 resume id，避免同一 modal 重复挂载。
- 下一步建议
  - 按用户要求停止于 WP3，不开始 WP4；真实样本和桌面人工核对应在具备样本/入口后另行执行。

## WP4 编辑交互与工具栏

- 前置结构整理
  - 已将导入解析、头像候选、图片裁剪、主题推断和导入事务从 `commands/ai.rs` 移至 `src-tauri/src/import/mod.rs`，命令文件仅保留 AI/Tauri 调用。
  - 整理单独提交：`d09c645 refactor: 拆分导入解析模块`；整理后 `cargo test` 仍为 20 个测试通过。
- 完成项
  - `SortableList`/`SortableItem` 复用 dnd-kit，拖动监听只绑定拖柄；工作经历、教育、项目、证书、语言、自定义模块和技能分类支持拖拽排序。
  - 条目统一提供上移、下移、上方插入和删除按钮；`EditableList` 行也支持拖拽排序。
  - 新增 `InlineFormatButtons`，富文本和列表行提供 B/I/U；标记严格使用 `**`、`*`、`__`，继续复用 `src/lib/resume-text.ts`，未新增第二份 `md()`。
  - 删除第四列 `ThemeEditor`，新增预览面板顶部 `FormatRibbon`，覆盖预设、字体、字号、行距、段距、页边距、标题样式、日期格式和颜色。
  - 工具栏新增「文件」菜单入口，导入/导出/设置归入文件菜单；LocaleSwitcher 和自动保存开关/间隔移入设置对话框。
  - 编辑器根布局、工具栏和预览区域保持 `min-w-0`/横向可滚动控件，避免 1200px 窗口被工具栏撑出页面横向滚动。
- 未完成项与原因
  - 未执行真实桌面 1200px 截图和触控设备人工验收；当前环境没有可复现的桌面验收入口，避免伪造视觉结论。
  - 未开始 WP5。
- 验收输出摘要
  - `pnpm type-check`：通过。
  - `pnpm lint`：通过，0 error、31 warning。
  - `(cd src-tauri && cargo test)`：通过，20 个测试全部通过。
  - `pnpm build:vite`：通过；保留既有动态/静态导入与大 chunk 警告。
- 决策记录
  - 使用一个轻量 `SortableList` 包装所有条目而不是为每个 section 复制 DndContext；拖柄由 `SortableItem` 统一渲染，按钮操作仍走各 section 的现有更新回调。
  - 排版工具条沿用现有 ThemeConfig 与保存机制，以 Popover 承载控件；保留 `showThemeEditor` store 字段作为兼容性的显示开关，避免引入第二套状态。
  - 文件菜单复用现有 `activeModal`，不新增路由或菜单状态；设置对话框复用已有 settings store。
- 下一步建议
  - 停止执行，不开始 WP5；如需真实 1200px/触控验收，待具备桌面入口后另行执行。

### WP4 修正记录

- 按 §2.5 重组编辑器工具栏：左侧保留返回、标题和保存状态；中左新增「文件」菜单（保存 ⌘S、导入、导出、另存副本、版本历史占位）并保留撤销/重做；中右保留 JD 匹配、投递记录、模拟面试和「AI 工具」；右侧独立显示排版和设置。
- 删除独立一级导出按钮；窄屏菜单同步加入文件菜单的导入、导出、另存副本和版本历史占位；另存副本复用 `duplicateResume`/`duplicate_resume`。
- 版本历史当前无现成 UI，使用禁用占位项，待版本历史能力实现后接入。
- 整理指定文件的 JSX、导入、数据表和长字符串格式，单行均不超过 120 字符；对格式专属文件使用 `git diff -w` 自检，未发现逻辑性变更。

## WP5 联网搜索还原与接入

- 还原资产
  - 从 `a2eb4ce` 整文件还原 `src-tauri/src/ai/search.rs` 与 `src/hooks/use-web-search-mode.ts`，并在 `src-tauri/src/ai/mod.rs` 注册搜索模块。
  - 按历史差异逐段恢复 `AIConfig` 的联网搜索字段、stream native 搜索注入与失败降级重试、`webSearch` 工具及设置存储/设置界面联网搜索区块；未整体 checkout 已改动文件。
- 接入链路
  - `tools::tool_specs(web_search_enabled)` 仅在 free/Bing/Google/百度/Tavily/Grok 模式开启 `webSearch`；`chat.rs` 异步分发搜索结果。
  - 恢复 Anthropic `web_search_20250305`、Gemini `google_search`、xAI `search_parameters` 注入；native 搜索被上游拒绝时只重试一次并关闭 native 搜索。
  - AI 消息新增来源卡片，显示标题、链接和摘要。
  - 设置支持关闭、模型自带、Tavily、Grok，并将搜索配置随 AI request config 传入 Rust。
- 非流式场景预检索
  - JD 分析、求职文案和模拟面试首轮在搜索开启且使用外部搜索引擎时确定性预检索，并把最多 5 条结果注入 prompt/system prompt。
  - 预检索失败只记录 `warn` 并跳过：搜索是增强能力，不应阻断主 AI 任务；关闭搜索时不执行预检索，主路径保持原行为。
- 未完成项与原因
  - 未使用真实联网凭据执行人工验收；当前环境没有可复现的外部搜索账号，避免伪造搜索结果或验收结论。
  - 版本历史仍为 WP4 的占位项；未开始 WP6。
- 验收结果
  - `pnpm type-check`：通过。
  - `pnpm lint`：通过，0 error、31 warning。
  - `(cd src-tauri && cargo test)`：通过，20 个测试全部通过。
  - `pnpm build:vite`：通过。
- 决策记录
  - 搜索默认关闭，确保关闭搜索时与 WP4 前行为一致；`native` 只走 provider 原生注入，不伪造本地预检索结果。
  - 非流式预检索只在首轮执行；搜索失败不影响 JD 分析、文案生成和面试主任务。

### WP5 修正记录

- 修正 JD 分析和求职文案预检索：新增可选 `company`/`role` 参数；只有至少一个非空时才搜索。
- JD 分析查询改为 `公司 岗位 岗位要求 面试`，求职文案查询改为 `公司 公司简介 业务 招聘`；不再把 JD 正文作为搜索词。
- JD 分析和求职文案对话框新增公司/岗位两列小号输入，默认读取 `toolPrefill.company/role`，并在有 `sourceApplicationId` 时从投递记录补全。
- `tauri-api.ts`、客户端 AI service、Rust Tauri 命令及中英文 i18n 已同步；`interview_chat` 保持不变。

## WP6 知识库 v1

- 完成项
  - 新增 `knowledge_pages` 与 SQLite FTS5 trigram 索引迁移；单测验证 trigram 可用。
  - 新增 Vault、索引和 FTS 模块：路径白名单拒绝 `..`，使用极简 frontmatter 解析，不引入 YAML 依赖。
  - 初始化 `purpose.md`、`schema.md`、`index.md`、`log.md` 及知识库目录；从 `a2eb4ce` 导入 9 篇种子页，已存在页面不覆盖。
  - 检索支持 FTS 命中、wikilink 一跳扩展、类型过滤和数量截断；写入、导入会更新 SQLite、索引和日志。
  - 增加 `searchKnowledge`、`readKnowledge`、`proposeKnowledgeUpdate` 工具；提案仅返回待采纳内容，不直接写盘。
  - 系统提示词注入 `purpose.md` 前 2KB 与 `index.md` 前 60 行；JD、文案和面试预检索统一合并本地知识库与 WP5 外部搜索。
  - 新增 `/knowledge` 三栏页面、导航、知识库 store、页面编辑/目的表编辑、资料上传 ingest 和页面元信息展示。
- 未完成项与原因
  - 未使用真实桌面入口执行页面视觉、触控和上传人工验收；当前环境无可复现桌面验收入口。
  - 未使用真实联网凭据执行外部搜索人工验收；沿用 WP5 的降级策略。
  - `proposeKnowledgeUpdate` 后续可在现有提案卡具备知识页专用回滚/采纳语义后接入；当前后端已保证提案不写盘。
- 验收结果
  - `pnpm type-check`：通过。
  - `pnpm lint`：通过，0 error、33 warnings（既有告警）。
  - `(cd src-tauri && cargo test)`：通过，21 个测试全部通过，包含 trigram 单测。
  - `pnpm build:vite`：通过；保留既有动态/静态导入及大 chunk 警告。
- 决策记录
  - 采用标准库文件操作和手写 frontmatter，跳过 `serde_yaml` 与额外 Markdown/索引依赖。
  - 上传资料保存为 `raw/` 原文并生成 `wiki/sources/` 页面，内容截断为 4000 字符，避免首版无限制膨胀。
  - 知识库搜索每次先确保初始化并重建索引，优先保证数据一致性；规模扩大后再引入增量索引。

### WP6 修正记录

- 修正 ingest：复用导入模块抽取 Markdown/TXT、PDF、DOCX 和图片资料；原始字节写入 `raw/`，调用 JSON mode LLM 生成 source 摘要、frontmatter 标签和实体提案，实体不直接写盘。
- 修正知识提案：chat 通过 `ai-chat-event` 发出提案事件，前端显示路径、原因和内容摘要，支持采纳写回知识库或撤销；模型收到“已展示，等待采纳”。
- WebSearch 来源卡片新增“存入知识库”，通过同一 ingest 流程处理。
- 索引更新改为启动、写入/导入和手动重建时执行，搜索只读现有 FTS 表。
- `purpose.md` 新增目标岗位、期望城市、目标行业、硬约束和其他字段的表单化编辑与 Markdown 序列化。
- 新增 Markdown ingest 完整路径测试；LLM 摘要通过生成器函数注入，测试不访问网络。
