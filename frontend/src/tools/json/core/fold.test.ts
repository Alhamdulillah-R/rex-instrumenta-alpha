import { describe, it, expect } from 'vitest'
import { buildFlatTree } from './model'
import { computeVisible, containersFromDepth, ancestorsOf, revealAncestors } from './fold'

const sample = buildFlatTree({ a: 1, b: [10, 20], c: { d: 'x' } })
// ids: 0 root, 1 a, 2 b[], 3 b0, 4 b1, 5 c{}, 6 d

describe('computeVisible', () => {
  // packed: open=id>=0, close=~id<0. 展开容器子树后插闭合行. ~2=-3, ~5=-6, ~0=-1
  it('emits open rows + closing-bracket rows when nothing collapsed', () => {
    const vis = computeVisible(sample, new Set())
    expect(Array.from(vis)).toEqual([0, 1, 2, 3, 4, -3, 5, 6, -6, -1])
  })

  it('collapsed array shows inline (no children, no closing row)', () => {
    const vis = computeVisible(sample, new Set([2]))
    expect(Array.from(vis)).toEqual([0, 1, 2, 5, 6, -6, -1])
  })

  it('hides everything but root (its close row also skipped) when root collapsed', () => {
    const vis = computeVisible(sample, new Set([0]))
    expect(Array.from(vis)).toEqual([0])
  })

  it('ignores collapse on a leaf', () => {
    const vis = computeVisible(sample, new Set([1]))
    expect(Array.from(vis)).toEqual([0, 1, 2, 3, 4, -3, 5, 6, -6, -1])
  })

  it('handles multiple collapsed containers', () => {
    const vis = computeVisible(sample, new Set([2, 5]))
    expect(Array.from(vis)).toEqual([0, 1, 2, 5, -1])
  })
})

describe('containersFromDepth', () => {
  it('collects containers at or below the given depth', () => {
    expect(containersFromDepth(sample, 1).sort((a, b) => a - b)).toEqual([2, 5])
  })

  it('includes root at depth 0', () => {
    expect(containersFromDepth(sample, 0).sort((a, b) => a - b)).toEqual([0, 2, 5])
  })
})

describe('ancestorsOf', () => {
  it('walks parent chain to root', () => {
    expect(ancestorsOf(sample, 6)).toEqual([5, 0])
    expect(ancestorsOf(sample, 3)).toEqual([2, 0])
  })

  it('returns empty for root', () => {
    expect(ancestorsOf(sample, 0)).toEqual([])
  })
})

describe('revealAncestors', () => {
  it('removes ancestors from collapsed set and reports change', () => {
    const collapsed = new Set([5])
    const changed = revealAncestors(sample, collapsed, 6)
    expect(changed).toBe(true)
    expect(collapsed.has(5)).toBe(false)
  })

  it('returns false when no ancestor was collapsed', () => {
    const collapsed = new Set([2])
    const changed = revealAncestors(sample, collapsed, 6)
    expect(changed).toBe(false)
    expect(collapsed.has(2)).toBe(true)
  })
})
