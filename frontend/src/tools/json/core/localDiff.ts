// 浏览器预览用的本地 fallback diff —— 与 Go internal/tools/jsontool 的算法对齐
// (含数组主键/值匹配), 但 JS number 精度受限, 仅供预览; 桌面端始终走 Go 后端.
//
// 抽到 core/(不依赖 @bindings)是为了能在 vitest 里直接测匹配逻辑.
import type { DiffResult, DiffRow, DiffStats, DiffStatus } from './diff'

// DiffOpts 控制数组对齐: arrayMode "index" 严格按下标; 其它(默认)智能匹配.
// arrayKey 指定对象主键字段, 空则自动探测.
export interface DiffOpts {
  arrayMode: 'key' | 'index'
  arrayKey: string
}

// 自动探测主键的候选字段(按优先级), 与 Go 端一致.
const KEY_CANDIDATES = ['id', '_id', 'uuid', 'guid', 'key', 'name', 'code', 'slug']

function emptyStats(): DiffStats {
  return { total: 0, same: 0, changed: 0, added: 0, removed: 0 }
}

/**
 * localDiff 解析两份文本并产出展平 diff(浏览器预览用).
 * @param leftText  左侧 JSON 文本
 * @param rightText 右侧 JSON 文本
 * @param opts      数组对齐选项
 */
export function localDiff(leftText: string, rightText: string, opts: DiffOpts): DiffResult {
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
  walk('$', 'root', 0, lv, rv, true, true, rows, opts)
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
  opts: DiffOpts,
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
    return walkObject(path, key, depth, l as Record<string, unknown>, r as Record<string, unknown>, out, opts)
  }
  if (lKind === 'array') {
    return walkArray(path, key, depth, l as unknown[], r as unknown[], out, opts)
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
  opts: DiffOpts,
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
    const childSame = walk(childPath, k, depth + 1, l[k], r[k], lp, rp, out, opts)
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
  opts: DiffOpts,
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

  let allSame: boolean
  let count: number
  if (opts.arrayMode === 'index') {
    const max = Math.max(l.length, r.length)
    allSame = l.length === r.length
    for (let i = 0; i < max; i++) {
      const childSame = walk(`${path}[${i}]`, `[${i}]`, depth + 1, l[i], r[i], i < l.length, i < r.length, out, opts)
      if (!childSame) allSame = false
    }
    count = max
  } else {
    const slots = alignArray(l, r, opts)
    allSame = true
    for (const s of slots) {
      const childSame = walk(`${path}${s.childKey}`, s.childKey, depth + 1, s.l, s.r, s.lp, s.rp, out, opts)
      if (!childSame) allSame = false
    }
    count = slots.length
  }

  const head = out[headIdx]
  head.childCount = count
  head.status = allSame ? 'same' : 'changed'
  return allSame
}

interface Slot {
  l: unknown
  r: unknown
  lp: boolean
  rp: boolean
  childKey: string
}

/**
 * alignArray 把两数组对齐成有序槽位: 先对象按主键配对, 再剩余元素按整体值相等配对,
 * 配不上的左 removed / 右 added. child key 有主键用 [字段=值], 否则 [序号].
 */
