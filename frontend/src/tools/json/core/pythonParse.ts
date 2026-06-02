// Python dict/list 字面量 <-> JSON 互转.
//   pythonToJsonText: 粘贴 Python repr(单引号 / True/False/None / (tuple))时转成 JSON 文本
//   jsonToPython:     把 JSON 值导出成可读的 Python 字面量(复制为 dict)
// 用字符扫描而非正则, 避免破坏字符串内部的 True/None/引号等内容.

/**
 * looksLikePython 粗判文本是否像 Python 字面量(含单引号或 True/False/None).
 * 只有标准 JSON.parse 失败且像 Python 时才尝试转换, 避免掩盖真正的 JSON 报错.
 */
export function looksLikePython(text: string): boolean {
  return /'|\bTrue\b|\bFalse\b|\bNone\b/.test(text)
}

/**
 * pythonToJsonText 把 Python 字面量文本转成等价 JSON 文本.
 * 处理: 单引号串→双引号(正确转义)、True/False/None→true/false/null、(tuple)→[array]、清尾逗号.
 * 字符串内部内容原样保留(扫描时跟踪引号状态).
 */
export function pythonToJsonText(src: string): string {
  let out = ''
  let i = 0
  const n = src.length

  while (i < n) {
    const ch = src[i]

    // 双引号串: 原样拷贝(已是 JSON 风格), 跟随转义
    if (ch === '"') {
      out += ch
      i++
      while (i < n) {
        const c = src[i]
        out += c
        if (c === '\\' && i + 1 < n) {
          out += src[i + 1]
          i += 2
          continue
        }
        i++
        if (c === '"') break
      }
      continue
    }

    // 单引号串: 转成双引号 JSON 串, 直接构造合法转义
    if (ch === "'") {
      i++
      out += '"'
      while (i < n) {
        const c = src[i]
        if (c === '\\') {
          const nx = src[i + 1] ?? ''
          if (nx === "'") out += "'"
          else if (nx === '"') out += '\\"'
          else out += '\\' + nx
          i += 2
          continue
        }
        if (c === "'") {
          i++
          break
        }
        if (c === '"') out += '\\"'
        else if (c === '\n') out += '\\n'
        else if (c === '\r') out += '\\r'
        else if (c === '\t') out += '\\t'
        else out += c
        i++
      }
      out += '"'
      continue
    }

    // 串外: 字面量 + tuple
    if (matchWord(src, i, 'True')) {
      out += 'true'
      i += 4
      continue
    }
    if (matchWord(src, i, 'False')) {
      out += 'false'
      i += 5
      continue
    }
    if (matchWord(src, i, 'None')) {
      out += 'null'
      i += 4
      continue
    }
    if (ch === '(') {
      out += '['
      i++
      continue
    }
    if (ch === ')') {
      out += ']'
      i++
      continue
    }

    out += ch
    i++
  }

  // 清理尾随逗号: ,] / ,}
  return out.replace(/,(\s*[}\]])/g, '$1')
}

function matchWord(src: string, i: number, word: string): boolean {
  if (src.slice(i, i + word.length) !== word) return false
  const before = i > 0 ? src[i - 1] : ' '
  const after = src[i + word.length] ?? ' '
  return !isIdentChar(before) && !isIdentChar(after)
}

function isIdentChar(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c)
}

/**
 * jsonToPython 把 JSON 值导出成可读的 Python 字面量(多行缩进).
 * null→None, true→True, false→False, key/str 用单引号.
 * @param value 任意 JSON 值
 * @param indent 当前缩进层级(递归用, 外部传 0)
 * @return Python 字面量字符串
 */
export function jsonToPython(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  const padIn = '  '.repeat(indent + 1)

  if (value === null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return pyStr(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((v) => padIn + jsonToPython(v, indent + 1))
    return '[\n' + items.join(',\n') + '\n' + pad + ']'
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 0) return '{}'
    const items = keys.map((k) => padIn + pyStr(k) + ': ' + jsonToPython(obj[k], indent + 1))
    return '{\n' + items.join(',\n') + '\n' + pad + '}'
  }

  return 'None'
}

// 用双引号(用户偏好), 转义 " 与反斜杠; 单引号/撇号原样保留, 无需转义
function pyStr(s: string): string {
  const body = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return '"' + body + '"'
}
