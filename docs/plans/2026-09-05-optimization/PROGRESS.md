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
