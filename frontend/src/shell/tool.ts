import type { Component } from 'vue'

/**
 * ToolDef 是平台里一个工具的注册声明. 新增工具 = 在 tools/<name>/index.ts 导出一个
 * ToolDef, 再到 shell/registry.ts 注册进 TOOLS —— SideNav 与路由都由注册表驱动.
 */
export interface ToolDef {
  id: string
  title: string
  icon: string                          // mdi 图标名
  path: string                          // 路由路径
  component: () => Promise<Component>    // 懒加载视图
}
