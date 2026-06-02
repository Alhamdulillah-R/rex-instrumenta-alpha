import { Kind, type FlatTree } from '../core/types'
import { computeVisible, containersFromDepth, revealAncestors } from '../core/fold'
import { formatScalar, previewContainer, clip } from '../core/format'
import { CanvasViewport, type ScrollbarGeom } from './viewport'
import { readCanvasTheme, type CanvasTheme } from './theme'
import {
  ROW_HEIGHT,
  INDENT,
  TRIANGLE_W,
  PAD_LEFT,
  PAD_RIGHT,
  FONT_SIZE,
  MONO_FAMILY,
  SCROLLBAR_W,
  SCALE_MIN,
  SCALE_MAX,
} from './layout'

export interface TreeRendererCallbacks {
  onSelect?: (nodeId: number) => void
  onContextMenu?: (nodeId: number, clientX: number, clientY: number) => void
}

// 当前缩放下的行布局度量
interface Metrics {
  rowH: number
  indent: number
  triW: number
  padLeft: number
  fontPx: number
}

/**
 * TreeRenderer 把 FlatTree 虚拟渲染到 canvas. 可见行 packed 编码(open=id, close=~id),
 * 展开容器在子节点后画闭合 } / ]. 支持双向滚动 / 命中高亮 / hover / 选中 / X 折叠悬停行 /
 * Ctrl+滚轮缩放 / DPR / 主题响应(配色在 rAF draw 内读, 避开主题 class 未刷新的时序坑).
 */
export class TreeRenderer {
  private ctx: CanvasRenderingContext2D
  private vp: CanvasViewport
  private theme: CanvasTheme
  private themeDirty = false

  private tree: FlatTree | null = null
  private collapsed = new Set<number>()
  private visible: Int32Array = new Int32Array(0)
  private maxContentWidth = 0

  private selectedId = -1
  private hoverIndex = -1
  private matches = new Set<number>()
  private activeMatchId = -1

  private scale = 1
  private m: Metrics = this.computeMetrics(1)

  private dpr = 1
  private rafScheduled = false
  private dragV = false
  private dragH = false
  private dragOffset = 0
  private ro: ResizeObserver

  constructor(
    private canvas: HTMLCanvasElement,
    private callbacks: TreeRendererCallbacks = {},
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    this.ctx = ctx
    this.vp = new CanvasViewport(this.m.rowH, SCROLLBAR_W)
    this.theme = readCanvasTheme(canvas)

    this.bindEvents()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
  }

  // ─── 数据 ───

  setTree(tree: FlatTree | null): void {
    this.tree = tree
    this.collapsed.clear()
    this.selectedId = -1
    this.hoverIndex = -1
    this.matches.clear()
    this.activeMatchId = -1
    this.maxContentWidth = 0
    this.vp.setScrollTop(0)
    this.vp.setScrollLeft(0)
    this.recomputeVisible()
  }

  toggle(nodeId: number): void {
    if (!this.tree || this.tree.childCount[nodeId] === 0) return
    if (this.collapsed.has(nodeId)) this.collapsed.delete(nodeId)
    else this.collapsed.add(nodeId)
    this.recomputeVisible()
  }

  expandAll(): void {
    this.collapsed.clear()
    this.recomputeVisible()
  }

  collapseAll(): void {
    if (!this.tree) return
    this.collapsed = new Set(containersFromDepth(this.tree, 1))
    this.recomputeVisible()
  }

  select(nodeId: number, scroll = true): void {
    if (!this.tree) return
    this.selectedId = nodeId
    if (revealAncestors(this.tree, this.collapsed, nodeId)) this.recomputeVisibleSilent()
    if (scroll) {
      const vi = this.visibleIndexOf(nodeId)
      if (vi >= 0) this.vp.scrollToRow(vi, 'center')
    }
    this.scheduleDraw()
  }

  getSelectedId(): number {
    return this.selectedId
  }

