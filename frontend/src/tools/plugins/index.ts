import type { ToolDef } from '@/shell/tool'

// 插件工具注册声明 —— 导入静态站文件夹作为插件, iframe 渲染.
export const PLUGINS_TOOL: ToolDef = {
  id: 'plugins',
  title: 'Plugins',
  icon: 'mdi-puzzle-outline',
  path: '/plugins',
  component: () => import('./PluginsView.vue'),
}
