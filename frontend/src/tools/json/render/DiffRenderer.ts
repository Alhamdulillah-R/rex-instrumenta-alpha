import type { DiffRow, DiffStatus } from '../core/diff'
import { CanvasViewport, type ScrollbarGeom } from './viewport'
import { readCanvasTheme, type CanvasTheme } from './theme'
import {
  ROW_HEIGHT,
  INDENT,
  PAD_LEFT,
  PAD_RIGHT,
  FONT_SIZE,
  MONO_FAMILY,
  SCROLLBAR_W,
  SCALE_MIN,
  SCALE_MAX,
} from './layout'

export type DiffFilter = 'all' | DiffStatus

export interface DiffRendererCallbacks {
  onSelect?: (rowIndex: number) => void
}

interface Metrics {
  rowH: number
  indent: number
  padLeft: number
  fontPx: number
}

/**
 * DiffRenderer 把 Go 后端的展平 diff 行虚拟渲染到 canvas: 按 status 着色, changed 显示
 * "左 → 右". 支持按状态过滤 + 双向滚动 + Ctrl+滚轮缩放. 配色在 rAF draw 内读(主题响应稳).
 */
export class DiffRenderer {
  private ctx: CanvasRenderingContext2D
  private vp: CanvasViewport
  private theme: CanvasTheme
  private themeDirty = false

  private rows: DiffRow[] = []
  private visible: Int32Array = new Int32Array(0)
  private filter: DiffFilter = 'all'
  private selectedIdx = -1
  private hoverIndex = -1
  private maxContentWidth = 0

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
    private callbacks: DiffRendererCallbacks = {},
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

  setRows(rows: DiffRow[]): void {
    this.rows = rows
    this.selectedIdx = -1
    this.hoverIndex = -1
    this.maxContentWidth = 0
    this.vp.setScrollTop(0)
    this.vp.setScrollLeft(0)
    this.applyFilter()
  }

  setFilter(filter: DiffFilter): void {
    this.filter = filter
    this.applyFilter()
  }

  recolor(): void {
    this.themeDirty = true
    this.scheduleDraw()
  }

  destroy(): void {
    this.ro.disconnect()
    this.unbindEvents()
  }

  private computeMetrics(scale: number): Metrics {
    return {
      rowH: Math.round(ROW_HEIGHT * scale),
      indent: INDENT * scale,
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
    this.maxContentWidth = 0
    this.vp.setScrollTop(this.vp.scrollTop)
    this.scheduleDraw()
  }

  private applyFilter(): void {
    const buf = new Int32Array(this.rows.length)
    let n = 0
    for (let i = 0; i < this.rows.length; i++) {
      if (this.filter === 'all' || this.rows[i].status === this.filter) buf[n++] = i
    }
    this.visible = buf.subarray(0, n)
    this.vp.totalRows = n
    this.vp.setScrollTop(this.vp.scrollTop)
    this.scheduleDraw()
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
    // 同步重绘消除 resize 空帧(详见 TreeRenderer.resize)
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
    if (this.visible.length === 0) return

    ctx.font = `${this.m.fontPx}px ${MONO_FAMILY}`
    ctx.textBaseline = 'middle'

    const first = this.vp.firstVisible()
    const last = this.vp.lastVisible()
    for (let i = first; i < last; i++) {
      this.drawRow(this.rows[this.visible[i]], i)
    }

    this.vp.contentWidth = this.maxContentWidth
    this.vp.setScrollLeft(this.vp.scrollLeft)
    this.drawBar(this.vp.scrollbarV())
    this.drawBar(this.vp.scrollbarH())
  }

  private drawRow(row: DiffRow, visIndex: number): void {
    const ctx = this.ctx
    const rowH = this.m.rowH
    const sx = this.vp.scrollLeft
    const y = visIndex * rowH - this.vp.scrollTop
    const cy = y + rowH / 2

    const bg = this.bgFor(row.status, this.visible[visIndex] === this.selectedIdx, visIndex)
    if (bg) {
      ctx.fillStyle = bg
      ctx.fillRect(0, y, this.vp.viewWidth, rowH)
    }

    // 状态左缘条 — 固定不随横滚, 始终可见
    ctx.fillStyle = this.fgFor(row.status)
    ctx.fillRect(0, y, 3, rowH)

    ctx.strokeStyle = this.theme.guide
    ctx.lineWidth = 1
    for (let level = 0; level < row.depth; level++) {
      const gx = Math.round(this.m.padLeft + level * this.m.indent + this.m.indent / 2 - sx) + 0.5
      ctx.beginPath()
      ctx.moveTo(gx, y)
      ctx.lineTo(gx, y + rowH)
      ctx.stroke()
    }

    let x = this.m.padLeft + row.depth * this.m.indent + 4
    x = this.text(row.key, x, cy, this.theme.key)
    x = this.text(': ', x, cy, this.theme.punct)

    if (row.status === 'changed') {
      x = this.text(row.left || '∅', x, cy, this.theme.diffRemovedFg)
      x = this.text('  →  ', x, cy, this.theme.punct)
      x = this.text(row.right || '∅', x, cy, this.theme.diffAddedFg)
    } else if (row.status === 'added') {
      x = this.text(row.right, x, cy, this.theme.diffAddedFg)
    } else if (row.status === 'removed') {
      x = this.text(row.left, x, cy, this.theme.diffRemovedFg)
    } else {
      x = this.text(row.left, x, cy, this.theme.diffSame)
    }

    const right = x + PAD_RIGHT
    if (right > this.maxContentWidth) this.maxContentWidth = right
  }

  private bgFor(status: DiffStatus, selected: boolean, visIndex: number): string | null {
    if (selected) return this.theme.rowSelected
    if (visIndex === this.hoverIndex) return this.theme.rowHover
    switch (status) {
      case 'changed':
        return this.theme.diffChangedBg
      case 'added':
        return this.theme.diffAddedBg
      case 'removed':
        return this.theme.diffRemovedBg
      default:
        return null
    }
  }

  private fgFor(status: DiffStatus): string {
    switch (status) {
      case 'changed':
        return this.theme.diffChangedFg
      case 'added':
        return this.theme.diffAddedFg
      case 'removed':
        return this.theme.diffRemovedFg
      default:
        return 'transparent'
    }
  }

  private text(s: string, contentX: number, cy: number, color: string): number {
    const ctx = this.ctx
    ctx.fillStyle = color
    ctx.fillText(s, contentX - this.vp.scrollLeft, cy)
    return contentX + ctx.measureText(s).width
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
    const row = this.vp.rowAtY(y)
    if (row < 0 || row >= this.visible.length) return
    this.selectedIdx = this.visible[row]
    this.scheduleDraw()
    this.callbacks.onSelect?.(this.selectedIdx)
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

  private preventAux = (e: MouseEvent): void => {
    if (e.button === 1) e.preventDefault()
  }

  // 主题切换同步重绘, 进 View Transition 快照
  private onThemeSync = (): void => {
    this.theme = readCanvasTheme(this.canvas)
    this.themeDirty = false
    this.draw()
  }

  private localXY(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  private bindEvents(): void {
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.canvas.addEventListener('auxclick', this.preventAux)
    window.addEventListener('rex-theme-sync', this.onThemeSync)
  }

  private unbindEvents(): void {
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('auxclick', this.preventAux)
    window.removeEventListener('rex-theme-sync', this.onThemeSync)
  }
}