  setMatches(matchIds: Int32Array, activeIndex: number): void {
    this.matches = new Set(matchIds)
    if (matchIds.length > 0 && activeIndex >= 0 && activeIndex < matchIds.length) {
      this.activeMatchId = matchIds[activeIndex]
      if (this.tree && revealAncestors(this.tree, this.collapsed, this.activeMatchId)) {
        this.recomputeVisibleSilent()
      }
      const vi = this.visibleIndexOf(this.activeMatchId)
      if (vi >= 0) this.vp.scrollToRow(vi, 'center')
    } else {
      this.activeMatchId = -1
    }
    this.scheduleDraw()
  }

  clearMatches(): void {
    this.matches.clear()
    this.activeMatchId = -1
    this.scheduleDraw()
  }

  recolor(): void {
    // 配色推迟到 draw(rAF) 里读 —— 主题切换时 DOM class 此刻可能还没刷新, 直接读会拿到旧值
    this.themeDirty = true
    this.scheduleDraw()
  }

  destroy(): void {
    this.ro.disconnect()
    this.unbindEvents()
  }

  // ─── 缩放 ───

  private computeMetrics(scale: number): Metrics {
    return {
      rowH: Math.round(ROW_HEIGHT * scale),
      indent: INDENT * scale,
      triW: TRIANGLE_W * scale,
      padLeft: PAD_LEFT * scale,
      fontPx: Math.max(8, Math.round(FONT_SIZE * scale)),
    }
  }

