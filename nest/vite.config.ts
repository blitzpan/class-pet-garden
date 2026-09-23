import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
      '/pet-garden/api': { target: 'http://localhost:3002', changeOrigin: true },
      // 宠物图片复用教师端静态资源（admin 前端 dev 服务在 3001 提供 /pets）
      '/pets': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
