import type { DiffRow, DiffStatus } from '../core/diff'
import { inlineDiff, type InlineDiff } from '../core/inlineDiff'
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

export interface SideBySideCallbacks {
  onSelect?: (rowIndex: number) => void
}

const GUTTER_W = 26

interface Metrics {
  rowH: number
  indent: number
  padLeft: number
  fontPx: number
}

interface PaneGeom {
  leftX: number
  gutterX: number
  rightX: number
  paneW: number
}

/**
 * SideBySideRenderer 把展平 diff 行虚拟渲染成 PyCharm 风格并排 canvas:
 * 定高行 → 只画可视区(上万行不卡); 左右两栏 + 中间状态带; 容器画 { / [ + 缩进引导线;
 * changed 行做字符级 inline 高亮; 点击选中回调原始行号(供"设为主键"等用).
 */
export class SideBySideRenderer {
  private ctx: CanvasRenderingContext2D
  private vp: CanvasViewport
  private theme: CanvasTheme
  private themeDirty = false

  private rows: DiffRow[] = []
  private visible: Int32Array = new Int32Array(0)
  private filter: DiffFilter = 'all'
  private selectedIdx = -1
  private hoverIndex = -1

  private sx = 0 // 水平滚动(两栏共享)
  private maxRowW = 0
  private inlineCache = new Map<number, InlineDiff>()

  private scale = 1
  private m: Metrics = this.computeMetrics(1)

  private dpr = 1
  private rafScheduled = false
  private dragV = false
  private dragH = false
  private dragOffset = 0
  private frozen = false
  private freezeTimer: number | undefined
  private ro: ResizeObserver

  constructor(
    private canvas: HTMLCanvasElement,
    private callbacks: SideBySideCallbacks = {},
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

  setRows(rows: DiffRow[]): void {
    this.rows = rows
    this.selectedIdx = -1
    this.hoverIndex = -1
    this.maxRowW = 0
    this.sx = 0
    this.inlineCache.clear()
    this.vp.setScrollTop(0)
    this.applyFilter()
  }

  setFilter(filter: DiffFilter): void {
    if (filter === this.filter) return
    this.filter = filter
    this.vp.setScrollTop(0)
    this.applyFilter()
  }

  setSelected(idx: number): void {
    if (idx === this.selectedIdx) return
    this.selectedIdx = idx
    this.scheduleDraw()
  }

  recolor(): void {
    this.themeDirty = true
    this.scheduleDraw()
  }

  destroy(): void {
    window.clearTimeout(this.freezeTimer)
    this.ro.disconnect()
    this.unbindEvents()
  }

  // ─── 缩放 ───

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
    this.maxRowW = 0
    this.vp.setScrollTop(this.vp.scrollTop)
    this.scheduleDraw()
  }

  // ─── 过滤 / 几何 ───

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

  private paneGeom(): PaneGeom {
    const w = this.vp.viewWidth
    const paneW = Math.max(40, Math.floor((w - GUTTER_W - SCROLLBAR_W - 8) / 2))
    return { leftX: 0, gutterX: paneW, rightX: paneW + GUTTER_W, paneW }
  }

  private get maxSX(): number {
    return Math.max(0, this.maxRowW - this.paneGeom().paneW)
  }

  private resize(): void {
    if (this.frozen) return // 沉浸动画期间冻结, 不每帧重建后备缓冲
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(0, Math.floor(rect.width))
    const h = Math.max(0, Math.floor(rect.height))
    this.dpr = Math.max(1, Math.ceil(window.devicePixelRatio || 1))
    const bw = w * this.dpr
    const bh = h * this.dpr
    if (this.canvas.width !== bw) this.canvas.width = bw
    if (this.canvas.height !== bh) this.canvas.height = bh
    this.vp.viewWidth = w
    this.vp.viewHeight = h
    this.vp.setScrollTop(this.vp.scrollTop)
    this.draw()
  }

  // onFreeze 收到沉浸切换信号: 钉住 canvas 当前像素尺寸(避免被 CSS 拉伸), 动画期间忽略
  // ResizeObserver(不重建后备缓冲), 结束后只 resize 一次. 这是按 Q 卡顿的根治.
  private onFreeze = (e: Event): void => {
    const ms = (e as CustomEvent<{ ms?: number }>).detail?.ms ?? 500
    if (!this.frozen) {
      const rect = this.canvas.getBoundingClientRect()
      this.canvas.style.width = rect.width + 'px'
      this.canvas.style.height = rect.height + 'px'
      this.frozen = true
      this.draw() // 冻结后重画一帧(去掉滚动条), 让淡出的旧内容不带旧滚动条
      // 淡出: 旧内容 1→0. 用 WAAPI 而非 CSS transition —— 后者同帧改样式不触发, 正是"闪烁"的根因.
      // animate(fill:none) 结束后回落到 base, 故把 base opacity 钉成 0, 保持透明直到 settle.
      this.canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease' })
      this.canvas.style.opacity = '0'
    }
    window.clearTimeout(this.freezeTimer)
    this.freezeTimer = window.setTimeout(() => {
      this.frozen = false
      this.canvas.style.width = ''
      this.canvas.style.height = ''
      this.resize() // 按新尺寸重建+重画一次(此时仍透明, 用户看不到硬切)
      // 淡入: 新内容 0→1. base 清回默认(=1), animate 跑完正好落在 1, 不留残留 inline 样式.
      this.canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' })
      this.canvas.style.opacity = ''
    }, ms)
  }

