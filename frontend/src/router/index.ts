import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { TOOLS } from '@/shell/registry'

// hash history — Wails 用 file:// embed 静态资源, hash 路由避免刷新 / 深链接 404.
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: TOOLS[0].path },
  ...TOOLS.map((t) => ({
    path: t.path,
    name: t.id,
    component: t.component,
  })),
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
