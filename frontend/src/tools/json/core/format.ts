import { Kind, type KindCode } from './types'

const PREVIEW_MAX = 240

/**
 * formatScalar 把标量值格式化成画在 canvas 上的文本. 字符串带引号 + 转义,
 * 与 JSON 字面量一致, 让用户一眼区分 "123"(字符串) 与 123(数字).
 */
export function formatScalar(v: unknown): string {
  if (v === null) return 'null'
  switch (typeof v) {
    case 'string':
      return JSON.stringify(v)
    case 'number':
      return String(v)
    case 'boolean':
      return v ? 'true' : 'false'
    default:
      return String(v)
  }
}

/**
 * previewContainer 给折叠的容器画一行摘要, 如 { 3 } / [ 5 ].
 */
export function previewContainer(kind: KindCode, childCount: number): string {
  if (kind === Kind.Array) return `[ ${childCount} ]`
  return `{ ${childCount} }`
}

/**
 * clip 把过长文本截断, 避免单行预览刷到屏外(canvas 渲染也只画可见列).
 */
export function clip(s: string, max = PREVIEW_MAX): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}
