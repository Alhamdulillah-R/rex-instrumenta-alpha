import { Diff } from '@bindings/go/jsontool/Service'
import { isWails } from '@/platform/native'
import type { DiffResult } from './core/diff'
import { localDiff, type DiffOpts } from './core/localDiff'

export type { DiffOpts }

/**
 * diffJson 算两份 JSON 的展平 diff. 桌面端走 Go 后端(大整数精度无损);
 * 浏览器预览走本地 TS fallback(算法对齐, JS number 精度受限, 仅供预览).
 * @param left  左侧 JSON 文本
 * @param right 右侧 JSON 文本
 * @param opts  数组对齐选项(智能主键/值匹配 vs 按下标; 可指定主键字段)
 * @return 展平 diff 结果
 */
export async function diffJson(left: string, right: string, opts: DiffOpts): Promise<DiffResult> {
  if (!isWails()) return localDiff(left, right, opts)
  return (await Diff(left, right, opts)) as unknown as DiffResult
}
