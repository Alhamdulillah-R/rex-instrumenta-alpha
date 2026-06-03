// 文档命名 / 预览的纯逻辑. 桌面端命名由 Go 侧 jsonstore 负责; 这里供浏览器预览的
// localStorage 回退用, 与 Go 端 defaultName / previewOf 行为保持一致, 也便于单测.

/**
 * autoDocName 给无名文档按 "yyyy-mm-dd-HH:mm导入的json" 生成默认名.
 * @param d 命名基准时间
 * @return 形如 2026-06-03-14:30导入的json 的名字
 */
export function autoDocName(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${stamp}导入的json`
}

/**
 * previewOf 取正文做单行预览: 折叠空白、截断到 80 个字符、超长加省略号.
 * @param content 文档正文
 * @return 单行预览串
 */
export function previewOf(content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim()
  const chars = [...collapsed]
  if (chars.length <= 80) return collapsed
  return chars.slice(0, 80).join('') + '…'
}

/**
 * uniqueName 保证名字不与已有名重复(冲突追加 " (2)"/" (3)"…).
 * @param existing 现有名字集合
 * @param base     期望名字
 * @return 不冲突的名字
 */
export function uniqueName(existing: Iterable<string>, base: string): string {
  const set = new Set(existing)
  if (!set.has(base)) return base
  for (let i = 2; ; i++) {
    const cand = `${base} (${i})`
    if (!set.has(cand)) return cand
  }
}
