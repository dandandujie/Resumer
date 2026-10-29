# Resumer

本地优先的求职工作台：**写好简历 → 投出去 → 记住每一步进展 → 面试前有准备**。基于 **Tauri 2 + React 19 + Vite** 构建，所有数据存在本机 SQLite，不需要登录、不需要服务器。

原项目链接：<https://github.com/twwch/JadeAI>

当前版本 **0.7.0**：统一编辑与导出格式，修复预览自动缩放抖动，重新整理模块管理、排版和设置交互，并补齐工作地点编辑、自定义样式预设及联网搜索配置。

## 三个模块

### 工作台 —— 把时间花在内容上，而不是排版上
- 多份简历并存，卡片直接展示姓名/岗位/最近经历/技能，以及这份简历已投了几家
- 拖拽排序 + 实时 A4 预览；`classic` / `modern` 两套模板，主题（颜色、字体、间距、页边距）随时调
- 导出 PDF（含智能一页）、DOCX（带样式表，WPS/Word 可继续编辑）、HTML、Markdown、TXT、JSON；JSON 可再导入
- 导入 DOCX、PDF、图片后由 AI 分析，转换为 Resumer 的结构化简历，再使用 App 的编辑与排版能力；替换前保留历史快照
- 也可用一段描述让 AI 生成结构化初稿
- 排版页签：内置“标准”预设，可将自己的颜色、字体和间距保存为自定义预设；支持中文字体 × 西文字体、字号、行距、页边距、标题样式、日期格式
- 选中一段文字即可通过格式栏单独改粗斜下划线、颜色、字号、字体，预览 / PDF / DOCX 保留局部格式
- 模块管理直接展示排序与增减入口；条目卡片可折叠、拖拽与上下移，正在编辑的条目在预览里高亮并双向定位
- 工作经历可编辑公司旁的工作地点，预览和导出中与公司名同行；个人信息保留照片与文字组成的居中布局
- 每条经历旁的 ✨：量化改写 / STAR 化 / 换用 JD 原词，结果以提案卡出现，采纳才生效
- 版本历史：每次保存、导出、投递、采纳 AI 修改都留一版，可预览、可恢复，能找回"投给 XX 的那一版"

**简历 AI 助手**（编辑器右侧）内置中国就业市场的猎头与 HR 视角：HR 初筛的视线路径、ATS 关键词命中逻辑、六类行业岗位的侧重、量化写作法则与"绝不编造数字"的红线。它能直接改简历（每处改动生成提案卡，采纳/撤销由你决定），也看得到这份简历投过哪些岗位、目标 JD 是什么。

配套工具：JD 匹配分析（硬性门槛 / 命中与缺失的 JD 原词 / ATS 评分 → 一键优化或派生一份定制副本）、语法检查（中文简历专项病灶）、中英互译、求职文案（Boss 开场白 / 邮件求职信 / 一分钟自我介绍）。

### 求职动态 —— 投了哪里、进展如何、接下来要做什么
- 一条**投递记录** = 一家公司 + 一个岗位 + 当时用的那份简历。同一份简历可以投多个岗位，同一个岗位不同时期也可以用不同简历投
- 每条记录自带：渠道、投递日期、HR 及联系方式、**完整 JD**、备注、**多轮面试**（轮次 / 形式 / 时间 / 地点或会议链接 / 面试官 / 考察重点 / 笔记）、最终结果与复盘、下次跟进日期
- 页面顶部是**接下来 7 天**：排好的面试、逾期与今日到期的跟进；旁边是投递→初筛→面试→Offer 的转化漏斗
- 从任意一条投递可以直接发起 **JD 匹配分析 / 求职文案 / 模拟面试**，JD、公司、岗位、轮次自动带入，不用再复制粘贴
- **模拟面试**以目标公司面试官的身份、基于你的简历与 JD 提问追问；说"结束"得到结构化评价，一键存档到对应投递
- 简历删除后，投递记录仍保留（只是不再关联简历）
- 结果落定后可「复盘并沉淀」：生成经验页与 SOP 修订提案；面试前可一键生成「面试准备包」

### 知识库 —— 你的求职 Wiki，AI 随时查

- 本机 `knowledge/` 目录就是一个 Obsidian vault：`purpose.md`（求职目标，注入每一次 AI 对话）、岗位画像与 SOP 种子页、公司 / 岗位 / 市场 / 经验 / 来源页
- 上传 PDF / DOCX / Markdown 资料 → AI 生成来源页与公司 / 岗位实体提案；联网搜索结果可一键存入
- 全文检索（SQLite FTS5）+ wikilink 一跳扩展；图谱视图把知识页、投递、面试、简历连在一起
- AI 只能提出修改（提案卡），采纳后才写盘；在 Obsidian 里改完点「重新索引」即可同步

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面壳 | Tauri 2（Rust） |
| 前端 | React 19 + Vite 7 + Tailwind CSS 4 + shadcn/ui |
| 原文档编辑 | `@docx-editor.dev/core/react` 2.24.0（Apache-2.0） |
| 状态 | Zustand |
| 数据库 | SQLite（rusqlite 内嵌，9 个迁移；FTS5 全文检索） |
| AI 调用 | Rust `reqwest` 流式代理 OpenAI 兼容 / Anthropic / Gemini 三种协议 |
| 导出 | 系统 Chromium 系浏览器渲染 PDF；`docx-rs`；自渲染 HTML / Markdown |