  private scheduleDraw(): void {
    if (this.rafScheduled) return
    this.rafScheduled = true
    requestAnimationFrame(() => {
      this.rafScheduled = false
      this.draw()
    })
  }

  // ─── 绘制 ───

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

    const g = this.paneGeom()
    const rowH = this.m.rowH
    const first = this.vp.firstVisible()
    const last = this.vp.lastVisible()

    // pass 1: 背景 / 状态条 / gutter 带 / 选中
    for (let i = first; i < last; i++) {
      const orig = this.visible[i]
      const row = this.rows[orig]
      const y = i * rowH - this.vp.scrollTop
      const selected = orig === this.selectedIdx
      const hover = i === this.hoverIndex

      this.paneBg(g.leftX, g.paneW, y, rowH, row.status, this.leftPresent(row), selected, hover)
      this.paneBg(g.rightX, g.paneW, y, rowH, row.status, this.rightPresent(row), selected, hover)

      // 中间状态带 — 连起左右差异
      if (row.status !== 'same') {
        ctx.fillStyle = this.bandColor(row.status)
        ctx.fillRect(g.gutterX, y, GUTTER_W, rowH)
      }
    }

    // 中缝竖线
    ctx.strokeStyle = this.theme.guide
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(Math.round(g.gutterX) + 0.5, 0)
    ctx.lineTo(Math.round(g.gutterX) + 0.5, h)
    ctx.moveTo(Math.round(g.rightX) + 0.5, 0)
    ctx.lineTo(Math.round(g.rightX) + 0.5, h)
    ctx.stroke()

    // pass 2: 左栏内容(裁剪到左栏区)
    this.drawPane(g.leftX, g.paneW, 'left', first, last)
    // pass 3: 右栏内容
    this.drawPane(g.rightX, g.paneW, 'right', first, last)

