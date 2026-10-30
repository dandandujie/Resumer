import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'fs';

const host = process.env.TAURI_DEV_HOST;

/** `MOCK_TAURI=1 pnpm dev:vite`：在纯浏览器里注入假 Tauri 后端，用来看界面。只作用于 dev server。 */
function tauriMock(): Plugin {
  return {
    name: 'tauri-mock',
    apply: 'serve',
    transformIndexHtml(html) {
      if (process.env.MOCK_TAURI !== '1') return html;
      const script = readFileSync(path.resolve(__dirname, 'scripts/tauri-mock/index.js'), 'utf8');
      // 放在 body 内：不能把大段测试脚本插到 charset 前，导致浏览器把中文按其他编码解析。
      return html.replace(/<body([^>]*)>/, (_, attributes) => `<body${attributes}><script>${script}</script>`);
    },
  };
}

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), tauriMock()],
  // 字体包使用 import.meta.url 定位本地资源；预打包会把相对路径移到 .vite。
  optimizeDeps: { exclude: ['@docx-editor.dev/fonts', '@docx-editor.dev/core'] },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Redirect next-intl imports to our i18next compatibility layer
      'next-intl': path.resolve(__dirname, './src/i18n/compat-next-intl.ts'),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5173,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}));
