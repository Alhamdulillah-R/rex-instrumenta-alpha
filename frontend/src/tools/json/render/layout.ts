// canvas 行布局常量. 定高行 → O(1) 滚动定位, 只画可视区.

export const ROW_HEIGHT = 22       // 单行像素高
export const PAD_LEFT = 14         // depth 0 左留白
export const PAD_RIGHT = 14
export const INDENT = 16           // 每层缩进
export const TRIANGLE_W = 16       // 展开三角占位宽
export const FONT_SIZE = 13
export const SCROLLBAR_W = 9

// canvas 不认 CSS 变量, ctx.font 必须给具体字族; 与 DOM 的 --rex-mono 保持完全一致(同样落 Cascadia Mono),
// 否则 canvas 树与界面其它等宽文字会落到不同字体. Cascadia Mono = 无连字版, 适合数据展示.
export const MONO_FAMILY = `'Cascadia Mono', 'Consolas', 'Microsoft YaHei UI', 'Microsoft YaHei', monospace`
export const MONO_FONT = `${FONT_SIZE}px ${MONO_FAMILY}`

// 缩放范围(Ctrl+滚轮)
export const SCALE_MIN = 0.5
export const SCALE_MAX = 3

/**
 * contentX 返回某 depth 行三角的 x 坐标; 文本从 contentX + TRIANGLE_W 起.
 */
export function triangleX(depth: number): number {
  return PAD_LEFT + depth * INDENT
}

export function textX(depth: number): number {
  return triangleX(depth) + TRIANGLE_W
}
