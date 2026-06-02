import { type FlatTree } from './types'

/**
 * computeVisible 按当前折叠集算出可见行(packed 编码).
 *   - open / 叶子行 = 节点 id (>= 0)
 *   - 闭合行(展开容器子树结束处的 } / ])= ~id (< 0), 解码 `~v`
 * 展开的容器在所有子节点之后插一行闭合括号(像格式化 JSON); 折叠的容器内联显示 {3} 不插闭合行.
 * 折叠跳子树用 subtreeEnd O(1); 整体 ≤ O(可见行) 且只在折叠变更时跑, 不在滚动时跑.
 * @param tree      展平模型
 * @param collapsed 已折叠的容器节点 id 集合
 * @return packed 可见行列表(文档序)
 */
export function computeVisible(tree: FlatTree, collapsed: Set<number>): Int32Array {
  // 最坏每个节点都是容器 → open + close 两行, 预分配 2x
  const buf = new Int32Array(tree.count * 2)
  let n = 0
  // 待闭合容器栈: subtreeEnd 升序由嵌套保证, i 到达即插闭合行
  const closeEnds: number[] = []
  const closeIds: number[] = []

  let i = 0
  while (i < tree.count) {
    while (closeEnds.length > 0 && closeEnds[closeEnds.length - 1] === i) {
      closeEnds.pop()
      buf[n++] = ~(closeIds.pop() as number)
    }

    buf[n++] = i
    const hasChildren = tree.childCount[i] > 0
    if (hasChildren && collapsed.has(i)) {
      i = tree.subtreeEnd[i]
    } else if (hasChildren) {
      closeEnds.push(tree.subtreeEnd[i])
      closeIds.push(i)
      i++
    } else {
      i++
    }
  }

  while (closeIds.length > 0) {
    buf[n++] = ~(closeIds.pop() as number)
  }

  return buf.subarray(0, n)
}

/**
 * containersFromDepth 收集 depth >= minDepth 的所有容器 id, 给 collapseAll 用.
 * minDepth=1 时 root 保持展开, 只折叠它以下的容器.
 */
export function containersFromDepth(tree: FlatTree, minDepth: number): number[] {
  const out: number[] = []
  for (let i = 0; i < tree.count; i++) {
    if (tree.childCount[i] > 0 && tree.depth[i] >= minDepth) out.push(i)
  }
  return out
}

/**
 * ancestorsOf 返回 id 的所有祖先(不含自身), 从父到根. 给搜索命中"展开到可见"用.
 */
export function ancestorsOf(tree: FlatTree, id: number): number[] {
  const out: number[] = []
  let cur = tree.parent[id]
  while (cur >= 0) {
    out.push(cur)
    cur = tree.parent[cur]
  }
  return out
}

/**
 * revealAncestors 把 id 的所有祖先从折叠集移除, 保证该节点可见. 原地修改 collapsed.
 * @return 是否真的改动了折叠集(用于决定是否要重算 visible)
 */
export function revealAncestors(tree: FlatTree, collapsed: Set<number>, id: number): boolean {
  let changed = false
  let cur = tree.parent[id]
  while (cur >= 0) {
    if (collapsed.delete(cur)) changed = true
    cur = tree.parent[cur]
  }
  return changed
}
