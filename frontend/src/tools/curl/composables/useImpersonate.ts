import { ref, computed, watch } from 'vue'

const STORAGE_KEY = 'ria-curl-impersonate'
const DEFAULT_TARGET = 'chrome146'

// curl_cffi 官方支持的 impersonate 目标(latest).
// 见 https://curl-cffi.readthedocs.io/en/latest/impersonate/targets.html
// 开头的 generic 别名(chrome/safari/...)始终用该浏览器最新指纹.
export const BUILTIN_IMPERSONATE = [
  'chrome',
  'safari',
  'safari_ios',
  'chrome_android',
  'firefox',
  // Chrome 桌面(新→旧)
  'chrome146',
  'chrome145',
  'chrome142',
  'chrome136',
  'chrome133a',
  'chrome131',
  'chrome124',
  'chrome123',
  'chrome120',
  'chrome119',
  'chrome116',
  'chrome110',
  'chrome107',
  'chrome104',
  'chrome101',
  'chrome100',
  'chrome99',
  // Chrome Android
  'chrome131_android',
  'chrome99_android',
  // Edge
  'edge101',
  'edge99',
  // Safari 桌面
  'safari2601',
  'safari260',
  'safari184',
  'safari180',
  'safari170',
  'safari155',
  'safari153',
  // Safari iOS
  'safari260_ios',
  'safari184_ios',
  'safari180_ios',
  'safari172_ios',
  // Firefox
  'firefox147',
  'firefox144',
  'firefox135',
  'firefox133',
  // Tor
  'tor145',
]

interface Stored {
  current: string
  custom: string[]
}

function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      current: typeof raw.current === 'string' && raw.current ? raw.current : DEFAULT_TARGET,
      custom: Array.isArray(raw.custom) ? raw.custom.filter((s: unknown): s is string => typeof s === 'string') : [],
    }
  } catch {
    return { current: DEFAULT_TARGET, custom: [] }
  }
}

/**
 * useImpersonate 管理 impersonate 版本:
 *  - 记忆上次选/填的版本(localStorage)
 *  - 用户手填的自定义版本累加进下拉(去重, 不覆盖内置列表)
 * 下拉项 = 自定义(在前, 最近加的优先) + 内置官方列表.
 */
export function useImpersonate() {
  const stored = load()
  const current = ref(stored.current)
  const custom = ref<string[]>(stored.custom)

  const options = computed(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of [...custom.value, ...BUILTIN_IMPERSONATE]) {
      if (t && !seen.has(t)) {
        seen.add(t)
        out.push(t)
      }
    }
    return out
  })

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: current.value, custom: custom.value }))
    } catch {
      /* localStorage 不可用时静默 */
    }
  }

  // current 变化只即时记忆当前选择(combobox 输入时会逐字更新 current, 这些中间态会被最终值覆盖,
  // 无害); 累加自定义不在这里 —— 否则输入 "chrome232" 会把 chrome2/chrome23 也存进去.
  watch(current, persist)

  // commit 由下拉失焦/回车确认时调用: 当前值是新自定义(非内置、未存过)才累加进 custom.
  function commit() {
    const val = (current.value || '').trim()
    if (val && !BUILTIN_IMPERSONATE.includes(val) && !custom.value.includes(val)) {
      custom.value = [val, ...custom.value]
      persist()
    }
  }

  // removeCustom 从下拉删除一个自定义版本(清理误存的脏历史).
  function removeCustom(v: string) {
    custom.value = custom.value.filter((x) => x !== v)
    persist()
  }

  // isCustom 判断某项是否用户自定义(用于下拉只给自定义项显示删除按钮).
  function isCustom(v: string): boolean {
    return custom.value.includes(v)
  }

  return { current, custom, options, commit, removeCustom, isCustom }
}
