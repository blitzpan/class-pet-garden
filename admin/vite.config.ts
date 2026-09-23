import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const apiPort = Number(process.env.API_PORT || 3002)

export default defineConfig({
  plugins: [vue()],
  base: '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    },
    // 开发模式下确保 vue 只被预构建一份，避免 vue-router/pinia 与 app 各自拿到
    // 不同的 vue 实例导致 provide/inject 的 Symbol 对不上（表现为 <RouterView> 白屏）。
    dedupe: ['vue']
  },
  server: {
    port: 3001,
    host: true,
    proxy: {
      '/pet-garden/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pet-garden/, '')
      }
    },
    // 静态资源缓存配置
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  },
  // 构建配置 - 静态资源添加 hash
  build: {
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.')
          const ext = info[info.length - 1]
          if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(assetInfo.name)) {
            return `assets/images/[name]-[hash][extname]`
          }
          return `assets/[name]-[hash][extname]`
        }
      }
    }
  }
})