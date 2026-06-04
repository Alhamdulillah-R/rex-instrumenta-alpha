// 字符级 inline diff — 用 LCS DP 算两段文本的相同 / 差异片段, 返回左右各自的 segment[],
// 给 SBS 的 changed row 做行内字符段高亮(PyCharm 风格): 整行底色 + 不同字符段深色背景套娃.

export type SegStatus = 'same' | 'diff'

export interface InlineSeg {
  text: string
  status: SegStatus
}

export interface InlineDiff {
  left: InlineSeg[]
  right: InlineSeg[]
}

const MAX_LEN = 500 // O(MN) DP 的安全上限, 超过就降级为整段 diff

/**
 * inlineDiff 算两段文本的字符级差异. 返回左右两侧的 segment 数组, segment 已合并相邻同状态字符.
 * 任一侧空 / 任一侧超过 MAX_LEN, 降级为"整段 diff"(整段标 diff), 避免长串爆 DP.
 * @param a 左侧文本
 * @param b 右侧文本
 * @return left/right segment 数组
 */
export function inlineDiff(a: string, b: string): InlineDiff {
  if (!a && !b) return { left: [], right: [] }
  if (!a) return { left: [], right: [{ text: b, status: 'diff' }] }
  if (!b) return { left: [{ text: a, status: 'diff' }], right: [] }
  if (a === b) {
    return { left: [{ text: a, status: 'same' }], right: [{ text: b, status: 'same' }] }
  }
  if (a.length > MAX_LEN || b.length > MAX_LEN) {
    return { left: [{ text: a, status: 'diff' }], right: [{ text: b, status: 'diff' }] }
  }

  const m = a.length
  const n = b.length

  // LCS DP — Uint16Array 紧凑存, m*n 比起对象数组省一个量级内存
  const dp = new Uint16Array((m + 1) * (n + 1))
  const w = n + 1
  for (let i = 1; i <= m; i++) {
    const ai = a.charCodeAt(i - 1)
    const rowBase = i * w
    const prevBase = (i - 1) * w
    for (let j = 1; j <= n; j++) {
      if (ai === b.charCodeAt(j - 1)) {
        dp[rowBase + j] = dp[prevBase + (j - 1)] + 1
      } else {
        const up = dp[prevBase + j]
        const left = dp[rowBase + (j - 1)]
        dp[rowBase + j] = up >= left ? up : left
      }
    }
  }

  /* 回溯生成 segment. 从右下角往回走:
     - a[i-1] == b[j-1]: 两侧都吃一个 same 字符
     - dp[i-1][j] >= dp[i][j-1]: 左侧吃一个 diff 字符
     - else: 右侧吃一个 diff 字符
     用 prepend + 合并相邻同状态字符成段 */
  const left: InlineSeg[] = []
  const right: InlineSeg[] = []

  let i = m
  let j = n
  // chars 数组临时收集(从尾到头), 最后 reverse 合并
  const lChars: string[] = []
  const lStat: SegStatus[] = []
  const rChars: string[] = []
  const rStat: SegStatus[] = []

  while (i > 0 && j > 0) {
    if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
      lChars.push(a[i - 1])
      lStat.push('same')
      rChars.push(b[j - 1])
      rStat.push('same')
      i--
      j--
    } else if (dp[(i - 1) * w + j] >= dp[i * w + (j - 1)]) {
      lChars.push(a[i - 1])
      lStat.push('diff')
      i--
    } else {
      rChars.push(b[j - 1])
      rStat.push('diff')
      j--
    }
  }
  while (i > 0) {
    lChars.push(a[i - 1])
    lStat.push('diff')
    i--
  }
  while (j > 0) {
    rChars.push(b[j - 1])
    rStat.push('diff')
    j--
  }

  // 反向 + 合并相邻同状态成段
  for (let k = lChars.length - 1; k >= 0; k--) {
    const s = lStat[k]
    const c = lChars[k]
    const last = left[left.length - 1]
    if (last && last.status === s) last.text += c
    else left.push({ text: c, status: s })
  }
  for (let k = rChars.length - 1; k >= 0; k--) {
    const s = rStat[k]
    const c = rChars[k]
    const last = right[right.length - 1]
    if (last && last.status === s) last.text += c
    else right.push({ text: c, status: s })
  }

  return { left, right }
}