## 快速开始

需要 Node.js 22.13+、pnpm 11.7.0 和 Rust stable，以及 [Tauri 2 对应平台的系统依赖](https://v2.tauri.app/start/prerequisites/)。`packageManager` 固定 pnpm 版本，本地和 CI 使用同一份补丁锁文件。字体资源、第三方许可和 DOCX 引擎补丁随仓库提供，安装依赖时会自动应用补丁。

```bash
corepack enable
pnpm install
pnpm dev        # Vite + Tauri 窗口
```

常用命令：`pnpm build`（打包）、`pnpm build:mac` / `pnpm build:win`、`pnpm lint`、`pnpm type-check`、`pnpm test`（前端断言脚本）；Rust 侧 `cd src-tauri && cargo test`。提交前完整验收：`pnpm type-check && pnpm lint && pnpm test && (cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test) && pnpm build:vite`（CI 跑同一组）。

首次使用：设置 → AI 渠道，选一个渠道（OpenAI / Anthropic / Gemini 官方，或 DeepSeek、Kimi、智谱、任意 OpenAI 格式中转）填入 API Key，「测试连接」后挑几个常用模型即可。

设置 → 通用设置集中管理语言、自动保存、联网搜索和备份。所有搜索配置均直接显示，单选决定当前使用的服务：

- 无独立 Key：模型自带、DuckDuckGo、Bing、Google、百度；公开网页搜索可能受限流影响，模型自带方式取决于渠道能力。
- 独立服务：Tavily、Grok / xAI、豆包 / 火山方舟、DeepSeek 原生搜索、DeepSeek 直接检索；均提供独立测试按钮。
- 豆包需要支持搜索的模型或推理接入点。DeepSeek 两种方式参照[官方 Harness](https://github.com/deepseek-ai/deepseek-harness)的 Messages 与 Search API 实现，实际可用性取决于账号权限。搜索配置与主聊天模型配置分开保存。

浏览器交互回归使用隔离的虚构数据，不连接个人资料库，启动方法和各专项脚本见 [测试说明](scripts/tauri-mock/README.md)。本地 HTTP 协议测试覆盖搜索请求与结果解析，不代表已使用真实付费账号联调全部服务。

## 数据与隐私

所有数据均在本机：

- `app_data_dir/reseumer.db` —— 简历与版本历史、投递记录、模拟面试存档、AI 对话（macOS: `~/Library/Application Support/com.reseumer.desktop/`）
- `app_data_dir/knowledge/` —— 知识库 vault（Markdown，可用 Obsidian 打开）
- API Key 仅存本机 localStorage，请求由桌面端直接发给你配置的模型服务商，不经过任何中间服务器

换设备或清理应用数据前，用「设置 → 通用设置 → 数据与备份 → 导出备份」得到一个 zip（含数据库、知识库与 AI / 搜索配置），在新设备「从备份恢复」即可。备份包含 API Key，请妥善保管。

## 说明与限制

- 新文件统一经 AI 转成结构化简历；原文档模式仅用于已有数据的兼容。导出的目标是保留 App 简历的内容、样式与布局，跨 Word/WPS 的完整简历保真验收仍在进行。PDF 保留文字与图片，但 Office 将 PDF 转为可编辑文档时可能重新排版。
- DOCX 自动嵌入所使用的内置开源中文字体，便于接收方继续编辑；完整字库会增大文件。系统字体仅写入名称，接收设备需安装相应字体。
- DOCX 引擎的开源许可、字体声明及字距补丁说明见 [licenses](licenses/README.md)。底层样本测试不能替代从 App 编辑、导出到 Word/WPS 修改保存的完整使用流程验收。

- PDF 导出调用本机已安装的 Chromium 系浏览器（Chrome / Edge / Brave / Vivaldi / Opera / Arc 均可）；未安装时可先导出 HTML 再用浏览器打印
- GitHub Actions 只构建 `aarch64-apple-darwin` 与 `x86_64-pc-windows-msvc`；Intel Mac / Linux 需本地构建

## macOS 首次启动

安装包仅 ad-hoc 签名，首次打开可能被 Gatekeeper 拦截：

**方式 A（推荐）**：`brew tap dandandujie/reseumer && brew install --cask reseumer`

**方式 B**：安装后执行 `xattr -cr /Applications/Resumer.app`，或 Finder 右键 → 打开。

## 许可证

Apache-2.0，见 [LICENSE](./LICENSE)。致谢：对话交互参考 [Cherry Studio](https://github.com/CherryHQ/cherry-studio)。

## 友情链接

- [linux.do](https://linux.do)
