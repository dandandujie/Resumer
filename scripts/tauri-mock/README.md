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

默认 `MOCK_ORIGIN=http://127.0.0.1:5174`，使用仓库内虚构 DOCX 样本。验证真实导入、未修改字节保留、键盘编辑、选区格式、保存失败/另存抢救、历史恢复及退出保存，并运行 `scripts/verify-original-document.py` 比对 OOXML。文档状态在隔离浏览器 sessionStorage 中持久化，用于刷新回读；不使用用户真实文件。

生产包验证：先 `pnpm build:vite` 和 `pnpm exec vite preview --host 127.0.0.1 --port 4174`，再执行：

```sh
MOCK_BUILD=1 MOCK_ORIGIN=http://127.0.0.1:4174 node scripts/tauri-mock/test-original-document.mjs
```

可选 `OFFICE_ROUNDTRIP=/绝对路径/word-roundtrip.docx`：使用 Word 打开测试输出的 `formatted.docx`，把日期改为 `2026-10-03` 并另存该文件后，测试会额外验证重新导入时的日期、两页与头像。此选项只用于上述生成样本，不传用户真实文件。测试输出位于 `/tmp/resumer-original-document-tests/`。
