import { Kind, type FlatTree } from './types'

export interface JsonStats {
  totalNodes: number
  objects: number
  arrays: number
  strings: number
  numbers: number
  booleans: number
  nulls: number
  keys: number       // 对象成员数(有 key 的节点)
  maxDepth: number
  maxArrayLen: number
  byteSize: number   // 原文 UTF-8 字节数
}

/**
 * computeStats 单遍扫描 typed array, 统计各类计数 / 最大深度 / 数组最长 / 字节大小.
 * @param tree 展平模型
 * @param text 原始 JSON 文本(算字节大小, 比逐节点估算更准)
 * @return 统计结果
 */
export function computeStats(tree: FlatTree, text: string): JsonStats {
  const s: JsonStats = {
    totalNodes: tree.count,
    objects: 0,
    arrays: 0,
    strings: 0,
    numbers: 0,
    booleans: 0,
    nulls: 0,
    keys: 0,
    maxDepth: 0,
    maxArrayLen: 0,
    byteSize: byteLength(text),
  }

  for (let i = 0; i < tree.count; i++) {
    switch (tree.kind[i]) {
      case Kind.Object:
        s.objects++
        break
      case Kind.Array:
        s.arrays++
        if (tree.childCount[i] > s.maxArrayLen) s.maxArrayLen = tree.childCount[i]
        break
      case Kind.String:
        s.strings++
        break
      case Kind.Number:
        s.numbers++
        break
      case Kind.Bool:
        s.booleans++
        break
      case Kind.Null:
        s.nulls++
        break
    }
    if (tree.keys[i] !== null) s.keys++
    if (tree.depth[i] > s.maxDepth) s.maxDepth = tree.depth[i]
  }

  return s
}

// byteLength 手算 UTF-8 字节数, 不分配整段 byte array, 大文本也不爆内存.
function byteLength(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) {
      bytes += 1
    } else if (c < 0x800) {
      bytes += 2
    } else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4 // 代理对, 一个 4 字节字符, 跳过低位代理
      i++
    } else {
      bytes += 3
    }
  }
  return bytes
}
