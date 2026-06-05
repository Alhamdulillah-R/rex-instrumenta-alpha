import { describe, it, expect } from 'vitest'
import { localDiff, type DiffOpts } from './localDiff'
import type { DiffRow } from './diff'

const KEY: DiffOpts = { arrayMode: 'key', arrayKey: '' }
const INDEX: DiffOpts = { arrayMode: 'index', arrayKey: '' }

function row(rows: DiffRow[], path: string): DiffRow | undefined {
  return rows.find((r) => r.path === path)
}

describe('localDiff 数组匹配', () => {
  it('标量乱序按值匹配 → 全一致', () => {
    const res = localDiff('[1,2,3]', '[3,2,1]', KEY)
    expect(res.stats.changed).toBe(0)
    expect(res.stats.added).toBe(0)
    expect(res.stats.removed).toBe(0)
    expect(row(res.rows, '$')?.status).toBe('same')
  })

  it('对象数组按自动 id 配对, 乱序 → 一致', () => {
    const l = '{"users":[{"id":1,"name":"a"},{"id":2,"name":"b"}]}'
    const r = '{"users":[{"id":2,"name":"b"},{"id":1,"name":"a"}]}'
    const res = localDiff(l, r, KEY)
    expect(res.stats.changed).toBe(0)
    expect(res.stats.added).toBe(0)
    expect(res.stats.removed).toBe(0)
  })

  it('同 id 改字段 → changed, 不是一删一增', () => {
    const l = '{"users":[{"id":1,"name":"a"},{"id":2,"name":"b"}]}'
    const r = '{"users":[{"id":2,"name":"b"},{"id":1,"name":"A"}]}'
    const res = localDiff(l, r, KEY)
    expect(row(res.rows, '$.users[id=1].name')?.status).toBe('changed')
    expect(res.stats.added).toBe(0)
    expect(res.stats.removed).toBe(0)
  })

  it('按 id 增删', () => {
    const l = '{"users":[{"id":1},{"id":2}]}'
    const r = '{"users":[{"id":2},{"id":3}]}'
    const res = localDiff(l, r, KEY)
    expect(row(res.rows, '$.users[id=1]')?.status).toBe('removed')
    expect(row(res.rows, '$.users[id=3]')?.status).toBe('added')
    expect(row(res.rows, '$.users[id=2]')?.status).toBe('same')
  })

  it('指定主键字段(sku 不在自动候选)', () => {
    const l = '{"items":[{"sku":"A","q":1}]}'
    const r = '{"items":[{"sku":"A","q":2}]}'

    const auto = localDiff(l, r, KEY)
    expect(row(auto.rows, '$.items[0]')?.status).toBe('removed')
    expect(row(auto.rows, '$.items[1]')?.status).toBe('added')

    const keyed = localDiff(l, r, { arrayMode: 'key', arrayKey: 'sku' })
    expect(row(keyed.rows, '$.items[sku="A"].q')?.status).toBe('changed')
  })

  it('重复 id 回退整体值匹配, 不崩', () => {
    const l = '[{"id":1,"v":"x"},{"id":1,"v":"y"}]'
    const res = localDiff(l, l, KEY)
    expect(res.error).toBeUndefined()
    expect(res.stats.changed).toBe(0)
    expect(res.stats.added).toBe(0)
    expect(res.stats.removed).toBe(0)
  })

  it('index 模式严格按下标', () => {
    const res = localDiff('{"a":[1,2,3]}', '{"a":[3,2,1]}', INDEX)
    expect(row(res.rows, '$.a[0]')?.status).toBe('changed')
    expect(row(res.rows, '$.a[1]')?.status).toBe('same')
  })

  it('解析失败带 error', () => {
    expect(localDiff('{bad', '{}', KEY).error).toBeTruthy()
  })
})

describe('localDiff 嵌套路径主键', () => {
  const pathKey = (k: string): DiffOpts => ({ arrayMode: 'key', arrayKey: k })

  it('routing 按 fromSegments.flightNo 配对(乱序 + 改价)', () => {
    const l = '{"routing":[{"fromSegments":[{"flightNo":"OZ1085"}],"price":100},{"fromSegments":[{"flightNo":"KE001"}],"price":200}]}'
    const r = '{"routing":[{"fromSegments":[{"flightNo":"KE001"}],"price":200},{"fromSegments":[{"flightNo":"OZ1085"}],"price":150}]}'
    const res = localDiff(l, r, pathKey('fromSegments.flightNo'))
    expect(row(res.rows, '$.routing[flightNo="OZ1085"].price')?.status).toBe('changed')
    expect(res.stats.added).toBe(0)
    expect(res.stats.removed).toBe(0)
  })

  it('多段航班 fromSegments[*].flightNo 拼接当 key', () => {
    const l = '{"r":[{"fromSegments":[{"flightNo":"A1"},{"flightNo":"A2"}],"p":1}]}'
    const r = '{"r":[{"fromSegments":[{"flightNo":"A1"},{"flightNo":"A2"}],"p":2}]}'
    const res = localDiff(l, r, pathKey('fromSegments[*].flightNo'))
    expect(res.stats.added).toBe(0)
    expect(res.stats.removed).toBe(0)
    expect(res.stats.changed).toBeGreaterThan(0)
  })

  it('路径键只作用相关数组, users 回退按 id', () => {
    const l = '{"routing":[{"fromSegments":[{"flightNo":"X1"}],"p":1}],"users":[{"id":1,"n":"a"},{"id":2,"n":"b"}]}'
    const r = '{"routing":[{"fromSegments":[{"flightNo":"X1"}],"p":2}],"users":[{"id":2,"n":"b"},{"id":1,"n":"a"}]}'
    const res = localDiff(l, r, pathKey('fromSegments.flightNo'))
    expect(row(res.rows, '$.users[id=1]')?.status).toBe('same')
    expect(row(res.rows, '$.routing[flightNo="X1"].p')?.status).toBe('changed')
    expect(res.stats.added).toBe(0)
    expect(res.stats.removed).toBe(0)
  })
})
