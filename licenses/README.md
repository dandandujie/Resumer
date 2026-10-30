# 原文档编辑依赖声明

## 简历导出内置字体

`src-tauri/fonts/office-fonts.zip` 包含与预览 WOFF2 同源的 Noto Sans SC、Noto Serif CJK SC、LXGW WenKai Lite 完整 TrueType 字体，使用 SIL OFL 1.1，版权及完整许可见 `resumer-bundled-fonts-OFL.txt`。用 `scripts/build-office-fonts.py` 可复现转换；没有改动字形、字体名称或授权字段。

DOCX 只嵌入文档实际引用的内置字体族，并保留完整字形供收件人继续编辑；系统商业字体仅保留字体名，不读取或复制其字体文件。包含完整中文字体的 DOCX 体积会明显增加。字体能否在接收端实际使用仍取决于 Office/WPS 对嵌入字体的支持，不能据此保证所有设备逐像素一致。

原文档编辑使用 `@docx-editor.dev/core`、`@docx-editor.dev/react`、`@docx-editor.dev/i18n` 2.24.0（Apache-2.0）。字体包 `@docx-editor.dev/fonts` 2.24.0 的代码为 Apache-2.0；随附字体采用 SIL OFL 或 GUST Font License。完整上游许可和内嵌依赖声明保留在本目录，并通过 Tauri `bundle.resources` 随桌面包分发。

项目不再依赖 SuperDoc 或其专有 DOCX 引擎，也未安装 `@docx-editor.dev/pro`、`editor-api` 或 `docx-to-pdf`。

## 本地补丁

`patches/@docx-editor.dev__core@2.24.0.patch` 修改了上游 core 的 ESM 与 CJS 构建文件：给现有 `setMarkAttr` 命令增加 `characterSpacing`，接受 -40～200 的整数 twips（-2～10pt），写入 OOXML `w:rPr/w:spacing`。沿用引擎的选区、事务和撤销实现，不重写段落或未选中的文本。

补丁由 pnpm 的 `patchedDependencies` 固定，`pnpm install` 会自动应用。上游 npm 包只分发编译后的引擎，故补丁文件较大；实际变更仅为上述命令分支。升级引擎时必须重新审查接口和重跑原文档格式测试，不能直接忽略补丁失败。

验证入口：`scripts/tauri-mock/test-original-document.mjs` 和 `scripts/verify-original-document.py`。

## 上游资料

- https://github.com/eigenpal/docx-editor
- https://www.docx-editor.dev/docs/2.x/react/props
- https://www.docx-editor.dev/docs/2.x/guides/fonts

内置西文字体是开源替代，不能视为用户原字体的像素级等价。原 DOCX 字体声明保留在文件中；显示效果取决于当前机器和可用字体。

## 本地资料解析

CSV 使用 `csv` 1.4.0（MIT / Unlicense），XLSX 使用 `calamine` 0.37.0（MIT），中文文本编码转换使用 `encoding_rs` 0.8.42（Apache-2.0 或 MIT，另含 BSD-3-Clause 数据）。各自许可和版权文件以组件名前缀保留在本目录，并随应用分发。

## 应用界面字体

界面英文使用 `@fontsource-variable/sora` 的 Sora 变量字体，SIL OFL 1.1，完整许可见 `sora-OFL.txt`；中文使用系统无衬线字体。简历预览与导出仍由简历自己的字体设置控制。