function alignArray(la: unknown[], ra: unknown[], opts: DiffOpts): Slot[] {
  // 指定主键(可为嵌套路径)只在两侧都有元素能解析它时生效; 否则回退自动探测.
  let kf = opts.arrayKey
  if (!kf || !keyApplies(la, kf) || !keyApplies(ra, kf)) kf = detectKey(la, ra)

  const usedR = new Array<boolean>(ra.length).fill(false)
  const slots: Slot[] = []
  const leftRest: number[] = []
  let seq = 0
  const slotKey = (v: unknown): string => {
    if (kf) {
      const kv = keyVal(v, kf)
      if (kv) return kv.childKey
    }
    return `[${seq++}]`
  }

  if (kf) {
    const rByKey = new Map<string, number[]>()
    ra.forEach((rv, j) => {
      const kv = keyVal(rv, kf)
      if (kv) {
        const q = rByKey.get(kv.canon) ?? []
        q.push(j)
        rByKey.set(kv.canon, q)
      }
    })
    la.forEach((lv, i) => {
      const kv = keyVal(lv, kf)
      if (!kv) {
        leftRest.push(i)
        return
      }
      const q = rByKey.get(kv.canon)
      if (!q || !q.length) {
        leftRest.push(i)
        return
      }
      const j = q.shift() as number
      usedR[j] = true
      slots.push({ l: lv, r: ra[j], lp: true, rp: true, childKey: kv.childKey })
    })
  } else {
    la.forEach((_, i) => leftRest.push(i))
  }

  const rightRest: number[] = []
  ra.forEach((_, j) => {
    if (!usedR[j]) rightRest.push(j)
  })

  // 剩余元素按整体值相等配对(标量列表 / 无主键对象)
  const usedRR = new Array<boolean>(rightRest.length).fill(false)
  for (const li of leftRest) {
    let matched = -1
    for (let ri = 0; ri < rightRest.length; ri++) {
      if (!usedRR[ri] && valueEqual(la[li], ra[rightRest[ri]])) {
        matched = ri
        break
      }
    }
    if (matched >= 0) {
      usedRR[matched] = true
      slots.push({ l: la[li], r: ra[rightRest[matched]], lp: true, rp: true, childKey: slotKey(la[li]) })
    } else {
      slots.push({ l: la[li], r: undefined, lp: true, rp: false, childKey: slotKey(la[li]) })
    }
  }
  rightRest.forEach((rj, ri) => {
    if (usedRR[ri]) return
    slots.push({ l: undefined, r: ra[rj], lp: false, rp: true, childKey: slotKey(ra[rj]) })
  })

  return slots
}

// detectKey 在候选字段里挑一个能当主键的: 两侧都是非空对象数组且该字段都存在并取值唯一.
function detectKey(la: unknown[], ra: unknown[]): string {
  if (!la.length || !ra.length || !allObjects(la) || !allObjects(ra)) return ''
  for (const c of KEY_CANDIDATES) {
    if (uniqueKey(la, c) && uniqueKey(ra, c)) return c
  }
  return ''
}

function allObjects(a: unknown[]): boolean {
  return a.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))
}

function uniqueKey(a: unknown[], field: string): boolean {
  const seen = new Set<string>()
  for (const v of a) {
    const kv = keyVal(v, field)
    if (!kv) return false
    if (seen.has(kv.canon)) return false
    seen.add(kv.canon)
  }
  return true
}

// keyApplies 报告主键 key 是否"相关"(至少一个元素能解析出它).
function keyApplies(a: unknown[], key: string): boolean {
  return a.some((v) => keyVal(v, key) !== null)
}

// keyVal 取对象在主键 key 处的值. key 可为字段(id)或嵌套路径(fromSegments.flightNo /
// fromSegments[0].flightNo / fromSegments[*].flightNo). 返回规范化匹配串 + 展示 child key.
function keyVal(v: unknown, key: string): { canon: string; childKey: string } | null {
  const r = resolveKeyPath(v, key)
  if (!r || !r.leaves.length) return null
  const canon: string[] = []
  const disp: string[] = []
  for (const lf of r.leaves) {
    const s = scalarKey(lf)
    if (!s) return null
    canon.push(s.canon)
    disp.push(s.disp)
  }
  return { canon: canon.join(String.fromCharCode(31)), childKey: `[${r.lastField}=${disp.join('+')}]` }
}

function scalarKey(v: unknown): { canon: string; disp: string } | null {
  if (typeof v === 'string') return { canon: 's:' + v, disp: JSON.stringify(v) }
  if (typeof v === 'number') return { canon: 'n:' + String(v), disp: String(v) }
  if (typeof v === 'boolean') return { canon: 'b:' + String(v), disp: String(v) }
  return null
}

