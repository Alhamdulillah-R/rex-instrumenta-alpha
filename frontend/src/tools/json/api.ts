import { Diff } from '@bindings/go/jsontool/Service'
import { isWails } from '@/platform/native'
import type { DiffResult } from './core/diff'

/**
 * diffJson 调 Go 后端做结构化对比. diff 引擎在 Go 侧(CPU 密集 + 大整数精度),
 * 浏览器预览无 Go 后端时返回带提示的错误结果, 不假装能算.
 * @param left  左侧 JSON 文本
 * @param right 右侧 JSON 文本
 * @return 展平 diff 结果
 */
export async function diffJson(left: string, right: string): Promise<DiffResult> {
  if (!isWails()) {
    return {
      rows: [],
      stats: { total: 0, same: 0, changed: 0, added: 0, removed: 0 },
      error: '对比功能需要在桌面端(Wails)运行 —— 当前是浏览器预览, 没有 Go 后端.',
    }
  }
  return (await Diff(left, right)) as unknown as DiffResult
}
