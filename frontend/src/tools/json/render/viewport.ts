export interface ScrollbarGeom {
  visible: boolean
  x: number
  y: number
  w: number
  h: number
  track: number
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * CanvasViewport 管纯粹的虚拟滚动几何: 双向 scroll / 可视行区间 / 双向滚动条 thumb / y→行命中.
 * 不碰内容绘制, 让 TreeRenderer 与 DiffRenderer 共用同一套滚动数学.
 */
export class CanvasViewport {
  scrollTop = 0
  scrollLeft = 0
  totalRows = 0
  contentWidth = 0
  viewWidth = 0
  viewHeight = 0

  constructor(
    public rowHeight: number,
    private scrollbarWidth: number,
  ) {}

  get contentHeight(): number {
    return this.totalRows * this.rowHeight
  }
  get maxScroll(): number {
    return Math.max(0, this.contentHeight - this.viewHeight)
  }
  get maxScrollX(): number {
    return Math.max(0, this.contentWidth - this.viewWidth)
  }

  setScrollTop(v: number): void {
    this.scrollTop = clamp(v, 0, this.maxScroll)
  }
  setScrollLeft(v: number): void {
    this.scrollLeft = clamp(v, 0, this.maxScrollX)
  }
  scrollBy(dy: number): void {
    this.setScrollTop(this.scrollTop + dy)
  }
  scrollByX(dx: number): void {
    this.setScrollLeft(this.scrollLeft + dx)
  }

  firstVisible(): number {
    return Math.max(0, Math.floor(this.scrollTop / this.rowHeight))
  }
  lastVisible(): number {
    return Math.min(this.totalRows, Math.ceil((this.scrollTop + this.viewHeight) / this.rowHeight) + 1)
  }

  /**
   * rowAtY 把 canvas 内的 y 坐标换算成行下标(可能越界, 调用方需校验 < totalRows).
   */
  rowAtY(y: number): number {
    return Math.floor((y + this.scrollTop) / this.rowHeight)
  }

  /**
   * scrollToRow 把指定行滚到可视区. align=center 居中, 否则贴顶.
   */
  scrollToRow(index: number, align: 'top' | 'center' = 'center'): void {
    const top =
      align === 'center'
        ? index * this.rowHeight - this.viewHeight / 2 + this.rowHeight / 2
        : index * this.rowHeight
    this.setScrollTop(top)
  }

  // 竖向滚动条(右侧). track 高度留出底部横条空间.
  scrollbarV(): ScrollbarGeom {
    const contentH = this.contentHeight
    if (contentH <= this.viewHeight || this.viewHeight === 0) {
      return { visible: false, x: 0, y: 0, w: 0, h: 0, track: 0 }
    }
    const track = this.viewHeight
    const thumbH = Math.max(28, (this.viewHeight / contentH) * track)
    const maxThumbY = track - thumbH
    const thumbY = this.maxScroll > 0 ? (this.scrollTop / this.maxScroll) * maxThumbY : 0
    const w = this.scrollbarWidth
    return { visible: true, x: this.viewWidth - w - 2, y: thumbY, w, h: thumbH, track }
  }

  // 横向滚动条(底部).
  scrollbarH(): ScrollbarGeom {
    const contentW = this.contentWidth
    if (contentW <= this.viewWidth || this.viewWidth === 0) {
      return { visible: false, x: 0, y: 0, w: 0, h: 0, track: 0 }
    }
    const track = this.viewWidth
    const thumbW = Math.max(28, (this.viewWidth / contentW) * track)
    const maxThumbX = track - thumbW
    const thumbX = this.maxScrollX > 0 ? (this.scrollLeft / this.maxScrollX) * maxThumbX : 0
    const h = this.scrollbarWidth
    return { visible: true, x: thumbX, y: this.viewHeight - h - 2, w: thumbW, h, track }
  }

  scrollToThumbY(thumbTopY: number): void {
    const bar = this.scrollbarV()
    if (!bar.visible) return
    const maxThumbY = bar.track - bar.h
    if (maxThumbY <= 0) return
    this.setScrollTop(clamp(thumbTopY / maxThumbY, 0, 1) * this.maxScroll)
  }

  scrollToThumbX(thumbLeftX: number): void {
    const bar = this.scrollbarH()
    if (!bar.visible) return
    const maxThumbX = bar.track - bar.w
    if (maxThumbX <= 0) return
    this.setScrollLeft(clamp(thumbLeftX / maxThumbX, 0, 1) * this.maxScrollX)
  }
}
