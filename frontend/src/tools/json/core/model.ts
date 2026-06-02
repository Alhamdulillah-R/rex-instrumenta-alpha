import { Kind, type KindCode, type FlatTree } from './types'
import { looksLikePython, pythonToJsonText } from './pythonParse'

export interface ParseError {
  message: string
  line: number
  column: number
  position: number
}

export interface ParseResult {
  tree: FlatTree | null
  error: ParseError | null
}

/**
 * parseJson 解析文本并展平成 FlatTree. 解析失败时返回带行列定位的 ParseError.
 * 注意: JS 的 JSON.parse 把数字读成 float64, 超出安全整数范围的大整数会丢精度 —
 * 这是浏览器原生行为, 单文档查看器接受该语义(Go 侧 diff 用 UseNumber 保留原貌).
 * @param text JSON 文本
 * @return tree + error 二选一
 */
export function parseJson(text: string): ParseResult {
  try {
    return { tree: buildFlatTree(JSON.parse(text)), error: null }
  } catch (e) {
    // 标准 JSON 失败 + 看着像 Python(单引号 / True/False/None)→ 转成 JSON 再试
    if (looksLikePython(text)) {
      try {
        return { tree: buildFlatTree(JSON.parse(pythonToJsonText(text))), error: null }
      } catch {
        // 转换后仍失败, 报原始 JSON 错误更有意义
      }
    }
    return { tree: null, error: toParseError(e, text) }
  }
}

/**
 * buildFlatTree 先数一遍节点总数, 一次性分配 typed array, 再 DFS 回填.
 * 回填时回写 childCount 与 subtreeEnd(末位后代下一个下标), 供折叠跳子树.
 * @param root 已解析的 JSON 值
 * @return 展平模型
 */
export function buildFlatTree(root: unknown): FlatTree {
  const count = countNodes(root)
  const tree: FlatTree = {
    count,
    depth: new Int32Array(count),
    kind: new Uint8Array(count),
    parent: new Int32Array(count),
    childCount: new Int32Array(count),
    subtreeEnd: new Int32Array(count),
    arrayIndex: new Int32Array(count),
    keys: new Array<string | null>(count),
    values: new Array<unknown>(count),
  }

  new Builder(tree).visit(root, 0, -1, null, -1)

  return tree
}

function countNodes(v: unknown): number {
  let n = 1
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) n += countNodes(v[i])
  } else if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v as object)) n += countNodes((v as Record<string, unknown>)[k])
  }
  return n
}

// Builder 持有游标, DFS 逐节点占位 + 回填. 递归深度 = JSON 嵌套深度(有界), 安全.
class Builder {
  private cursor = 0

  constructor(private readonly t: FlatTree) {}

  visit(v: unknown, depth: number, parent: number, key: string | null, arrayIndex: number): number {
    const id = this.cursor++
    const t = this.t
    t.depth[id] = depth
    t.parent[id] = parent
    t.keys[id] = key
    t.arrayIndex[id] = arrayIndex
    t.values[id] = v

    const k = kindOf(v)
    t.kind[id] = k

    if (k === Kind.Array) {
      const arr = v as unknown[]
      t.childCount[id] = arr.length
      for (let i = 0; i < arr.length; i++) {
        this.visit(arr[i], depth + 1, id, null, i)
      }
    } else if (k === Kind.Object) {
      const obj = v as Record<string, unknown>
      const keys = Object.keys(obj)
      t.childCount[id] = keys.length
      for (let i = 0; i < keys.length; i++) {
        this.visit(obj[keys[i]], depth + 1, id, keys[i], -1)
      }
    } else {
      t.childCount[id] = 0
    }

    t.subtreeEnd[id] = this.cursor
    return id
  }
}

/**
 * kindOf 返回 JS 值对应的 KindCode.
 */
export function kindOf(v: unknown): KindCode {
  if (v === null) return Kind.Null
  switch (typeof v) {
    case 'string':
      return Kind.String
    case 'number':
      return Kind.Number
    case 'boolean':
      return Kind.Bool
    case 'object':
      return Array.isArray(v) ? Kind.Array : Kind.Object
    default:
      return Kind.Null
  }
}

/**
 * pathOf 回溯父链重建访问路径, 形如 $.a.b[0].c.
 * 合法标识符 key 用 .key, 含特殊字符的 key 用 ["..."], 数组元素用 [i].
 * @param tree 展平模型
 * @param id   目标节点
 * @return 路径字符串
 */
export function pathOf(tree: FlatTree, id: number): string {
  const segs: string[] = []
  let cur = id
  while (cur >= 0) {
    const p = tree.parent[cur]
    if (p < 0) {
      segs.push('$')
    } else if (tree.keys[cur] !== null) {
      segs.push(memberSeg(tree.keys[cur] as string))
    } else {
      segs.push('[' + tree.arrayIndex[cur] + ']')
    }
    cur = p
  }
  return segs.reverse().join('')
}

function memberSeg(key: string): string {
  return isIdent(key) ? '.' + key : '[' + JSON.stringify(key) + ']'
}

// 首字符为字母/下划线/$, 后续可含数字; \p{L} 覆盖 CJK 等 unicode 字母,
// 含空格/点/括号等特殊字符的 key 不匹配, 退回 ["..."] 形式.
const IDENT_RE = /^[\p{L}_$][\p{L}\p{N}_$]*$/u

function isIdent(s: string): boolean {
  return IDENT_RE.test(s)
}

// toParseError 尽力从引擎错误文案里提取定位. 不同 V8 版本文案不一: 老版含
// "at position N", 部分含 "line X column Y", 新版可能两者都没有 — 取不到就
// line/col = 0(未知), UI 仍完整展示 message. 定位是 best-effort, 不保证每个引擎都有.
function toParseError(e: unknown, text: string): ParseError {
  const message = e instanceof Error ? e.message : String(e)

  const posMatch = message.match(/position (\d+)/)
  if (posMatch) {
    const position = Number(posMatch[1])
    const { line, column } = lineColAt(text, position)
    return { message, line, column, position }
  }

  const lcMatch = message.match(/line (\d+) column (\d+)/)
  if (lcMatch) {
    return { message, line: Number(lcMatch[1]), column: Number(lcMatch[2]), position: -1 }
  }

  return { message, line: 0, column: 0, position: -1 }
}

function lineColAt(text: string, pos: number): { line: number; column: number } {
  let line = 1
  let column = 1
  const end = Math.min(pos, text.length)
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { line, column }
}