interface PathSeg {
  field: string
  mode: 0 | 1 | 2 // 0 普通字段, 1 下标 [n], 2 通配 [*]
  index: number
}

// parsePath 解析主键路径成段. 容忍前导 $ / . ; 段形如 name / name[0] / name[*].
function parsePath(key: string): PathSeg[] | null {
  let s = key
  if (s.startsWith('$')) s = s.slice(1)
  if (s.startsWith('.')) s = s.slice(1)
  if (!s) return null
  const segs: PathSeg[] = []
  for (const p of s.split('.')) {
    const seg: PathSeg = { field: p, mode: 0, index: 0 }
    const i = p.indexOf('[')
    if (i >= 0) {
      if (!p.endsWith(']')) return null
      seg.field = p.slice(0, i)
      const inner = p.slice(i + 1, -1)
      if (inner === '*') seg.mode = 2
      else {
        const n = Number(inner)
        if (!Number.isInteger(n) || n < 0) return null
        seg.mode = 1
        seg.index = n
      }
    }
    if (!seg.field) return null
    segs.push(seg)
  }
  return segs
}

// resolveKeyPath 沿路径取叶子. 字段访问遇数组隐式 map 到各元素(让 fromSegments.flightNo
// 直接拿到所有段的 flightNo); [n] 取指定段, [*] 展开全部段.
function resolveKeyPath(v: unknown, key: string): { leaves: unknown[]; lastField: string } | null {
  const segs = parsePath(key)
  if (!segs) return null
  let current: unknown[] = [v]
  for (const seg of segs) {
    const afterField: unknown[] = []
    for (const cur of current) {
      if (Array.isArray(cur)) {
        for (const el of cur) {
          if (el !== null && typeof el === 'object' && !Array.isArray(el)) {
            const m = el as Record<string, unknown>
            if (Object.prototype.hasOwnProperty.call(m, seg.field)) afterField.push(m[seg.field])
          }
        }
      } else if (cur !== null && typeof cur === 'object') {
        const m = cur as Record<string, unknown>
        if (Object.prototype.hasOwnProperty.call(m, seg.field)) afterField.push(m[seg.field])
      }
    }
    current = afterField
    if (seg.mode === 1) {
      const next: unknown[] = []
      for (const cur of current) if (Array.isArray(cur) && seg.index < cur.length) next.push(cur[seg.index])
      current = next
    } else if (seg.mode === 2) {
      const next: unknown[] = []
      for (const cur of current) if (Array.isArray(cur)) next.push(...cur)
      current = next
    }
  }
  if (!current.length) return null
  return { leaves: current, lastField: segs[segs.length - 1].field }
}

// valueEqual 深度比较两个 JSON 值是否完全相等(标量按字符串化比, 与逐层 diff 一致).
function valueEqual(a: unknown, b: unknown): boolean {
  const ak = kindOf(a)
  const bk = kindOf(b)
  if (ak !== bk) return false
  if (ak === 'object') {
    const am = a as Record<string, unknown>
    const bm = b as Record<string, unknown>
    const ak2 = Object.keys(am)
    if (ak2.length !== Object.keys(bm).length) return false
    for (const k of ak2) {
      if (!Object.prototype.hasOwnProperty.call(bm, k) || !valueEqual(am[k], bm[k])) return false
    }
    return true
  }
  if (ak === 'array') {
    const aa = a as unknown[]
    const ba = b as unknown[]
    if (aa.length !== ba.length) return false
    for (let i = 0; i < aa.length; i++) if (!valueEqual(aa[i], ba[i])) return false
    return true
  }
  return stringify(a) === stringify(b)
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
      emitOne(`${path}[${i}]`, `[${i}]`, depth + 1, arr[i], status, out)
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
