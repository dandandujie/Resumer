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
