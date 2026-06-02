import type { ToolDef } from './tool'
import { JSON_TOOL } from '@/tools/json'
import { PLUGINS_TOOL } from '@/tools/plugins'

/**
 * TOOLS 是平台的工具注册表 —— 唯一的扩展点. 往里 push 一个 ToolDef 即接入新工具,
 * 侧边导航与路由会自动包含它.
 */
export const TOOLS: ToolDef[] = [
  JSON_TOOL,
  PLUGINS_TOOL,
]
