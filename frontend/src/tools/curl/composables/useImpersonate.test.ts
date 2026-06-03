import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useImpersonate } from './useImpersonate'

// node 环境无 localStorage, 用内存版打桩(对齐 localDocs.test)
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
globalThis.localStorage = new MemStorage() as unknown as Storage

describe('useImpersonate', () => {
  beforeEach(() => localStorage.clear())

  it('逐字输入的中间态不累加自定义; commit 确认才累加', async () => {
    const { current, custom, commit } = useImpersonate()
    // 模拟 combobox 输入 "chrome232" 时 current 逐字变化
    current.value = 'chrome2'
    await nextTick()
    current.value = 'chrome23'
    await nextTick()
    current.value = 'chrome232'
    await nextTick()
    // 输入过程中(未确认)不应有任何中间态进 custom
    expect(custom.value).not.toContain('chrome2')
    expect(custom.value).not.toContain('chrome23')
    expect(custom.value).not.toContain('chrome232')
    // 失焦/回车确认 → 只累加最终值
    commit()
    expect(custom.value).toContain('chrome232')
    expect(custom.value).not.toContain('chrome2')
    expect(custom.value).not.toContain('chrome23')
  })

  it('内置版本不进 custom; 选择即记忆 current', async () => {
    const { current, custom, commit } = useImpersonate()
    current.value = 'chrome136'
    await nextTick()
    commit()
    expect(custom.value).not.toContain('chrome136')
    expect(JSON.parse(localStorage.getItem('ria-curl-impersonate')!).current).toBe('chrome136')
  })

  it('commit 去重: 已存的自定义不重复累加', () => {
    const { current, custom, commit } = useImpersonate()
    current.value = 'chrome999'
    commit()
    current.value = 'chrome999'
    commit()
    expect(custom.value.filter((x) => x === 'chrome999').length).toBe(1)
  })

  it('removeCustom 删除自定义项 + isCustom 判定', () => {
    const { current, custom, commit, removeCustom, isCustom } = useImpersonate()
    current.value = 'chrome999'
    commit()
    expect(isCustom('chrome999')).toBe(true)
    expect(isCustom('chrome136')).toBe(false)
    removeCustom('chrome999')
    expect(custom.value).not.toContain('chrome999')
  })

  it('options = 自定义在前 + 内置, 去重', () => {
    const { current, options, commit } = useImpersonate()
    current.value = 'mycustom'
    commit()
    expect(options.value[0]).toBe('mycustom')
    expect(options.value).toContain('chrome136')
    expect(options.value.filter((x) => x === 'chrome136').length).toBe(1)
  })
})
