import { describe, it, expect } from 'vitest'
import { buildFlatTree } from './model'
import { search } from './search'

const tree = buildFlatTree({
  name: 'Alice',
  age: 30,
  tags: ['admin', 'Active'],
  meta: { city: 'Shanghai' },
})

const allOpts = { caseSensitive: false, keys: true, values: true }

function ids(tree_: ReturnType<typeof buildFlatTree>, query: string, opts = allOpts) {
  return Array.from(search(tree_, query, opts).matches)
}

describe('search', () => {
  it('returns empty for empty query', () => {
    expect(ids(tree, '')).toEqual([])
  })

  it('matches object keys', () => {
    const r = search(tree, 'name', { caseSensitive: false, keys: true, values: false })
    const keys = Array.from(r.matches).map((i) => tree.keys[i])
    expect(keys).toContain('name')
  })

  it('matches scalar values', () => {
    const r = search(tree, 'Shanghai', { caseSensitive: false, keys: false, values: true })
    const vals = Array.from(r.matches).map((i) => tree.values[i])
    expect(vals).toContain('Shanghai')
  })

  it('matches array element values', () => {
    const r = search(tree, 'admin', { caseSensitive: false, keys: false, values: true })
    expect(r.matches.length).toBe(1)
  })

  it('is case-insensitive by default', () => {
    expect(ids(tree, 'alice').length).toBe(1)
    expect(ids(tree, 'ACTIVE').length).toBe(1)
  })

  it('respects case-sensitive flag', () => {
    const sensitive = { caseSensitive: true, keys: true, values: true }
    expect(ids(tree, 'active', sensitive).length).toBe(0)
    expect(ids(tree, 'Active', sensitive).length).toBe(1)
  })

  it('matches numbers by their text', () => {
    const r = search(tree, '30', { caseSensitive: false, keys: false, values: true })
    expect(r.matches.length).toBe(1)
  })

  it('returns matches in document order', () => {
    const r = search(tree, 'a', { caseSensitive: false, keys: true, values: true })
    const arr = Array.from(r.matches)
    const sorted = [...arr].sort((x, y) => x - y)
    expect(arr).toEqual(sorted)
  })
})
