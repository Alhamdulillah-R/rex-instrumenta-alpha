import { describe, it, expect } from 'vitest'
import { buildFlatTree } from './model'
import { computeStats } from './stats'

describe('computeStats', () => {
  it('counts each kind, depth, array length and keys', () => {
    const text = '{"a":1,"b":[10,20],"c":{"d":"x"},"e":true,"f":null}'
    const tree = buildFlatTree(JSON.parse(text))
    const s = computeStats(tree, text)

    expect(s.totalNodes).toBe(9)
    expect(s.objects).toBe(2) // root + c
    expect(s.arrays).toBe(1)
    expect(s.numbers).toBe(3) // 1, 10, 20
    expect(s.strings).toBe(1) // "x"
    expect(s.booleans).toBe(1)
    expect(s.nulls).toBe(1)
    expect(s.keys).toBe(6) // a b c d e f
    expect(s.maxDepth).toBe(2)
    expect(s.maxArrayLen).toBe(2)
  })

  it('measures UTF-8 byte size for ascii', () => {
    const text = '{"a":1}'
    const tree = buildFlatTree(JSON.parse(text))
    expect(computeStats(tree, text).byteSize).toBe(text.length)
  })

  it('measures UTF-8 byte size for multi-byte chars', () => {
    // 中 = 3 bytes, 😀 = 4 bytes (surrogate pair)
    const text = '{"k":"中😀"}'
    const tree = buildFlatTree(JSON.parse(text))
    const s = computeStats(tree, text)
    // 原文里: {"k":"  "} 的 ascii 部分 8 字节(去掉两个多字节字符) + 3 + 4
    const ascii = '{"k":""}'.length
    expect(s.byteSize).toBe(ascii + 3 + 4)
  })

  it('handles empty object', () => {
    const text = '{}'
    const s = computeStats(buildFlatTree(JSON.parse(text)), text)
    expect(s.totalNodes).toBe(1)
    expect(s.objects).toBe(1)
    expect(s.keys).toBe(0)
    expect(s.maxDepth).toBe(0)
  })
})
