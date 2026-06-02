import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

// Vuetify autoImport 按需引入组件 + tree-shake, 省去手动注册的样板.
// '@' 别名指向 src, 让 tools/ 深层目录互相 import 不写一长串 ../../.
export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@bindings': fileURLToPath(new URL('./wailsjs', import.meta.url)),
    },
  },
  // Wails 把前端当静态资源 embed, 用相对 base 保证打包后路径正确
  base: './',
  server: {
    port: 5180,
    strictPort: true,
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1500,
  },
})
