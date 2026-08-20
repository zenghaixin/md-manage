import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  optimizeDeps: {
    include: ['segmentit'],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    // API 会写入这些运行时文件；若不忽略，Vite 会整页 reload，
    // 表现为「备注刚打上，1–2 秒后页面刷新，效果全没」。
    watch: {
      ignored: [
        '**/md/**',
        '**/glossary.json',
        '**/term-glossary/data/**',
        '**/.app-config.json',
        '**/.tabs.json',
        path.resolve(rootDir, 'md'),
        path.resolve(rootDir, '.app-config.json'),
        path.resolve(
          rootDir,
          'src/editor/extensions/term-glossary/data',
        ),
      ],
    },
  },
})
