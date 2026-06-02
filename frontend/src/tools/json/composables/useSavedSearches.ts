import { ref } from 'vue'
import type { SearchMode } from './useJsonDocument'

export interface SavedSearch {
  query: string
  mode: SearchMode
  label?: string // 自定义短名(query 很长时改名用), 展示优先 label
}

const STORAGE_KEY = 'ria-saved-searches'

/**
 * useSavedSearches 保存/恢复搜索(含模式), localStorage 持久化. 以 tag chip 形式展示.
 */
export function useSavedSearches() {
  const saved = ref<SavedSearch[]>(load())

  function load(): SavedSearch[] {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.value))
  }

  /**
   * add 存一条搜索. 空串忽略; 同 query+mode 去重.
   * @return 是否新增(已存在返回 false)
   */
  function add(query: string, mode: SearchMode): boolean {
    const q = query.trim()
    if (!q) return false
    if (saved.value.some((s) => s.query === q && s.mode === mode)) return false
    saved.value.push({ query: q, mode })
    persist()
    return true
  }

  function remove(index: number) {
    saved.value.splice(index, 1)
    persist()
  }

  /**
   * rename 给第 index 条设短名. 空串清除短名(回落显示 query).
   */
  function rename(index: number, label: string) {
    const item = saved.value[index]
    if (!item) return
    const l = label.trim()
    if (l) item.label = l
    else delete item.label
    persist()
  }

  return { saved, add, remove, rename }
}
