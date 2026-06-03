import type { ToolDef } from '@/shell/tool'

// cURL → curl_cffi 转换工具. 解析走 curlconverter 的 tree-sitter-bash wasm, 视图懒加载.
export const CURL_TOOL: ToolDef = {
  id: 'curl',
  title: 'cURL 转 cffi',
  icon: 'mdi-console-line',
  path: '/curl',
  component: () => import('./CurlToolView.vue'),
}
