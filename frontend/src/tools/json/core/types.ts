// JSON 节点种类码 — 存进 Uint8Array, 与 canvas 配色 / Go diff 的 kind 字段对齐.
export const Kind = {
  Object: 0,
  Array: 1,
  String: 2,
  Number: 3,
  Bool: 4,
  Null: 5,
} as const

export type KindCode = (typeof Kind)[keyof typeof Kind]

// 下标即 KindCode, KIND_NAME[code] 取种类名.
export const KIND_NAME = ['object', 'array', 'string', 'number', 'bool', 'null'] as const

/**
 * FlatTree 是把解析后的 JSON 做 pre-order DFS 展平的 Structure-of-Arrays 模型.
 * 用并列 typed array 而非对象数组 —— 百万节点下内存省 3~5x 且 cache 友好, canvas
 * 虚拟渲染只按下标取数. 折叠靠 subtreeEnd 实现 O(1) 跳过整棵子树.
 */
export interface FlatTree {
  count: number
  depth: Int32Array        // 嵌套层级, root = 0
  kind: Uint8Array         // KindCode
  parent: Int32Array       // 父节点 id, root = -1
  childCount: Int32Array   // 直接孩子数
  subtreeEnd: Int32Array   // 末位后代的下一个下标 (折叠时跳到这)
  arrayIndex: Int32Array   // 在父数组中的下标; 非数组元素 = -1
  keys: (string | null)[]  // 对象成员的 key; 数组元素 / root = null
  values: unknown[]        // 原始 JS 值引用 (复制子树 / 现算预览用)
}
