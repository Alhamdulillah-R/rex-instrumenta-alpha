interface DissolveOpts {
  font: string
  color: string
  lineHeight: number
  padX: number
  padY: number
  glow?: boolean
  duration?: number
}

/**
 * dissolveText 在屏幕指定矩形处把多行文字渲染到一块临时 canvas, 再炸成光点向上飘散并淡出.
 * 用于进入沉浸模式时左侧输入文字的"碎片消散"特效. 纯 canvas overlay(fixed 定位, 不随原元素
 * collapse), 动画结束自动从 DOM 移除.
 * @param rect 目标屏幕矩形(通常是 textarea 展开态的 getBoundingClientRect)
 * @param text 文字内容(按 \n 分行, 只渲染矩形高度内能放下的行)
 * @param opts 字体 / 颜色 / 行高 / 内边距 / 是否发光 / 时长
 */
export function dissolveText(rect: DOMRect, text: string, opts: DissolveOpts): void {
  const dpr = window.devicePixelRatio || 1
  const w = Math.ceil(rect.width)
  const h = Math.ceil(rect.height)
  if (w < 4 || h < 4 || !text.trim()) return

  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  canvas.style.cssText =
    `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${w}px;height:${h}px;` +
    'pointer-events:none;z-index:5000;'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }
  ctx.scale(dpr, dpr)
  ctx.font = opts.font
  ctx.fillStyle = opts.color
  ctx.textBaseline = 'top'

  // 先把文字画到 canvas(只画矩形高度内放得下的行)
  const lines = text.split('\n')
  const maxLines = Math.max(1, Math.floor((h - opts.padY) / opts.lineHeight))
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    ctx.fillText(lines[i], opts.padX, opts.padY + i * opts.lineHeight)
  }

  // 采样不透明像素 → 粒子(每个粒子带一点随机初速, 整体偏上飘)
  const pw = canvas.width
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const particles: { x: number; y: number; vx: number; vy: number }[] = []
  const step = 3
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const idx = (Math.floor(y * dpr) * pw + Math.floor(x * dpr)) * 4
      if (data[idx + 3] > 130) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 1.3,
          vy: -Math.random() * 1.4 - 0.2,
        })
      }
    }
  }
  if (!particles.length) {
    canvas.remove()
    return
  }

  const duration = opts.duration ?? 850
  const start = performance.now()

  function frame(now: number): void {
    const t = (now - start) / duration
    if (t >= 1) {
      canvas.remove()
      return
    }
    ctx!.clearRect(0, 0, w, h)
    // 暗色主题用 lighter 叠加出"光"的感觉; 亮色正常绘制
    ctx!.globalCompositeOperation = opts.glow ? 'lighter' : 'source-over'
    ctx!.fillStyle = opts.color
    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.014 // 轻微重力: 先上飘后回落
      ctx!.globalAlpha = (1 - t) * (0.55 + Math.random() * 0.45) // 渐隐 + 闪烁
      ctx!.fillRect(p.x, p.y, 1.8, 1.8)
    }
    ctx!.globalAlpha = 1
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
