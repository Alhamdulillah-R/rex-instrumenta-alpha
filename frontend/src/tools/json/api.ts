import { Diff } from '@bindings/go/jsontool/Service'
import { isWails } from '@/platform/native'
import type { DiffResult, DiffRow, DiffStats, DiffStatus } from './core/diff'

/**
 * diffJson 算两份 JSON 的展平 diff. 桌面端走 Go 后端(大整数精度无损);
 * 浏览器预览走本地 TS fallback(算法对齐, JS number 精度受限, 仅供预览).
 * @param left  左侧 JSON 文本
 * @param right 右侧 JSON 文本
 * @return 展平 diff 结果
 */
export async function diffJson(left: string, right: string): Promise<DiffResult> {
  if (!isWails()) return localDiff(left, right)
  return (await Diff(left, right)) as unknown as DiffResult
}

// ─── 浏览器预览用的本地 fallback diff ───

function emptyStats(): DiffStats {
  return { total: 0, same: 0, changed: 0, added: 0, removed: 0 }
}

function localDiff(leftText: string, rightText: string): DiffResult {
  let lv: unknown, rv: unknown
  try {
    lv = JSON.parse(leftText)
  } catch (e) {
    return { rows: [], stats: emptyStats(), error: '左侧 JSON 解析失败: ' + (e as Error).message }
  }
  try {
    rv = JSON.parse(rightText)
  } catch (e) {
    return { rows: [], stats: emptyStats(), error: '右侧 JSON 解析失败: ' + (e as Error).message }
  }

  const rows: DiffRow[] = []
  walk('$', 'root', 0, lv, rv, true, true, rows)
  return { rows, stats: computeStats(rows) }
}

function walk(
  path: string,
  key: string,
  depth: number,
  l: unknown,
  r: unknown,
  lPresent: boolean,
  rPresent: boolean,
  out: DiffRow[],
): boolean {
  if (lPresent && !rPresent) {
    emitOne(path, key, depth, l, 'removed', out)
    return false
  }
  if (!lPresent && rPresent) {
    emitOne(path, key, depth, r, 'added', out)
    return false
  }
  const lKind = kindOf(l)
  const rKind = kindOf(r)
  if (lKind !== rKind) {
    out.push({
      path,
      key,
      depth,
      status: 'changed',
      kind: lKind,
      left: stringify(l),
      right: stringify(r),
      hasChildren: false,
      childCount: 0,
    })
    return false
  }
  if (lKind === 'object') {
    return walkObject(path, key, depth, l as Record<string, unknown>, r as Record<string, unknown>, out)
  }
  if (lKind === 'array') {
    return walkArray(path, key, depth, l as unknown[], r as unknown[], out)
  }
  // 标量: 字符串化后逐字符对比, 容忍 number 表示差异
  const ls = stringify(l)
  const rs = stringify(r)
  const same = ls === rs
  out.push({
    path,
    key,
    depth,
    status: same ? 'same' : 'changed',
    kind: lKind,
    left: ls,
    right: rs,
    hasChildren: false,
    childCount: 0,
  })
  return same
}

function walkObject(
  path: string,
  key: string,
  depth: number,
  l: Record<string, unknown>,
  r: Record<string, unknown>,
  out: DiffRow[],
): boolean {
  const headIdx = out.length
  out.push({
    path,
    key,
    depth,
    status: 'same',
    kind: 'object',
    left: '',
    right: '',
    hasChildren: true,
    childCount: 0,
  })
  // 合并所有 key, 保持左侧序在前, 再追加仅右侧的
  const seen = new Set<string>()
  const keys: string[] = []
  for (const k of Object.keys(l)) {
    keys.push(k)
    seen.add(k)
  }
  for (const k of Object.keys(r)) if (!seen.has(k)) keys.push(k)

  let allSame = true
  let count = 0
  for (const k of keys) {
    const lp = Object.prototype.hasOwnProperty.call(l, k)
    const rp = Object.prototype.hasOwnProperty.call(r, k)
    const childPath = `${path}.${k}`
    const childSame = walk(childPath, k, depth + 1, l[k], r[k], lp, rp, out)
    if (!childSame) allSame = false
    count++
  }
  const head = out[headIdx]
  head.childCount = count
  head.status = allSame ? 'same' : 'changed'
  return allSame
}

function walkArray(
  path: string,
  key: string,
  depth: number,
  l: unknown[],
  r: unknown[],
  out: DiffRow[],
): boolean {
  const headIdx = out.length
  out.push({
    path,
    key,
    depth,
    status: 'same',
    kind: 'array',
    left: '',
    right: '',
    hasChildren: true,
    childCount: 0,
  })
  const max = Math.max(l.length, r.length)
  let allSame = l.length === r.length
  for (let i = 0; i < max; i++) {
    const lp = i < l.length
    const rp = i < r.length
    const childSame = walk(`${path}[${i}]`, String(i), depth + 1, l[i], r[i], lp, rp, out)
    if (!childSame) allSame = false
  }
  const head = out[headIdx]
  head.childCount = max
  head.status = allSame ? 'same' : 'changed'
  return allSame
}

function emitOne(path: string, key: string, depth: number, v: unknown, status: DiffStatus, out: DiffRow[]) {
  const k = kindOf(v)
  if (k === 'object') {
    const obj = v as Record<string, unknown>
    out.push({
      path,
      key,
      depth,
      status,
      kind: 'object',
      left: status === 'removed' ? stringify(v) : '',
      right: status === 'added' ? stringify(v) : '',
      hasChildren: true,
      childCount: Object.keys(obj).length,
    })
    for (const ck of Object.keys(obj)) {
      emitOne(`${path}.${ck}`, ck, depth + 1, obj[ck], status, out)
    }
    return
  }
  if (k === 'array') {
    const arr = v as unknown[]
    out.push({
      path,
      key,
      depth,
      status,
      kind: 'array',
      left: status === 'removed' ? stringify(v) : '',
      right: status === 'added' ? stringify(v) : '',
      hasChildren: true,
      childCount: arr.length,
    })
    for (let i = 0; i < arr.length; i++) {
      emitOne(`${path}[${i}]`, String(i), depth + 1, arr[i], status, out)
    }
    return
  }
  const s = stringify(v)
  out.push({
    path,
    key,
    depth,
    status,
    kind: k,
    left: status === 'removed' ? s : '',
    right: status === 'added' ? s : '',
    hasChildren: false,
    childCount: 0,
  })
}

function kindOf(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function stringify(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function computeStats(rows: DiffRow[]): DiffStats {
  const s = emptyStats()
  s.total = rows.length
  for (const r of rows) s[r.status]++
  return s
}
