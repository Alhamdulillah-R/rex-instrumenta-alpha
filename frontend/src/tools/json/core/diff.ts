// TS 侧 diff 类型 — 与 Go internal/tools/jsontool 的 DiffRow/DiffStats 字段一一对应,
// 是 Go 后端 Diff 返回值经 Wails JSON 解码后的形状. canvas diff 渲染直接消费这些.

export type DiffStatus = 'same' | 'changed' | 'added' | 'removed'

export interface DiffRow {
  path: string
  key: string
  depth: number
  status: DiffStatus
  kind: string
  left: string
  right: string
  hasChildren: boolean
  childCount: number
}

export interface DiffStats {
  total: number
  same: number
  changed: number
  added: number
  removed: number
}

export interface DiffResult {
  rows: DiffRow[]
  stats: DiffStats
  error?: string
}
