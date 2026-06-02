import type { ToolDef } from '@/shell/tool'

// JSON 工具注册声明. 视图懒加载, 平台启动不为单个工具买单.
export const JSON_TOOL: ToolDef = {
  id: 'json',
  title: 'JSON 工具',
  icon: 'mdi-code-json',
  path: '/json',
  component: () => import('./JsonToolView.vue'),
}
