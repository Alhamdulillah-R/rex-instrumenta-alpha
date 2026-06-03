import { describe, it, expect } from 'vitest'
import { autoDocName, previewOf, uniqueName } from './docMeta'

describe('autoDocName', () => {
  it('按 yyyy-mm-dd-HH:mm导入的json 格式命名', () => {
    // 月份 0-based: 5 → 六月
    expect(autoDocName(new Date(2026, 5, 3, 14, 30))).toBe('2026-06-03-14:30导入的json')
  })
  it('月/日/时/分补零', () => {
    expect(autoDocName(new Date(2026, 0, 7, 9, 5))).toBe('2026-01-07-09:05导入的json')
  })
})

describe('previewOf', () => {
  it('把多行/缩进折叠成单行', () => {
    expect(previewOf('  {\n  "a": 1\n}\n')).toBe('{ "a": 1 }')
  })
  it('超长截断并加省略号', () => {
    const got = previewOf('x'.repeat(200))
    expect([...got].length).toBe(81)
    expect(got.endsWith('…')).toBe(true)
  })
  it('短内容原样返回', () => {
    expect(previewOf('hi')).toBe('hi')
  })
})

describe('uniqueName', () => {
  it('不冲突时直接用 base', () => {
    expect(uniqueName(['a', 'b'], 'c')).toBe('c')
  })
  it('冲突时追加计数', () => {
    expect(uniqueName(['foo', 'foo (2)'], 'foo')).toBe('foo (3)')
  })
})
