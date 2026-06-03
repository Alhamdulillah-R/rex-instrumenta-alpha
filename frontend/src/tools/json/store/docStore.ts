import { List, Get, Save, Rename, Remove, SetPin, RemoveMany } from '@bindings/go/jsonstore/Service'
import { isWails } from '@/platform/native'
import type { JsonDoc, DocMutation } from './types'
import {
  localList,
  localGet,
  localSave,
  localRename,
  localRemove,
  localSetPin,
  localRemoveMany,
} from './localDocs'

export type { JsonDoc, DocMutation }

/**
 * docStore 是 JSON 文档持久化的统一入口. 桌面端走 Go 侧落盘(切换/关闭/重启不丢,
 * 无 localStorage 配额上限); 浏览器预览无 Go 后端时回退 localStorage.
 */

export async function listDocs(): Promise<JsonDoc[]> {
  if (!isWails()) return localList()
  return (await List()) as JsonDoc[]
}

export async function getDoc(id: string): Promise<{ doc: JsonDoc; content: string } | null> {
  if (!isWails()) return localGet(id)

  const p = await Get(id)
  if (p.error) {
    console.warn('[jsonstore] get:', p.error)
    return null
  }
  if (!p.found) return null
  return { doc: p.doc as JsonDoc, content: p.content }
}

/**
 * saveDoc 新建或更新文档. id 为空走新建; name 为空时新建自动命名、更新保留原名.
 */
export async function saveDoc(id: string, name: string, content: string): Promise<DocMutation> {
  if (!isWails()) return localSave(id, name, content)

  const r = await Save(id, name, content)
  return { docs: (r.docs ?? []) as JsonDoc[], id: r.id, error: r.error }
}

export async function renameDoc(id: string, name: string): Promise<DocMutation> {
  if (!isWails()) return localRename(id, name)

  const r = await Rename(id, name)
  return { docs: (r.docs ?? []) as JsonDoc[], error: r.error }
}

export async function removeDoc(id: string): Promise<DocMutation> {
  if (!isWails()) return localRemove(id)

  const r = await Remove(id)
  return { docs: (r.docs ?? []) as JsonDoc[], error: r.error }
}

export async function setPinDoc(id: string, pinned: boolean): Promise<DocMutation> {
  if (!isWails()) return localSetPin(id, pinned)

  const r = await SetPin(id, pinned)
  return { docs: (r.docs ?? []) as JsonDoc[], error: r.error }
}

export async function removeManyDocs(ids: string[]): Promise<DocMutation> {
  if (!isWails()) return localRemoveMany(ids)

  const r = await RemoveMany(ids)
  return { docs: (r.docs ?? []) as JsonDoc[], error: r.error }
}
