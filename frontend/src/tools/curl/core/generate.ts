// curl_cffi 代码生成: 把 curlconverter 的标准 requests 输出后处理成 curl_cffi 版.
// curl → 标准 requests 的解析由 curlconverter 的 tree-sitter-bash wasm 完成; 这里只做"最后一公里"改写.

// requests 调用里 kwarg 的目标顺序: headers → cookies → params → data/json → files, impersonate 收尾.
const KW_ORDER = ['headers', 'cookies', 'params', 'data', 'json', 'files']

// 顶部定义块(cookies=/headers=/...)的目标顺序(变量名, json 块名为 json_data). 与 KW_ORDER 同序.
const DEF_ORDER = ['headers', 'cookies', 'params', 'data', 'json_data', 'files']

/**
 * postProcessToPython 把 curlconverter.toPython 的标准 requests 代码改写成 curl_cffi 版.
 *  - import requests → from curl_cffi import requests
 *  - requests.METHOD('URL', ...) 的 URL 提成 url 变量(紧贴调用前一行)
 *  - kwargs 按 headers, cookies, params, data/json, files 重排, 末尾加 impersonate
 *  - 追加 print(response.text) / print(response.status_code)
 * 解析不出预期调用时退化为"仅换 import", 不抛错.
 * @param py          curlconverter.toPython 的输出
 * @param impersonate curl_cffi impersonate 目标(如 chrome136)
 * @return curl_cffi 版 python 源码
 */
export function postProcessToPython(py: string, impersonate: string): string {
  const out = py.replace(/^import requests[ \t]*$/m, 'from curl_cffi import requests')

  const call = /response[ \t]*=[ \t]*requests\.(\w+)\(/.exec(out)
  if (!call) return out

  const method = call[1]
  const open = call.index + call[0].length - 1 // '(' 下标
  const close = matchParen(out, open)
  if (close < 0) return out

  const inner = out.slice(open + 1, close)
  const first = readFirstArg(inner)
  if (!first) return out // 第一个位置参数不是字符串字面量(非预期格式)→ 不动

  const kwargs = splitTopLevel(inner.slice(first.end))
    .map((s) => s.trim())
    .filter(Boolean)
  kwargs.sort((a, b) => kwRank(a) - kwRank(b))
  kwargs.push(`impersonate="${impersonate}"`)

  // url 提到调用前一行; 调用首参用 url 变量, kwargs 重排后接 impersonate; 追加 print
  const block =
    `url = ${first.text}\n` +
    `response = requests.${method}(\n` +
    `    url,\n` +
    kwargs.map((k) => `    ${k},`).join('\n') +
    `\n)\n` +
    `print(response.text)\n` +
    `print(response.status_code)`

  // 顶部 cookies=/headers=/params= 等定义块也按同一顺序重排(否则 cookies 定义仍在 headers 上方)
  const prefix = reorderDefs(out.slice(0, call.index))
  return prefix + block + out.slice(close + 1)
}

/**
 * matchParen 从 open('(' 下标)找配对的 ')', 跳过单/双引号字符串(含反斜杠转义)内的括号.
 * @return ')' 下标; 不配对返回 -1
 */
function matchParen(s: string, open: number): number {
  let depth = 0
  let quote = ''
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (c === "'" || c === '"') quote = c
    else if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * readFirstArg 读 inner 开头(允许前导空白)的第一个 python 字符串字面量(= URL).
 * URL query 里可能有裸逗号, 故必须按字符串字面量读到闭合引号, 不能按逗号切.
 * @return { text 含引号的字面量, end 字面量结束后的下标 }; 开头不是字符串字面量返回 null
 */
function readFirstArg(inner: string): { text: string; end: number } | null {
  let i = 0
  while (i < inner.length && /\s/.test(inner[i])) i++
  const q = inner[i]
  if (q !== "'" && q !== '"') return null

  const start = i
  i++
  for (; i < inner.length; i++) {
    const c = inner[i]
    if (c === '\\') i++
    else if (c === q) {
      i++
      break
    }
  }
  return { text: inner.slice(start, i), end: i }
}

/**
 * splitTopLevel 按顶层逗号切分(跳过字符串与 ()/[]/{} 内的逗号). 用于拆 kwargs.
 */
function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ''
  let buf = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      buf += c
      if (c === '\\' && i + 1 < s.length) buf += s[++i]
      else if (c === quote) quote = ''
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      buf += c
    } else if (c === '(' || c === '[' || c === '{') {
      depth++
      buf += c
    } else if (c === ')' || c === ']' || c === '}') {
      depth--
      buf += c
    } else if (c === ',' && depth === 0) {
      out.push(buf)
      buf = ''
    } else {
      buf += c
    }
  }
  out.push(buf)
  return out
}

/**
 * kwRank 返回 kwarg(如 'headers=headers')按 KW_ORDER 的排序键; 未知 key 排到最后.
 */
function kwRank(kwarg: string): number {
  const key = kwarg.slice(0, kwarg.indexOf('=')).trim()
  const idx = KW_ORDER.indexOf(key)
  return idx < 0 ? KW_ORDER.length : idx
}

/**
 * reorderDefs 重排 import 之后、response 之前的顶层定义块(cookies=/headers=/params=/...),
 * 按 DEF_ORDER(headers→cookies→params→data/json→files). 块之间以空行分隔, import 行固定在最前.
 * @param prefix import 行 + 各定义块(空行分隔)
 */
function reorderDefs(prefix: string): string {
  const blocks = prefix
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
  if (blocks.length <= 2) return prefix // 只有 import + 至多一个定义块, 无需重排

  const head = blocks[0] // import 行
  const defs = blocks.slice(1)
  defs.sort((a, b) => defRank(a) - defRank(b))
  return [head, ...defs].join('\n\n') + '\n\n'
}

/**
 * defRank 返回定义块(如 "headers = {...}")按 DEF_ORDER 的排序键; 未知排到最后.
 */
function defRank(block: string): number {
  const m = /^(\w+)\s*=/.exec(block)
  const idx = m ? DEF_ORDER.indexOf(m[1]) : -1
  return idx < 0 ? DEF_ORDER.length : idx
}
