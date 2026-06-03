import { describe, it, expect } from 'vitest'
import { postProcessToPython } from './generate'

// fixtures = curlconverter.toPython 的真实输出形态(精简 headers/cookies, 保留结构), 覆盖各分支.

const A_GET = `import requests

cookies = {
    'a': '1',
}

headers = {
    'host': 'accounts.google.com',
    'user-agent': 'Mozilla/5.0',
}

params = {
    'og_pid': '1',
}

response = requests.get('https://accounts.google.com/RotateCookiesPage', params=params, cookies=cookies, headers=headers)
`

const B_POST_DATA = `import requests

headers = {
    'host': 'jnn-pa.googleapis.com',
    # 'content-length': '2134',
}

data = '["O43z0dpjhgX20SCx4KAo"]'

response = requests.post('https://jnn-pa.googleapis.com/$rpc/Waa/GenerateIT', headers=headers, data=data)
`

const C_OPTIONS = `import requests

headers = {
    'host': 'jnn-pa.googleapis.com',
}

response = requests.options('https://jnn-pa.googleapis.com/$rpc/Waa/GenerateIT', headers=headers)
`

const D_POST_JSON = `import requests

cookies = {
    'YSC': 'IdBef6289qk',
}

headers = {
    'host': 'www.youtube.com',
}

params = {
    'alt': 'json',
}

json_data = {
    'context': {
        'client': {
            'hl': 'zh-CN',
        },
    },
}

response = requests.post(
    'https://www.youtube.com/youtubei/v1/log_event',
    params=params,
    cookies=cookies,
    headers=headers,
    json=json_data,
)

# Note: json_data will not be serialized by requests
#data = '{"context":{}}'
`

// URL query 里有裸逗号(rt=hst.99,sct.261,...) —— 最易被错误切断的 case
const E_URL_COMMAS = `import requests

cookies = {
    'a': '1',
}

headers = {
    'host': 'www.google.com',
}

response = requests.post(
    'https://www.google.com/gen_204?rt=hst.99,sct.261,frts.262&zx=178',
    cookies=cookies,
    headers=headers,
)
`

// 取调用块里若干 kwarg 的出现下标(用于断言重排顺序)
function order(code: string, ...keys: string[]): number[] {
  return keys.map((k) => code.indexOf(k))
}
function isAscending(nums: number[]): boolean {
  return nums.every((n, i) => n >= 0 && (i === 0 || n > nums[i - 1]))
}

describe('postProcessToPython', () => {
  it('换 import 为 curl_cffi, 加 impersonate 与 print', () => {
    const out = postProcessToPython(A_GET, 'chrome136')
    expect(out).toContain('from curl_cffi import requests')
    expect(out).not.toMatch(/^import requests[ \t]*$/m)
    expect(out).toContain('impersonate="chrome136"')
    expect(out).toContain('print(response.text)')
    expect(out).toContain('print(response.status_code)')
  })

  it('URL 提成 url 变量并紧贴调用前, 首参用 url', () => {
    const out = postProcessToPython(A_GET, 'chrome136')
    expect(out).toContain("url = 'https://accounts.google.com/RotateCookiesPage'")
    // url 赋值在 response 调用之前
    expect(out.indexOf('url = ')).toBeGreaterThanOrEqual(0)
    expect(out.indexOf('url = ')).toBeLessThan(out.indexOf('response = requests'))
    // 调用首个参数是 url
    expect(out).toMatch(/requests\.get\(\s*\n\s*url,/)
  })

  it('GET: kwargs 重排为 headers → cookies → params', () => {
    const out = postProcessToPython(A_GET, 'chrome136')
    expect(out).toContain('requests.get(')
    expect(isAscending(order(out, 'headers=headers', 'cookies=cookies', 'params=params'))).toBe(true)
    // cookies 在 params 上方(= 之前)
    expect(out.indexOf('cookies=cookies')).toBeLessThan(out.indexOf('params=params'))
  })

  it('POST + data: 保留 data, headers 在 data 上方', () => {
    const out = postProcessToPython(B_POST_DATA, 'chrome131')
    expect(out).toContain('requests.post(')
    expect(out).toContain('data=data')
    expect(out).toContain('impersonate="chrome131"')
    expect(out.indexOf('headers=headers')).toBeLessThan(out.indexOf('data=data'))
    // 照抄保留注释行
    expect(out).toContain("# 'content-length'")
  })

  it('OPTIONS: 仅 headers 也正确', () => {
    const out = postProcessToPython(C_OPTIONS, 'chrome136')
    expect(out).toContain('requests.options(')
    expect(out).toContain("url = 'https://jnn-pa.googleapis.com/$rpc/Waa/GenerateIT'")
    expect(out).toMatch(/requests\.options\(\s*\n\s*url,\s*\n\s*headers=headers,/)
  })

  it('多行 POST + json: 重排 headers → cookies → params → json, 保留 Note', () => {
    const out = postProcessToPython(D_POST_JSON, 'chrome136')
    expect(out).toContain('json=json_data')
    expect(isAscending(order(out, 'headers=headers', 'cookies=cookies', 'params=params', 'json=json_data'))).toBe(true)
    // curlconverter 的 json 重序列化提示照抄保留
    expect(out).toContain('# Note: json_data will not be serialized by requests')
    // json_data 定义块保留
    expect(out).toContain('json_data = {')
  })

  it('URL 含裸逗号: 完整提取不被切断', () => {
    const out = postProcessToPython(E_URL_COMMAS, 'chrome136')
    expect(out).toContain("url = 'https://www.google.com/gen_204?rt=hst.99,sct.261,frts.262&zx=178'")
    // 逗号没把 URL 截断成多个 kwarg
    expect(out).not.toContain("url = 'https://www.google.com/gen_204?rt=hst.99'")
    expect(isAscending(order(out, 'headers=headers', 'cookies=cookies'))).toBe(true)
  })

  it('顶部定义块也重排: headers def 在 cookies/params/json def 上方', () => {
    const a = postProcessToPython(A_GET, 'chrome146')
    expect(isAscending(order(a, 'headers = {', 'cookies = {', 'params = {'))).toBe(true)
    const d = postProcessToPython(D_POST_JSON, 'chrome146')
    expect(isAscending(order(d, 'headers = {', 'cookies = {', 'params = {', 'json_data = {'))).toBe(true)
  })
})
