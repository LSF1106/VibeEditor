import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'), // @/ → src/ 路径别名
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 开发模式下将 /api 请求代理到 Express 后端 (localhost:3456)
      '/api': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
    },
  },
  base: './', // 相对路径基准（适配 Electron 的 file:// 协议）
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: (id: string) => id.includes('@modelcontextprotocol/sdk'),
    },
  },
  optimizeDeps: {
    include: ['monaco-editor'], // 预构建 monaco-editor 以加速冷启动
  },
  worker: {
    format: 'es', // Web Worker 使用 ES 模块格式
  },
});
