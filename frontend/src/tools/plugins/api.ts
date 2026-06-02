import { Import, List, Remove } from '@bindings/go/plugintool/Service'
import { isWails } from '@/platform/native'
import type { plugintool } from '@bindings/go/models'

export type Plugin = plugintool.Plugin

export interface MutationResult {
  plugins: Plugin[]
  newId?: string
  error?: string
}

/**
 * listPlugins 取已导入插件. 浏览器预览(无 Go 后端)返回空.
 */
export async function listPlugins(): Promise<Plugin[]> {
  if (!isWails()) return []
  return List()
}

/**
 * importPlugin 弹目录对话框导入一个插件文件夹(拷进 app 自管目录).
 */
export async function importPlugin(): Promise<MutationResult> {
  if (!isWails()) return { plugins: [], error: '导入插件需要在桌面端(Wails)运行' }
  const r = await Import()
  return { plugins: r.plugins ?? [], newId: r.newId, error: r.error }
}

/**
 * removePlugin 删除插件(连同其文件夹).
 */
export async function removePlugin(id: string): Promise<MutationResult> {
  if (!isWails()) return { plugins: [], error: '需要桌面端' }
  const r = await Remove(id)
  return { plugins: r.plugins ?? [], error: r.error }
}

/**
 * pluginUrl 拼插件入口 URL(根相对 → Wails 资源源), iframe src 用.
 */
export function pluginUrl(p: Plugin): string {
  return `/plugins/${p.id}/${p.entry || 'index.html'}`
}
