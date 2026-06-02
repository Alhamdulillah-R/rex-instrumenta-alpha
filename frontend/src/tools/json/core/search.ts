import { Kind, type FlatTree } from './types'

export interface SearchOptions {
  caseSensitive: boolean
  keys: boolean    // 搜对象 key
  values: boolean  // 搜标量 value
}

export interface SearchResult {
  matches: Int32Array  // 命中节点 id, 文档序(升序), 供 next/prev 跳转
  query: string
}

export const EMPTY_RESULT: SearchResult = { matches: new Int32Array(0), query: '' }

/**
 * search 扫描全树, 收集 key / value 文本命中 query 的节点 id.
 * 空 query 返回空命中. 字符串按内容(不含外层引号)匹配, 更符合直觉.
 * @param tree 展平模型
 * @param query 查询串
 * @param opts 大小写 / 搜 key / 搜 value
 * @return 命中结果
 */
export function search(tree: FlatTree, query: string, opts: SearchOptions): SearchResult {
  if (query === '') return { matches: new Int32Array(0), query }

  const needle = opts.caseSensitive ? query : query.toLowerCase()
  const buf = new Int32Array(tree.count)
  let n = 0

  for (let i = 0; i < tree.count; i++) {
    if (matchesNode(tree, i, needle, opts)) buf[n++] = i
  }

  return { matches: buf.slice(0, n), query }
}

function matchesNode(tree: FlatTree, i: number, needle: string, opts: SearchOptions): boolean {
  if (opts.keys) {
    const key = tree.keys[i]
    if (key !== null && contains(key, needle, opts.caseSensitive)) return true
  }

  if (opts.values) {
    const k = tree.kind[i]
    // 只搜叶子标量文本; 容器自身没有可搜的 value
    if (k !== Kind.Object && k !== Kind.Array) {
      if (contains(scalarText(tree.values[i]), needle, opts.caseSensitive)) return true
    }
  }

  return false
}

function scalarText(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  return String(v)
}

function contains(hay: string, needle: string, caseSensitive: boolean): boolean {
  return caseSensitive ? hay.includes(needle) : hay.toLowerCase().includes(needle)
}
