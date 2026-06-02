import { describe, it, expect } from 'vitest'
import { parseJson, buildFlatTree, pathOf, kindOf } from './model'
import { Kind } from './types'

describe('buildFlatTree', () => {
  it('flattens a mixed object in pre-order with correct columns', () => {
    const t = buildFlatTree({ a: 1, b: [10, 20], c: { d: 'x' } })

    expect(t.count).toBe(7)
    expect(Array.from(t.depth)).toEqual([0, 1, 1, 2, 2, 1, 2])
    expect(Array.from(t.parent)).toEqual([-1, 0, 0, 2, 2, 0, 5])
    expect(Array.from(t.childCount)).toEqual([3, 0, 2, 0, 0, 1, 0])
    expect(Array.from(t.subtreeEnd)).toEqual([7, 2, 5, 4, 5, 7, 7])
    expect(t.keys).toEqual([null, 'a', 'b', null, null, 'c', 'd'])
    expect(Array.from(t.arrayIndex)).toEqual([-1, -1, -1, 0, 1, -1, -1])
    expect(Array.from(t.kind)).toEqual([
      Kind.Object, Kind.Number, Kind.Array, Kind.Number, Kind.Number, Kind.Object, Kind.String,
    ])
  })

  it('handles empty containers', () => {
    const t = buildFlatTree({ o: {}, a: [] })
    expect(t.count).toBe(3)
    expect(t.childCount[1]).toBe(0) // {}
    expect(t.childCount[2]).toBe(0) // []
    expect(t.subtreeEnd[1]).toBe(2)
    expect(t.subtreeEnd[2]).toBe(3)
  })

  it('handles scalar root', () => {
    const t = buildFlatTree(42)
    expect(t.count).toBe(1)
    expect(t.kind[0]).toBe(Kind.Number)
    expect(t.parent[0]).toBe(-1)
  })

  it('handles deep nesting (subtreeEnd stays consistent)', () => {
    const t = buildFlatTree({ a: { b: { c: { d: 1 } } } })
    expect(t.count).toBe(5)
    expect(t.subtreeEnd[0]).toBe(5)
    expect(t.depth[4]).toBe(4)
  })

  it('handles large arrays without losing nodes', () => {
    const big = Array.from({ length: 10000 }, (_, i) => i)
    const t = buildFlatTree(big)
    expect(t.count).toBe(10001)
    expect(t.childCount[0]).toBe(10000)
    expect(t.arrayIndex[10000]).toBe(9999)
  })
})

describe('pathOf', () => {
  const t = buildFlatTree({ a: 1, b: [10, 20], 'c d': { 'x.y': 2 } })

  it('builds dotted paths for ident keys', () => {
    expect(pathOf(t, 0)).toBe('$')
    expect(pathOf(t, 1)).toBe('$.a')
  })

  it('builds index paths for array elements', () => {
    expect(pathOf(t, 3)).toBe('$.b[0]')
    expect(pathOf(t, 4)).toBe('$.b[1]')
  })

  it('builds bracket paths for keys with special chars', () => {
    // 'c d' has a space, 'x.y' has a dot — both need bracket form
    const cd = t.keys.indexOf('c d')
    expect(pathOf(t, cd)).toBe('$["c d"]')
    const xy = t.keys.indexOf('x.y')
    expect(pathOf(t, xy)).toBe('$["c d"]["x.y"]')
  })

  it('keeps unicode letter keys as dotted', () => {
    const u = buildFlatTree({ 名字: '张三' })
    expect(pathOf(u, 1)).toBe('$.名字')
  })
})

describe('kindOf', () => {
  it('maps each JSON kind', () => {
    expect(kindOf({})).toBe(Kind.Object)
    expect(kindOf([])).toBe(Kind.Array)
    expect(kindOf('s')).toBe(Kind.String)
    expect(kindOf(1)).toBe(Kind.Number)
    expect(kindOf(true)).toBe(Kind.Bool)
    expect(kindOf(null)).toBe(Kind.Null)
  })
})

describe('parseJson', () => {
  it('parses valid JSON to a tree', () => {
    const r = parseJson('{"a":1}')
    expect(r.error).toBeNull()
    expect(r.tree?.count).toBe(2)
  })

  it('reports parse error with a message (location best-effort, engine-dependent)', () => {
    const r = parseJson('{\n  "a": ,\n}')
    expect(r.tree).toBeNull()
    expect(r.error).not.toBeNull()
    expect(r.error!.message.length).toBeGreaterThan(0)
    expect(r.error!.line).toBeGreaterThanOrEqual(0)
  })

  it('treats empty input as an error', () => {
    const r = parseJson('')
    expect(r.error).not.toBeNull()
  })

  it('parses unicode and escaped content', () => {
    const r = parseJson('{"emoji":"😀","quote":"a\\"b"}')
    expect(r.error).toBeNull()
    expect(r.tree?.values[1]).toBe('😀')
    expect(r.tree?.values[2]).toBe('a"b')
  })
})
