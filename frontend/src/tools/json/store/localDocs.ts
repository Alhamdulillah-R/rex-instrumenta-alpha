// JSON 文档存储的 localStorage 回退实现 —— 浏览器预览(无 Go 后端)时用.
// 桌面端走 Go 侧落盘(无配额上限); 这里整库一个 key, 仅作预览/测试用途.
import type { JsonDoc, DocMutation } from './types'
import { autoDocName, previewOf, uniqueName } from './docMeta'

const KEY = 'ria-json-docs'

// Stored 在元信息上多带正文(整库存一个 localStorage key).
interface Stored extends JsonDoc {
  content: string
}

function loadMap(): Record<string, Stored> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return v && typeof v === 'object' ? (v as Record<string, Stored>) : {}
  } catch {
    return {}
  }
}

function saveMap(map: Record<string, Stored>): void {
  localStorage.setItem(KEY, JSON.stringify(map))
}

function toMeta(s: Stored): JsonDoc {
  const { content, ...meta } = s
  void content
  return meta
}

function sortedMetas(map: Record<string, Stored>): JsonDoc[] {
  return Object.values(map)
    .map(toMeta)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
}

export function localList(): JsonDoc[] {
  return sortedMetas(loadMap())
}

export function localGet(id: string): { doc: JsonDoc; content: string } | null {
  const s = loadMap()[id]
  return s ? { doc: toMeta(s), content: s.content } : null
}

/**
 * localSave 新建或更新文档. id 命中已有则更新(空 name 保留原名); 否则新建,
 * 空 name 按 autoDocName 自动命名并去重.
 */
export function localSave(id: string, name: string, content: string): DocMutation {
  const map = loadMap()
  const now = Date.now()
  const trimmed = name.trim()

  const existing = map[id]
  if (id && existing) {
    map[id] = {
      ...existing,
      name: trimmed || existing.name,
      content,
      size: content.length,
      preview: previewOf(content),
      updatedAt: now,
    }
    saveMap(map)
    return { docs: sortedMetas(map), id }
  }

  const newId = crypto.randomUUID()
  const names = Object.values(map).map((d) => d.name)
  map[newId] = {
    id: newId,
    name: trimmed || uniqueName(names, autoDocName(new Date())),
    content,
    size: content.length,
    preview: previewOf(content),
    createdAt: now,
    updatedAt: now,
    pinned: false,
  }
  saveMap(map)
  return { docs: sortedMetas(map), id: newId }
}

export function localRename(id: string, name: string): DocMutation {
  const map = loadMap()
  if (!map[id]) return { docs: sortedMetas(map), error: '文档不存在' }

  const others = Object.values(map)
    .filter((d) => d.id !== id)
    .map((d) => d.name)
  map[id] = { ...map[id], name: name.trim() || uniqueName(others, autoDocName(new Date())) }

  saveMap(map)
  return { docs: sortedMetas(map) }
}

export function localRemove(id: string): DocMutation {
  const map = loadMap()
  if (!map[id]) return { docs: sortedMetas(map), error: '文档不存在' }

  delete map[id]
  saveMap(map)
  return { docs: sortedMetas(map) }
}

export function localSetPin(id: string, pinned: boolean): DocMutation {
  const map = loadMap()
  if (!map[id]) return { docs: sortedMetas(map), error: '文档不存在' }

  map[id] = { ...map[id], pinned }
  saveMap(map)
  return { docs: sortedMetas(map) }
}

export function localRemoveMany(ids: string[]): DocMutation {
  const map = loadMap()
  for (const id of ids) delete map[id]

  saveMap(map)
  return { docs: sortedMetas(map) }
}
