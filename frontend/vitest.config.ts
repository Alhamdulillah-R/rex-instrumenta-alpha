import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// 核心逻辑是框架无关的纯 TS, 用 node 环境跑即可, 不拉 vue/vuetify 插件 → 更快.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
})
