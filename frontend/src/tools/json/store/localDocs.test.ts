import { describe, it, expect, beforeEach } from 'vitest'
import {
  localList,
  localGet,
  localSave,
  localRename,
  localRemove,
  localSetPin,
  localRemoveMany,
} from './localDocs'

// node 环境无 localStorage, 用内存版打桩(回退实现只依赖 getItem/setItem/removeItem).
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v)
  }
  removeItem(k: string): void {
    this.m.delete(k)
  }
  clear(): void {
    this.m.clear()
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage()
})

describe('localDocs 回退存储', () => {
  it('无名新建时自动命名', () => {
    const r = localSave('', '', '{"a":1}')
    expect(r.id).toBeTruthy()
    expect(r.docs).toHaveLength(1)
    expect(r.docs[0].name).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}:\d{2}导入的json$/)
  })

  it('正文经 get 往返一致', () => {
    const r = localSave('', 'alpha', '{"x":true}')
    const got = localGet(r.id as string)
    expect(got?.content).toBe('{"x":true}')
    expect(got?.doc.name).toBe('alpha')
  })

  it('更新不换 id, 空名保留原名', () => {
    const a = localSave('', 'doc', 'old')
    const b = localSave(a.id as string, '', 'new content')
    expect(b.id).toBe(a.id)
    expect(b.docs).toHaveLength(1)
    expect(b.docs[0].name).toBe('doc')
    expect(localGet(a.id as string)?.content).toBe('new content')
  })

  it('列表按最近更新倒序', async () => {
    const a = localSave('', 'a', '1')
    await new Promise((res) => setTimeout(res, 2))
    const b = localSave('', 'b', '2')
    const list = localList()
    expect(list[0].id).toBe(b.id)
    expect(list[1].id).toBe(a.id)
  })

  it('改名, 空名回落自动命名', () => {
    const a = localSave('', 'orig', 'x')
    localRename(a.id as string, 'renamed')
    expect(localGet(a.id as string)?.doc.name).toBe('renamed')
    localRename(a.id as string, '   ')
    expect(localGet(a.id as string)?.doc.name).toMatch(/导入的json$/)
  })

  it('删除文档连同正文', () => {
    const a = localSave('', 'gone', 'bye')
    const r = localRemove(a.id as string)
    expect(r.docs).toHaveLength(0)
    expect(localGet(a.id as string)).toBeNull()
  })

  it('删不存在的 id 报错', () => {
    const r = localRemove('nope')
    expect(r.error).toBeTruthy()
  })

  it('新建默认未固定', () => {
    const r = localSave('', 'x', '1')
    expect(r.docs[0].pinned).toBe(false)
  })

  it('固定的排在最前', async () => {
    const a = localSave('', 'a', '1')
    await new Promise((res) => setTimeout(res, 2))
    const b = localSave('', 'b', '2')
    expect(localList()[0].id).toBe(b.id)

    localSetPin(a.id as string, true)
    const list = localList()
    expect(list[0].id).toBe(a.id)
    expect(list[0].pinned).toBe(true)

    localSetPin(a.id as string, false)
    expect(localList()[0].id).toBe(b.id)
  })

  it('批量删除多篇', () => {
    const a = localSave('', 'a', '1')
    const b = localSave('', 'b', '2')
    const c = localSave('', 'c', '3')
    const r = localRemoveMany([a.id as string, c.id as string, 'nope'])
    expect(r.docs).toHaveLength(1)
    expect(r.docs[0].id).toBe(b.id)
  })
})