    this.vp.contentWidth = this.maxRowW
    // 冻结期间(沉浸动画)不画滚动条 —— 否则旧尺寸滚动条会卡在变大后容器中间, 结束再瞬移
    if (!this.frozen) {
      this.drawBar(this.vp.scrollbarV())
      this.drawHBar()
    }
  }

  private drawPane(px: number, pw: number, side: 'left' | 'right', first: number, last: number): void {
    const ctx = this.ctx
    const rowH = this.m.rowH
    ctx.save()
    ctx.beginPath()
    ctx.rect(px, 0, pw, this.vp.viewHeight)
    ctx.clip()
    for (let i = first; i < last; i++) {
      const orig = this.visible[i]
      const row = this.rows[orig]
      const present = side === 'left' ? this.leftPresent(row) : this.rightPresent(row)
      if (!present) continue
      const y = i * rowH - this.vp.scrollTop
      this.drawSide(row, orig, side, px, y)
    }
    ctx.restore()
  }

  private drawSide(row: DiffRow, orig: number, side: 'left' | 'right', px: number, y: number): void {
    const ctx = this.ctx
    const cy = y + this.m.rowH / 2
    const sx = this.sx

    // 缩进引导线
    ctx.strokeStyle = this.theme.guide
    ctx.lineWidth = 1
    for (let level = 0; level < row.depth; level++) {
      const gx = Math.round(px + this.m.padLeft + level * this.m.indent + this.m.indent / 2 - sx) + 0.5
      ctx.beginPath()
      ctx.moveTo(gx, y)
      ctx.lineTo(gx, y + this.m.rowH)
      ctx.stroke()
    }

    let x = px + this.m.padLeft + row.depth * this.m.indent + 4 - sx
    x = this.text(row.key, x, cy, this.theme.key)
    x = this.text(': ', x, cy, this.theme.punct)

    if (this.isContainer(row)) {
      x = this.text(this.braceOf(row), x, cy, this.theme.punct)
    } else {
      x = this.drawValue(row, orig, side, x, cy)
    }

    const contentW = x + sx - px + PAD_RIGHT
    if (contentW > this.maxRowW) this.maxRowW = contentW
  }

  // drawValue 画叶子值: changed 行做字符级高亮; added/removed 用状态色; same 按类型上色.
  private drawValue(row: DiffRow, orig: number, side: 'left' | 'right', x: number, cy: number): number {
    const val = side === 'left' ? row.left : row.right

    if (row.status === 'changed' && row.left && row.right) {
      const segs = this.inlineSegs(orig)[side]
      const fg = side === 'left' ? this.theme.diffRemovedFg : this.theme.diffAddedFg
      const bg = side === 'left' ? this.theme.diffRemovedBg : this.theme.diffAddedBg
      for (const seg of segs) {
        const w = this.ctx.measureText(seg.text).width
        if (seg.status === 'diff') {
          this.ctx.fillStyle = bg
          this.ctx.fillRect(x, cy - this.m.rowH / 2 + 2, w, this.m.rowH - 4)
        }
        this.ctx.fillStyle = fg
        this.ctx.fillText(seg.text, x, cy)
        x += w
      }
      return x
    }

    const color =
      row.status === 'added'
        ? this.theme.diffAddedFg
        : row.status === 'removed'
          ? this.theme.diffRemovedFg
          : this.colorForKind(row.kind)
    return this.text(val, x, cy, color)
  }

  private inlineSegs(orig: number): InlineDiff {
    let d = this.inlineCache.get(orig)
    if (!d) {
      const row = this.rows[orig]
      d = inlineDiff(row.left, row.right)
      this.inlineCache.set(orig, d)
    }
    return d
  }

  // 容器背景 + 状态左条 + 选中
  private paneBg(
    px: number,
    pw: number,
    y: number,
    rowH: number,
    status: DiffStatus,
    present: boolean,
    selected: boolean,
    hover: boolean,
  ): void {
    const ctx = this.ctx
    let bg: string | null = null
    if (selected) bg = this.theme.rowSelected
    else if (hover) bg = this.theme.rowHover
    else if (present && status !== 'same') bg = this.bandColor(status)
    if (bg) {
      ctx.fillStyle = bg
      ctx.fillRect(px, y, pw, rowH)
    }
    // 状态左条
    if (present && status !== 'same') {
      ctx.fillStyle = this.fgFor(status)
      ctx.fillRect(px, y, 2, rowH)
    }
    // 选中主色条压在最上
    if (selected) {
      ctx.fillStyle = this.theme.guideActive
      ctx.fillRect(px, y, 2, rowH)
    }
  }

  private isContainer(row: DiffRow): boolean {
    return row.kind === 'object' || row.kind === 'array'
  }

  private braceOf(row: DiffRow): string {
    const empty = row.childCount === 0
    if (row.kind === 'array') return empty ? '[]' : '['
    return empty ? '{}' : '{'
  }

  private leftPresent(row: DiffRow): boolean {
    return row.status !== 'added'
  }
  private rightPresent(row: DiffRow): boolean {
    return row.status !== 'removed'
  }

  private bandColor(status: DiffStatus): string {
    switch (status) {
      case 'changed':
        return this.theme.diffChangedBg
      case 'added':
        return this.theme.diffAddedBg
      case 'removed':
        return this.theme.diffRemovedBg
      default:
        return 'transparent'
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

  private colorForKind(kind: string): string {
    switch (kind) {
      case 'string':
        return this.theme.string
      case 'number':
        return this.theme.number
      case 'bool':
        return this.theme.bool
      case 'null':
        return this.theme.null
      default:
        return this.theme.onSurface
    }
  }

  private text(s: string, x: number, cy: number, color: string): number {
    if (!s) return x
    this.ctx.fillStyle = color
    this.ctx.fillText(s, x, cy)
    return x + this.ctx.measureText(s).width
  }

  // ─── 滚动条 ───

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

  // 横向滚动条(两栏共享, 底部). 自管几何, 因 viewport 的横条按整宽算, 跟分栏宽度对不上.
  private hBar(): ScrollbarGeom {
    const g = this.paneGeom()
    const max = this.maxSX
    const trackW = g.rightX + g.paneW
    if (max <= 0 || this.maxRowW <= 0) return { visible: false, x: 0, y: 0, w: 0, h: 0, track: 0 }
    const thumbW = Math.max(28, (g.paneW / this.maxRowW) * trackW)
    const maxThumbX = trackW - thumbW
    const x = max > 0 ? (this.sx / max) * maxThumbX : 0
    return { visible: true, x, y: this.vp.viewHeight - SCROLLBAR_W - 2, w: thumbW, h: SCROLLBAR_W, track: trackW }
  }

  private drawHBar(): void {
    this.drawBar(this.hBar())
  }

  private setSX(v: number): void {
    this.sx = Math.min(this.maxSX, Math.max(0, v))
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
      this.setSX(this.sx + e.deltaY * step)
    } else {
      this.vp.scrollBy(e.deltaY * step)
      if (e.deltaX) this.setSX(this.sx + e.deltaX * step)
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
    const hbar = this.hBar()
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
      const hbar = this.hBar()
      const maxThumbX = hbar.track - hbar.w
      if (maxThumbX > 0) this.setSX(((x - this.dragOffset) / maxThumbX) * this.maxSX)
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
    window.addEventListener('rex-canvas-freeze', this.onFreeze)
  }

  private unbindEvents(): void {
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('auxclick', this.preventAux)
    window.removeEventListener('rex-theme-sync', this.onThemeSync)
    window.removeEventListener('rex-canvas-freeze', this.onFreeze)
  }
}
