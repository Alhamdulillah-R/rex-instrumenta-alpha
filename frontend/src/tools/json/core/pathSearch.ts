import { type FlatTree } from './types'
import { pathOf } from './model'

/**
 * likeToRegExp 把路径通配模式编译成 RegExp:
 *   % → 单个路径 token 内的任意串(不跨 . [ ]), _ → token 内单字符.
 * 关键: % 不跨路径分隔符 —— $.a[%] 只命中 a[0]/a[1]/a[2], 不会把 $.a[2].m[0] 这类深层也吞进来.
 * 其余字符(含 . [ ] $ 等正则元字符)按字面转义.
 * 例: $.tools[%].features → /^\$\.tools\[[^.[\]]*\]\.features$/
 */
export function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = escaped.replace(/%/g, '[^.\\[\\]]*').replace(/_/g, '[^.\\[\\]]')
  return new RegExp('^' + body + '$')
}

/**
 * searchPaths 按 SQL-LIKE 路径模式匹配节点, 返回命中 id(文档序).
 * 对每个节点现算 pathOf 再匹配 —— 路径搜索是按需触发, O(n·路径长) 可接受.
 * @param tree 展平模型
 * @param pattern 路径模式(支持 % / _)
 * @return 命中节点 id 列表
 */
export function searchPaths(tree: FlatTree, pattern: string): Int32Array {
  if (pattern === '') return new Int32Array(0)
  const re = likeToRegExp(pattern)
  const buf = new Int32Array(tree.count)
  let n = 0
  for (let i = 0; i < tree.count; i++) {
    if (re.test(pathOf(tree, i))) buf[n++] = i
  }
  return buf.slice(0, n)
}

/**
 * structuralPattern 把路径里的数组下标 [N] 归一成 [%], 用于"同结构位置"匹配.
 * 例: $.tools[0].features → $.tools[%].features
 */
export function structuralPattern(path: string): string {
  return path.replace(/\[\d+\]/g, '[%]')
}

/**
 * countStructural 统计与 nodeId 同结构(数组下标归一)的节点数. 与按 structuralPattern
 * 跑 searchPaths 的命中数一致, 保证 selbar 计数与点开后高亮的数量对得上.
 */
export function countStructural(tree: FlatTree, nodeId: number): number {
  return searchPaths(tree, structuralPattern(pathOf(tree, nodeId))).length
}
