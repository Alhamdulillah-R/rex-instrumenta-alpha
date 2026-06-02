import { describe, it, expect } from 'vitest'
import { buildFlatTree, pathOf } from './model'
import { likeToRegExp, searchPaths, structuralPattern, countStructural } from './pathSearch'

describe('likeToRegExp', () => {
  it('% matches any run, _ matches single char', () => {
    expect(likeToRegExp('a%').test('abc')).toBe(true)
    expect(likeToRegExp('a%').test('a')).toBe(true)
    expect(likeToRegExp('a_c').test('abc')).toBe(true)
    expect(likeToRegExp('a_c').test('ac')).toBe(false)
    expect(likeToRegExp('a_c').test('abbc')).toBe(false)
  })

  it('escapes regex/path metacharacters as literals', () => {
    // 字面的 . [ ] $ 不应被当正则
    expect(likeToRegExp('$.a[0]').test('$.a[0]')).toBe(true)
    expect(likeToRegExp('$.a[0]').test('$xa!0!')).toBe(false)
  })
})

describe('searchPaths', () => {
  const tree = buildFlatTree({
    tools: [{ features: [1] }, { features: [2] }, { other: 3 }],
    misc: { features: 9 },
  })

  it('matches array-position wildcard with %', () => {
    const ids = Array.from(searchPaths(tree, '$.tools[%].features'))
    const paths = ids.map((i) => pathOf(tree, i))
    expect(paths).toContain('$.tools[0].features')
    expect(paths).toContain('$.tools[1].features')
    // $.misc.features 不在 tools 下, 不该命中
    expect(paths).not.toContain('$.misc.features')
    expect(ids.length).toBe(2)
  })

  it('empty pattern returns no matches', () => {
    expect(searchPaths(tree, '').length).toBe(0)
  })

  it('[%] matches only one array index, never descends into deeper segments', () => {
    // a 是 3 元素数组, 第 3 个元素深层还有 m:[1,2,3]
    const t = buildFlatTree({ a: [{ m: 1 }, { m: 2 }, { n: { m: [1, 2, 3] } }] })
    const ids = Array.from(searchPaths(t, '$.a[%]'))
    const paths = ids.map((i) => pathOf(t, i))
    expect(paths.sort()).toEqual(['$.a[0]', '$.a[1]', '$.a[2]'])
    // 深层值 $.a[2].n.m[0..2] 不应被吞进来
    expect(paths.some((p) => p.includes('.m['))).toBe(false)
  })
})

describe('structuralPattern / countStructural', () => {
  const tree = buildFlatTree({ tools: [{ features: [1] }, { features: [2] }] })

  it('normalizes array indices to [%]', () => {
    expect(structuralPattern('$.tools[0].features')).toBe('$.tools[%].features')
    expect(structuralPattern('$.a[3].b[10].c')).toBe('$.a[%].b[%].c')
  })

  it('counts same-structure occurrences', () => {
    // 找到 $.tools[0].features 的节点
    let target = -1
    for (let i = 0; i < tree.count; i++) {
      if (pathOf(tree, i) === '$.tools[0].features') target = i
    }
    expect(target).toBeGreaterThanOrEqual(0)
    expect(countStructural(tree, target)).toBe(2)
  })
})
