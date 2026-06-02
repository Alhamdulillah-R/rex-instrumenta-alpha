// canvas 配色从 CSS 变量读取(tokens.css 的 --rex-json-* / --rex-diff-*), 主题切换后
// 重新 readCanvasTheme 即随之变色 —— DOM 与 canvas 同一套真值源.

export interface CanvasTheme {
  key: string
  string: string
  number: string
  bool: string
  null: string
  punct: string
  index: string
  guide: string
  guideActive: string
  rowHover: string
  rowSelected: string
  match: string
  matchActive: string
  triangle: string
  onSurface: string
  onSurfaceVariant: string
  scrollThumb: string

  diffSame: string
  diffChangedBg: string
  diffChangedFg: string
  diffAddedBg: string
  diffAddedFg: string
  diffRemovedBg: string
  diffRemovedFg: string
}

/**
 * readCanvasTheme 从一个处于主题作用域内的元素上解析 --rex-* 变量.
 * @param el 主题作用域内的元素(如 canvas 自身)
 * @return 解析好的 canvas 配色
 */
export function readCanvasTheme(el: HTMLElement): CanvasTheme {
  const cs = getComputedStyle(el)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback

  return {
    key: v('--rex-json-key', '#c4b5fd'),
    string: v('--rex-json-string', '#86efac'),
    number: v('--rex-json-number', '#fcd34d'),
    bool: v('--rex-json-bool', '#93c5fd'),
    null: v('--rex-json-null', '#a5b4fc'),
    punct: v('--rex-json-punct', 'rgba(255,255,255,0.4)'),
    index: v('--rex-json-index', 'rgba(255,255,255,0.45)'),
    guide: v('--rex-json-guide', 'rgba(255,255,255,0.07)'),
    guideActive: v('--rex-json-guide-active', 'rgba(196,181,253,0.35)'),
    rowHover: v('--rex-json-row-hover', 'rgba(255,255,255,0.05)'),
    rowSelected: v('--rex-json-row-selected', 'rgba(196,181,253,0.16)'),
    match: v('--rex-json-match', 'rgba(253,230,138,0.30)'),
    matchActive: v('--rex-json-match-active', 'rgba(253,230,138,0.55)'),
    triangle: v('--rex-json-triangle', 'rgba(255,255,255,0.55)'),
    onSurface: v('--rex-on-surface', '#ffffff'),
    onSurfaceVariant: v('--rex-on-surface-variant', '#ffffff'),
    scrollThumb: v('--rex-json-guide-active', 'rgba(255,255,255,0.22)'),

    diffSame: v('--rex-diff-same', 'rgba(255,255,255,0.42)'),
    diffChangedBg: v('--rex-diff-changed-bg', 'rgba(252,165,165,0.14)'),
    diffChangedFg: v('--rex-diff-changed-fg', '#fca5a5'),
    diffAddedBg: v('--rex-diff-added-bg', 'rgba(110,231,183,0.14)'),
    diffAddedFg: v('--rex-diff-added-fg', '#6ee7b7'),
    diffRemovedBg: v('--rex-diff-removed-bg', 'rgba(252,165,165,0.10)'),
    diffRemovedFg: v('--rex-diff-removed-fg', '#fda4af'),
  }
}