  private setScale(scale: number): void {
    const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale))
    if (next === this.scale) return
    this.scale = next
    this.m = this.computeMetrics(next)
    this.vp.rowHeight = this.m.rowH
    this.maxContentWidth = 0 // 字号变了, 重新测内容宽
    this.vp.setScrollTop(this.vp.scrollTop)
    this.scheduleDraw()
  }

  private triX(depth: number): number {
    return this.m.padLeft + depth * this.m.indent
  }
  private txtX(depth: number): number {
    return this.triX(depth) + this.m.triW
  }

  // ─── 内部 ───

  private recomputeVisible(): void {
    this.recomputeVisibleSilent()
    this.scheduleDraw()
  }

  private recomputeVisibleSilent(): void {
    if (!this.tree) {
      this.visible = new Int32Array(0)
      this.vp.totalRows = 0
      return
    }
    this.visible = computeVisible(this.tree, this.collapsed)
    this.vp.totalRows = this.visible.length
    this.vp.setScrollTop(this.vp.scrollTop)
  }

  // 行值解码: open/leaf = id>=0, close = ~id<0 → 返回逻辑 nodeId.
  private nodeOf(rowValue: number): number {
    return rowValue < 0 ? ~rowValue : rowValue
  }

  // visibleIndexOf 找 nodeId 的 open 行下标(close 行打散了升序, 用线性扫描; 仅 select/跳转用)
  private visibleIndexOf(nodeId: number): number {
    const v = this.visible
    for (let k = 0; k < v.length; k++) {
      if (v[k] === nodeId) return k
    }
    return -1
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(0, Math.floor(rect.width))
    const h = Math.max(0, Math.floor(rect.height))
    this.dpr = Math.max(1, Math.ceil(window.devicePixelRatio || 1))
    this.canvas.width = w * this.dpr
    this.canvas.height = h * this.dpr
    this.vp.viewWidth = w
    this.vp.viewHeight = h
    this.vp.setScrollTop(this.vp.scrollTop)
    this.vp.setScrollLeft(this.vp.scrollLeft)
    // 同步重绘 —— setting canvas.width 已清空画布, 走 rAF 会留一帧空白; nav 宽度动画期
    // ResizeObserver 连发会导致整片空白("json 消失"). 直接 draw 消除空帧.
    this.draw()
  }

  private scheduleDraw(): void {
    if (this.rafScheduled) return
    this.rafScheduled = true
    requestAnimationFrame(() => {
      this.rafScheduled = false
      this.draw()
    })
  }

  private draw(): void {
    if (this.themeDirty) {
      this.theme = readCanvasTheme(this.canvas)
      this.themeDirty = false
    }
    const ctx = this.ctx
    const { viewWidth: w, viewHeight: h } = this.vp
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (!this.tree || this.visible.length === 0) return

    ctx.font = `${this.m.fontPx}px ${MONO_FAMILY}`
    ctx.textBaseline = 'middle'

    const first = this.vp.firstVisible()
    const last = this.vp.lastVisible()
    for (let i = first; i < last; i++) {
      this.drawRow(this.visible[i], i)
    }

    this.vp.contentWidth = this.maxContentWidth
    this.vp.setScrollLeft(this.vp.scrollLeft)
    this.drawBar(this.vp.scrollbarV())
    this.drawBar(this.vp.scrollbarH())
  }

  private drawRow(rowValue: number, visIndex: number): void {
    const ctx = this.ctx
    const t = this.tree as FlatTree
    const isClose = rowValue < 0
    const nodeId = isClose ? ~rowValue : rowValue
    const rowH = this.m.rowH
    const sx = this.vp.scrollLeft
    const y = visIndex * rowH - this.vp.scrollTop
    const cy = y + rowH / 2
    const depth = t.depth[nodeId]
    const kind = t.kind[nodeId]

    // 行背景
    const bg = this.rowBg(nodeId, visIndex)
    if (bg) {
      ctx.fillStyle = bg
      ctx.fillRect(0, y, this.vp.viewWidth, rowH)
    }

    // 缩进引导线(随横向滚动偏移)
    ctx.strokeStyle = this.theme.guide
    ctx.lineWidth = 1
    for (let level = 0; level < depth; level++) {
      const gx = Math.round(this.triX(level) + this.m.triW / 2 - sx) + 0.5
      ctx.beginPath()
      ctx.moveTo(gx, y)
      ctx.lineTo(gx, y + rowH)
      ctx.stroke()
    }

    // 闭合行: 只画一个 } / ] 对齐容器缩进, 无三角无 key
    if (isClose) {
      const right = this.text(kind === Kind.Array ? ']' : '}', this.txtX(depth), cy, this.theme.punct)
      if (right + PAD_RIGHT > this.maxContentWidth) this.maxContentWidth = right + PAD_RIGHT
      return
    }

    const childCount = t.childCount[nodeId]
    const isContainer = kind === Kind.Object || kind === Kind.Array
    const collapsed = isContainer && this.collapsed.has(nodeId)
    if (childCount > 0) this.drawTriangle(this.triX(depth) - sx, cy, collapsed)

    let x = this.txtX(depth)
    const key = t.keys[nodeId]
    if (key !== null) {
      x = this.text(key, x, cy, this.theme.key)
      x = this.text(': ', x, cy, this.theme.punct)
    } else if (t.arrayIndex[nodeId] >= 0) {
      x = this.text(String(t.arrayIndex[nodeId]), x, cy, this.theme.index)
      x = this.text(': ', x, cy, this.theme.punct)
    }

    if (isContainer) {
      if (collapsed) x = this.text(previewContainer(kind, childCount), x, cy, this.theme.punct)
      else x = this.text(kind === Kind.Array ? '[' : '{', x, cy, this.theme.punct)
    } else {
      x = this.text(clip(formatScalar(t.values[nodeId]), 4000), x, cy, this.colorForKind(kind))
    }

    const right = x + PAD_RIGHT
    if (right > this.maxContentWidth) this.maxContentWidth = right
  }

  private rowBg(nodeId: number, visIndex: number): string | null {
    if (nodeId === this.selectedId) return this.theme.rowSelected
    if (this.matches.has(nodeId)) {
      return nodeId === this.activeMatchId ? this.theme.matchActive : this.theme.match
    }
    if (visIndex === this.hoverIndex) return this.theme.rowHover
    return null
  }

  private colorForKind(kind: number): string {
    switch (kind) {
      case Kind.String:
        return this.theme.string
      case Kind.Number:
        return this.theme.number
      case Kind.Bool:
        return this.theme.bool
      case Kind.Null:
        return this.theme.null
      default:
        return this.theme.onSurface
    }
  }

  private text(s: string, contentX: number, cy: number, color: string): number {
    const ctx = this.ctx
    ctx.fillStyle = color
    ctx.fillText(s, contentX - this.vp.scrollLeft, cy)
    return contentX + ctx.measureText(s).width
  }

  private drawTriangle(x: number, cy: number, collapsed: boolean): void {
    const ctx = this.ctx
    const s = 4 * this.scale
    ctx.fillStyle = this.theme.triangle
    const cx = x + this.m.triW / 2
    ctx.beginPath()
    if (collapsed) {
      ctx.moveTo(cx - s * 0.75, cy - s)
      ctx.lineTo(cx + s * 0.75, cy)
      ctx.lineTo(cx - s * 0.75, cy + s)
    } else {
      ctx.moveTo(cx - s, cy - s * 0.75)
      ctx.lineTo(cx + s, cy - s * 0.75)
      ctx.lineTo(cx, cy + s * 0.75)
    }
    ctx.closePath()
    ctx.fill()
  }

  private drawBar(bar: ScrollbarGeom): void {
    if (!bar.visible) return
    const ctx = this.ctx
    ctx.fillStyle = this.theme.scrollThumb
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath()
      ctx.roundRect(bar.x, bar.y, bar.w, bar.h, Math.min(bar.w, bar.h) / 2)
      ctx.fill()
    } else {
      ctx.fillRect(bar.x, bar.y, bar.w, bar.h)
    }
  }

  // ─── 事件 ───

  private onWheel = (e: WheelEvent): void => {
    // Ctrl+滚轮 缩放
    if (e.ctrlKey) {
      e.preventDefault()
      this.setScale(this.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
      return
    }
    e.preventDefault()
    const step = e.deltaMode === 1 ? this.vp.rowHeight : 1
    if (e.shiftKey) {
      this.vp.scrollByX(e.deltaY * step)
    } else {
      this.vp.scrollBy(e.deltaY * step)
      if (e.deltaX) this.vp.scrollByX(e.deltaX * step)
    }
    this.scheduleDraw()
  }

  private onPointerDown = (e: PointerEvent): void => {
    // Ctrl+中键 还原缩放
    if (e.button === 1) {
      if (e.ctrlKey) {
        e.preventDefault()
        this.setScale(1)
      }
      return
    }

    const { x, y } = this.localXY(e)
    const vbar = this.vp.scrollbarV()
    if (vbar.visible && x >= vbar.x - 4 && y >= vbar.y && y <= vbar.y + vbar.h) {
      this.dragV = true
      this.dragOffset = y - vbar.y
      this.canvas.setPointerCapture(e.pointerId)
      return
    }
    const hbar = this.vp.scrollbarH()
    if (hbar.visible && y >= hbar.y - 4 && x >= hbar.x && x <= hbar.x + hbar.w) {
      this.dragH = true
      this.dragOffset = x - hbar.x
      this.canvas.setPointerCapture(e.pointerId)
      return
    }
    if (!this.tree) return

    const row = this.vp.rowAtY(y)
    if (row < 0 || row >= this.visible.length) return
    const rowValue = this.visible[row]
    const nodeId = this.nodeOf(rowValue)
    const depth = this.tree.depth[nodeId]
    const hasChildren = this.tree.childCount[nodeId] > 0
    const contentX = x + this.vp.scrollLeft

    // 点开行的三角区域 → 折叠; 否则(含闭合行) → 选中节点
    if (rowValue >= 0 && hasChildren && contentX >= this.triX(depth) && contentX < this.txtX(depth)) {
      this.toggle(nodeId)
    } else {
      this.selectedId = nodeId
      this.scheduleDraw()
      this.callbacks.onSelect?.(nodeId)
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    const { x, y } = this.localXY(e)
    if (this.dragV) {
      this.vp.scrollToThumbY(y - this.dragOffset)
      this.scheduleDraw()
      return
    }
    if (this.dragH) {
      this.vp.scrollToThumbX(x - this.dragOffset)
      this.scheduleDraw()
      return
    }
    const row = this.vp.rowAtY(y)
    const next = row >= 0 && row < this.visible.length ? row : -1
    if (next !== this.hoverIndex) {
      this.hoverIndex = next
      this.scheduleDraw()
    }
    if (next >= 0 && this.tree) {
      const rowValue = this.visible[next]
      const nodeId = this.nodeOf(rowValue)
      const depth = this.tree.depth[nodeId]
      const contentX = x + this.vp.scrollLeft
      const onTriangle =
        rowValue >= 0 &&
        this.tree.childCount[nodeId] > 0 &&
        contentX >= this.triX(depth) &&
        contentX < this.txtX(depth)
      this.canvas.style.cursor = onTriangle ? 'pointer' : 'default'
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (this.dragV || this.dragH) {
      this.dragV = false
      this.dragH = false
      try {
        this.canvas.releasePointerCapture(e.pointerId)
      } catch {
        // 已释放
      }
    }
  }

  private onPointerLeave = (): void => {
    if (this.hoverIndex !== -1) {
      this.hoverIndex = -1
      this.scheduleDraw()
    }
  }

  private onDblClick = (e: MouseEvent): void => {
    if (!this.tree) return
    const { y } = this.localXY(e)
    const row = this.vp.rowAtY(y)
    if (row < 0 || row >= this.visible.length) return
    const nodeId = this.nodeOf(this.visible[row])
    if (this.tree.childCount[nodeId] > 0) this.toggle(nodeId)
  }

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault()
    if (!this.tree) return
    const { y } = this.localXY(e)
    const row = this.vp.rowAtY(y)
    if (row < 0 || row >= this.visible.length) return
    const nodeId = this.nodeOf(this.visible[row])
    this.selectedId = nodeId
    this.scheduleDraw()
    this.callbacks.onContextMenu?.(nodeId, e.clientX, e.clientY)
  }

  // X 键折叠/展开当前 hover 行所属容器 —— 仅鼠标在树上且焦点不在输入框时
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'x' && e.key !== 'X') return
    if (this.hoverIndex < 0 || this.hoverIndex >= this.visible.length) return
    const ae = document.activeElement
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return
    e.preventDefault()
    this.toggle(this.nodeOf(this.visible[this.hoverIndex]))
  }

  private localXY(e: MouseEvent | PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  private bindEvents(): void {
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.canvas.addEventListener('dblclick', this.onDblClick)
    this.canvas.addEventListener('contextmenu', this.onContextMenu)
    this.canvas.addEventListener('auxclick', this.preventAux)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('rex-theme-sync', this.onThemeSync)
  }

  // 屏蔽中键的默认自动滚动
  private preventAux = (e: MouseEvent): void => {
    if (e.button === 1) e.preventDefault()
  }

  // 主题切换时同步重绘(读新 CSS 变量 + 立即 draw, 不走 rAF)—— 让新主题进 View Transition 快照.
  private onThemeSync = (): void => {
    this.theme = readCanvasTheme(this.canvas)
    this.themeDirty = false
    this.draw()
  }

  private unbindEvents(): void {
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('dblclick', this.onDblClick)
    this.canvas.removeEventListener('contextmenu', this.onContextMenu)
    this.canvas.removeEventListener('auxclick', this.preventAux)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('rex-theme-sync', this.onThemeSync)
  }
}
