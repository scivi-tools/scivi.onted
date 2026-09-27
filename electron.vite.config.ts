import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

// The Electron-specific code lives in src/platform/electron; the editor UI in src/editor.
export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/platform/electron/main.ts') } },
    },
  },
  preload: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/platform/electron/preload.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/editor'),
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/editor/index.html') } },
    },
    plugins: [vue()],
  },
});
