import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 纯前端构建：所有计算均在浏览器内完成，不存在业务后端调用。
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
