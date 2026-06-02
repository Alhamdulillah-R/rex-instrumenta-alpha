import { describe, it, expect } from 'vitest'
import { pythonToJsonText, jsonToPython, looksLikePython } from './pythonParse'

// 转完直接 JSON.parse 验证语义正确
function pyParse(src: string): unknown {
  return JSON.parse(pythonToJsonText(src))
}

describe('pythonToJsonText', () => {
  it('converts single quotes + True/False/None', () => {
    expect(pyParse("{'a': True, 'b': False, 'c': None}")).toEqual({ a: true, b: false, c: null })
  })

  it('handles nested dict/list', () => {
    expect(pyParse("{'x': [1, 2, {'y': None}]}")).toEqual({ x: [1, 2, { y: null }] })
  })

  it('converts tuples to arrays', () => {
    expect(pyParse("{'pt': (1, 2)}")).toEqual({ pt: [1, 2] })
  })

  it('keeps True/None when inside a string value', () => {
    expect(pyParse("{'msg': 'True is None here'}")).toEqual({ msg: 'True is None here' })
  })

  it('handles apostrophes in double-quoted values', () => {
    expect(pyParse(`{'msg': "it's ok"}`)).toEqual({ msg: "it's ok" })
  })

  it('handles escaped apostrophe in single-quoted string', () => {
    expect(pyParse("{'msg': 'it\\'s ok'}")).toEqual({ msg: "it's ok" })
  })

  it('strips trailing commas', () => {
    expect(pyParse("{'a': 1, 'b': 2,}")).toEqual({ a: 1, b: 2 })
    expect(pyParse("[1, 2, 3,]")).toEqual([1, 2, 3])
  })

  it('escapes embedded double quotes from single-quoted strings', () => {
    expect(pyParse("{'q': 'say \"hi\"'}")).toEqual({ q: 'say "hi"' })
  })
})

describe('looksLikePython', () => {
  it('detects python markers', () => {
    expect(looksLikePython("{'a': 1}")).toBe(true)
    expect(looksLikePython('{"a": True}')).toBe(true)
    expect(looksLikePython('{"a": 1}')).toBe(false)
  })
})

describe('jsonToPython', () => {
  it('maps primitives (double-quoted strings)', () => {
    expect(jsonToPython(null)).toBe('None')
    expect(jsonToPython(true)).toBe('True')
    expect(jsonToPython(false)).toBe('False')
    expect(jsonToPython(42)).toBe('42')
    expect(jsonToPython('hi')).toBe('"hi"')
  })

  it('keeps apostrophes unescaped, escapes double quotes', () => {
    expect(jsonToPython("it's")).toBe('"it\'s"')
    expect(jsonToPython('say "hi"')).toBe('"say \\"hi\\""')
  })

  it('renders nested dict round-trippable back via python conversion', () => {
    const value = { a: 1, b: [true, null], c: { d: 'x' } }
    const py = jsonToPython(value)
    // 再用 pythonToJsonText 转回 JSON, 应等价
    expect(JSON.parse(pythonToJsonText(py))).toEqual(value)
  })

  it('handles empty containers', () => {
    expect(jsonToPython({})).toBe('{}')
    expect(jsonToPython([])).toBe('[]')
  })
})
