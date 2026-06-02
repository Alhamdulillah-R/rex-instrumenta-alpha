import { ref, shallowRef, computed } from 'vue'
import { parseJson, type ParseError } from '../core/model'
import type { FlatTree } from '../core/types'
import { computeStats, type JsonStats } from '../core/stats'
import { search, type SearchOptions } from '../core/search'
import { searchPaths } from '../core/pathSearch'

export type SearchMode = 'text' | 'path'

/**
 * useJsonDocument 管单文档查看器的全部状态: 原文 / 解析树 / 解析错误 / 统计 / 搜索.
 * 把逻辑从 ParsePane.vue 抽出来, 组件只剩模板 + 接线.
 */
export function useJsonDocument() {
  const rawText = ref('')
  const tree = shallowRef<FlatTree | null>(null)
  const parseError = ref<ParseError | null>(null)
  const stats = shallowRef<JsonStats | null>(null)

  const searchQuery = ref('')
  const searchMode = ref<SearchMode>('text')
  const searchOptions = ref<SearchOptions>({ caseSensitive: false, keys: true, values: true })
  const matches = shallowRef<Int32Array>(new Int32Array(0))
  const activeMatch = ref(-1)
  const matchCount = computed(() => matches.value.length)

  /**
   * parse 解析文本. 空输入清空状态; 出错记 parseError 并清树; 成功重建树 + 统计 + 重搜.
   */
  function parse(text: string): void {
    rawText.value = text
    if (text.trim() === '') {
      reset()
      return
    }

    const r = parseJson(text)
    if (r.error) {
      parseError.value = r.error
      tree.value = null
      stats.value = null
      clearSearch()
      return
    }

    parseError.value = null
    tree.value = r.tree
    stats.value = computeStats(r.tree!, text)
    runSearch()
  }

  function reset(): void {
    tree.value = null
    parseError.value = null
    stats.value = null
    clearSearch()
  }

  function runSearch(): void {
    if (!tree.value || searchQuery.value === '') {
      clearSearch()
      return
    }
    // 文本模式搜 key/value 文本; 路径模式按 SQL-LIKE 匹配节点路径($.a[%].b)
    const hits =
      searchMode.value === 'path'
        ? searchPaths(tree.value, searchQuery.value)
        : search(tree.value, searchQuery.value, searchOptions.value).matches
    matches.value = hits
    activeMatch.value = hits.length > 0 ? 0 : -1
  }

  // searchByPath 由"同结构 N 处"chip 调: 切到路径模式 + 设模式串 + 立即搜.
  function searchByPath(pattern: string): void {
    searchMode.value = 'path'
    searchQuery.value = pattern
    runSearch()
  }

  function clearSearch(): void {
    matches.value = new Int32Array(0)
    activeMatch.value = -1
  }

  function nextMatch(): void {
    if (matches.value.length > 0) {
      activeMatch.value = (activeMatch.value + 1) % matches.value.length
    }
  }

  function prevMatch(): void {
    if (matches.value.length > 0) {
      activeMatch.value = (activeMatch.value - 1 + matches.value.length) % matches.value.length
    }
  }

  return {
    rawText,
    tree,
    parseError,
    stats,
    searchQuery,
    searchMode,
    searchOptions,
    matches,
    activeMatch,
    matchCount,
    parse,
    runSearch,
    searchByPath,
    nextMatch,
    prevMatch,
    clearSearch,
  }
}
