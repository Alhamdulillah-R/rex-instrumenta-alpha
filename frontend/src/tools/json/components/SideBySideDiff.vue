<template>
  <div class="rex-sbs">
    <div class="rex-sbs__main">
      <!-- 左面板 -->
      <div ref="leftEl" class="rex-sbs__pane rex-sbs__pane--left" @scroll="onScroll($event, 'left')">
        <div
          v-for="(r, idx) in filteredRows"
          :key="`L${idx}`"
          :ref="(el) => setLeftRowRef(el as HTMLElement | null, idx)"
          class="rex-sbs__row"
          :class="rowClass(r, idx, 'left')"
          @click="onRowClick(idx)"
        >
          <span class="rex-sbs__ln">{{ leftLine(r, idx) }}</span>
          <span class="rex-sbs__content" :style="{ paddingLeft: 4 + r.depth * 14 + 'px' }">
            <template v-if="r.status === 'added'">
              <span class="rex-sbs__placeholder">&nbsp;</span>
            </template>
            <template v-else>
              <span class="rex-sbs__key">{{ r.key }}</span>
              <span v-if="r.left" class="rex-sbs__sep">:</span>
              <span v-if="r.left && getSegs(idx, 'left')" class="rex-sbs__val">
                <span
                  v-for="(seg, k) in getSegs(idx, 'left')"
                  :key="k"
                  :class="seg.status === 'diff' ? 'rex-sbs__inline-diff status-changed' : null"
                >{{ seg.text }}</span>
              </span>
              <span v-else-if="r.left" class="rex-sbs__val">{{ prettyVal(r.left) }}</span>
              <span v-else-if="r.hasChildren" class="rex-sbs__dim">{{ containerTag(r.kind, r.childCount) }}</span>
            </template>
          </span>
        </div>
      </div>

      <!-- 中间斜领带 — SVG polygon 填充梯形, 行高差异时左右上下沿连成斜边.
           面积本身就是差异关系的可视化, 无需"找线". 滚动时屏幕相对坐标实时变形. -->
      <div ref="gutterEl" class="rex-sbs__gutter">
        <svg :width="GUTTER_W" :height="viewportH" :viewBox="`0 0 ${GUTTER_W} ${viewportH}`" preserveAspectRatio="none">
          <polygon
            v-for="(s, i) in shapes"
            :key="i"
            :points="s.points"
            :class="`rex-sbs__band status-${s.status}`"
          />
        </svg>
      </div>

      <!-- 右面板 -->
      <div ref="rightEl" class="rex-sbs__pane rex-sbs__pane--right" @scroll="onScroll($event, 'right')">
        <div
          v-for="(r, idx) in filteredRows"
          :key="`R${idx}`"
          :ref="(el) => setRightRowRef(el as HTMLElement | null, idx)"
          class="rex-sbs__row"
          :class="rowClass(r, idx, 'right')"
          @click="onRowClick(idx)"
        >
          <span class="rex-sbs__ln">{{ rightLine(r, idx) }}</span>
          <span class="rex-sbs__content" :style="{ paddingLeft: 4 + r.depth * 14 + 'px' }">
            <template v-if="r.status === 'removed'">
              <span class="rex-sbs__placeholder">&nbsp;</span>
            </template>
            <template v-else>
              <span class="rex-sbs__key">{{ r.key }}</span>
              <span v-if="r.right" class="rex-sbs__sep">:</span>
              <span v-if="r.right && getSegs(idx, 'right')" class="rex-sbs__val">
                <span
                  v-for="(seg, k) in getSegs(idx, 'right')"
                  :key="k"
                  :class="seg.status === 'diff' ? 'rex-sbs__inline-diff status-changed' : null"
                >{{ seg.text }}</span>
              </span>
              <span v-else-if="r.right" class="rex-sbs__val">{{ prettyVal(r.right) }}</span>
              <span v-else-if="r.hasChildren" class="rex-sbs__dim">{{ containerTag(r.kind, r.childCount) }}</span>
            </template>
          </span>
        </div>
      </div>

      <!-- Minimap: 按真实像素位置标差异 + thumb 准确反映 viewport, 点击/拖拽跳转 -->
      <div ref="minimapEl" class="rex-sbs__minimap" @mousedown="onMinimapDown" @click="onMinimapClick">
        <div
          v-for="(m, i) in minimapMarks"
          :key="i"
          class="rex-sbs__mm-mark"
          :class="`status-${m.status}`"
          :style="{ top: m.top + '%', height: m.height + '%' }"
          :title="`${m.status} @ row ${m.idx + 1}`"
        />
        <div
          v-if="thumbVisible"
          class="rex-sbs__mm-thumb"
          :style="{ top: thumbTop + '%', height: thumbHeight + '%' }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import type { DiffRow } from '../core/diff'
import type { DiffFilter } from '../render/DiffRenderer'
import { inlineDiff, type InlineSeg } from '../core/inlineDiff'

const props = defineProps<{
  rows: DiffRow[]
  filter: DiffFilter
  selectedIdx?: number
  isDark: boolean
}>()

const emit = defineEmits<{ select: [idx: number] }>()

const GUTTER_W = 32

const leftEl = ref<HTMLDivElement | null>(null)
const rightEl = ref<HTMLDivElement | null>(null)
const gutterEl = ref<HTMLDivElement | null>(null)
const minimapEl = ref<HTMLDivElement | null>(null)

const leftRowRefs = new Map<number, HTMLElement>()
const rightRowRefs = new Map<number, HTMLElement>()
function setLeftRowRef(el: HTMLElement | null, idx: number) {
  if (el) leftRowRefs.set(idx, el)
  else leftRowRefs.delete(idx)
}
function setRightRowRef(el: HTMLElement | null, idx: number) {
  if (el) rightRowRefs.set(idx, el)
  else rightRowRefs.delete(idx)
}

const scrollTop = ref(0) // = leftScrollTop, 给 minimap thumb 用
const leftScrollTop = ref(0)
const rightScrollTop = ref(0)
const viewportH = ref(0)
const contentH = ref(0)

// alignment sync 用: 同步设置完 scrollTop 后, 浏览器会异步派发 scroll event,
// 那一次 event 是被动同步触发的, 用 expected 值识别并跳过, 防止反向递归同步
let expectedLeftTop: number | null = null
let expectedRightTop: number | null = null

// 让 shapes / minimapMarks 能在尺寸变化时重算 — offsetTop 不是 reactive 的, 用 token 触发
const measureToken = ref(0)
function bumpMeasure() {
  measureToken.value++
}

let ro: ResizeObserver | null = null

const filteredRows = computed(() => {
  if (props.filter === 'all') return props.rows
  return props.rows.filter((r) => r.status === props.filter)
})

// 斜领带形状: polygon 填充梯形, 屏幕相对坐标 (offsetTop - paneScrollTop),
// 左右行高不同 → 自然形成梯形/三角; gap collapse 让单侧块对侧收成一点 → 三角形
const shapes = computed(() => {
  measureToken.value
  const lScroll = leftScrollTop.value
  const rScroll = rightScrollTop.value
  const vH = viewportH.value
  const out: { points: string; status: string }[] = []
  for (let i = 0; i < filteredRows.value.length; i++) {
    const r = filteredRows.value[i]
    if (r.status === 'same') continue
    const lr = leftRowRefs.get(i)
    const rr = rightRowRefs.get(i)
    if (!lr || !rr) continue
    const lt = lr.offsetTop - lScroll
    const lb = lt + lr.offsetHeight
    const rt = rr.offsetTop - rScroll
    const rb = rt + rr.offsetHeight
    if ((lb < 0 && rb < 0) || (lt > vH && rt > vH)) continue
    out.push({
      points: `0,${lt} ${GUTTER_W},${rt} ${GUTTER_W},${rb} 0,${lb}`,
      status: r.status,
    })
  }
  return out
})

// Minimap 用左 pane 单一基准 — leftScrollH 当总高, 这样 mark/thumb/真实滚动完全对齐
const minimapMarks = computed(() => {
  measureToken.value
  const sh = contentH.value
  if (sh <= 0) return [] as { top: number; height: number; status: string; idx: number }[]
  const out: { top: number; height: number; status: string; idx: number }[] = []
  for (let i = 0; i < filteredRows.value.length; i++) {
    const s = filteredRows.value[i].status
    if (s === 'same') continue
    const lr = leftRowRefs.get(i)
    if (!lr) continue
    const top = (lr.offsetTop / sh) * 100
    const h = Math.max(0.6, (lr.offsetHeight / sh) * 100)
    out.push({ top, height: h, status: s, idx: i })
  }
  return out
})

// Alignment 同步: 把每个 row 的 (leftY, rightY) 当锚点, leftY → rightY 按线性插值映射.
// 落在两个 row 锚点之间时, 按高度比例插值, 这样 same row 永远在同一水平 y 坐标对齐
const anchors = computed(() => {
  measureToken.value
  const arr: { left: number; right: number }[] = []
  for (let i = 0; i < filteredRows.value.length; i++) {
    const lr = leftRowRefs.get(i)
    const rr = rightRowRefs.get(i)
    if (!lr || !rr) continue
    arr.push({ left: lr.offsetTop, right: rr.offsetTop })
  }
  // 终点锚: 各自 scrollHeight, 让滚到底时也插值正确
  if (leftEl.value && rightEl.value) {
    arr.push({ left: leftEl.value.scrollHeight, right: rightEl.value.scrollHeight })
  }
  return arr
})

function interpAnchor(y: number, src: 'left' | 'right'): number {
  const pts = anchors.value
  if (!pts.length) return y
  const srcKey = src
  const dstKey = src === 'left' ? 'right' : 'left'
  // 二分: 找最大的 pts[i][src] ≤ y
  let lo = 0
  let hi = pts.length - 1
  if (y <= pts[0][srcKey]) return pts[0][dstKey]
  if (y >= pts[hi][srcKey]) return pts[hi][dstKey]
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (pts[mid][srcKey] <= y) lo = mid
    else hi = mid - 1
  }
  const a = pts[lo]
  const b = pts[Math.min(lo + 1, pts.length - 1)]
  const span = b[srcKey] - a[srcKey]
  if (span === 0) return a[dstKey]
  const t = (y - a[srcKey]) / span
  return a[dstKey] + t * (b[dstKey] - a[dstKey])
}

const thumbVisible = computed(() => contentH.value > viewportH.value + 4)
const thumbTop = computed(() =>
  contentH.value > 0 ? (scrollTop.value / contentH.value) * 100 : 0,
)
const thumbHeight = computed(() =>
  contentH.value > 0 ? (viewportH.value / contentH.value) * 100 : 100,
)

function leftLine(row: DiffRow, idx: number): string {
  return row.status === 'added' ? '' : String(idx + 1)
}
function rightLine(row: DiffRow, idx: number): string {
  return row.status === 'removed' ? '' : String(idx + 1)
}

// row click 触发 select, 但如果用户正在拖选文本(有 selection)就不打断 — 让选中复制流畅
function onRowClick(idx: number) {
  const sel = window.getSelection()
  if (sel && sel.toString().length > 0) return
  emit('select', idx)
}

function rowClass(row: DiffRow, idx: number, side: 'left' | 'right'): string[] {
  const cls = [`status-${row.status}`]
  if (idx === props.selectedIdx) cls.push('selected')
  if (row.status === 'added' && side === 'left') cls.push('rex-sbs__row--gap')
  if (row.status === 'removed' && side === 'right') cls.push('rex-sbs__row--gap')
  // 差异 block 起点(上一行 same / 首行) + 终点(下一行 same / 末行) —
  // 起点画竖线 + 上边线, 终点画下边线, 跟中间梯形的上下沿连成一气, 视觉划清差异区段
  if (row.status !== 'same') {
    const prev = idx > 0 ? filteredRows.value[idx - 1] : null
    const next = idx < filteredRows.value.length - 1 ? filteredRows.value[idx + 1] : null
    if (!prev || prev.status === 'same') cls.push('rex-sbs__row--block-start')
    if (!next || next.status === 'same') cls.push('rex-sbs__row--block-end')
  }
  return cls
}

// 字符级 inline diff: 对标量 changed row 算左右段, 把不同字符段加深色背景.
// 容器值(以 { 或 [ 开头, prettyVal 会展开多行)跳过 — 多行字符串做字符级 diff 噪声大
const inlineSegsMap = computed(() => {
  const m = new Map<number, { left: InlineSeg[]; right: InlineSeg[] }>()
  for (let i = 0; i < filteredRows.value.length; i++) {
    const r = filteredRows.value[i]
    if (r.status !== 'changed') continue
    if (!r.left || !r.right) continue
    if (r.left[0] === '{' || r.left[0] === '[') continue
    if (r.right[0] === '{' || r.right[0] === '[') continue
    m.set(i, inlineDiff(r.left, r.right))
  }
  return m
})
function getSegs(idx: number, side: 'left' | 'right'): InlineSeg[] | null {
  const pair = inlineSegsMap.value.get(idx)
  return pair ? pair[side] : null
}

function prettyVal(s: string): string {
  if (!s) return s
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(s), null, 2)
    } catch {
      return s
    }
  }
  return s
}

function containerTag(kind: string, n: number): string {
  if (kind === 'object') return `{ ${n} }`
  if (kind === 'array') return `[ ${n} ]`
  return ''
}

// 滚动同步: 按 row 锚点插值 — left/right 同 idx row 永远在同一水平 y 坐标对齐.
// 不用 syncing 同步 flag(scroll event 异步派发, 同步 flag 早已失效), 改用 expected 值识别被动事件
function onScroll(e: Event, src: 'left' | 'right') {
  const top = (e.target as HTMLElement).scrollTop
  if (src === 'left') {
    // 这次 event 是上一次 right→left sync 触发的被动事件 → 只更新记录, 不反向同步
    if (expectedLeftTop !== null && Math.abs(top - expectedLeftTop) < 1.5) {
      expectedLeftTop = null
      leftScrollTop.value = top
      scrollTop.value = top
      bumpMeasure()
      return
    }
    leftScrollTop.value = top
    scrollTop.value = top
    const target = interpAnchor(top, 'left')
    if (rightEl.value && Math.abs(rightEl.value.scrollTop - target) > 1) {
      expectedRightTop = target
      rightEl.value.scrollTop = target
      rightScrollTop.value = rightEl.value.scrollTop
    }
  } else {
    if (expectedRightTop !== null && Math.abs(top - expectedRightTop) < 1.5) {
      expectedRightTop = null
      rightScrollTop.value = top
      bumpMeasure()
      return
    }
    rightScrollTop.value = top
    const target = interpAnchor(top, 'right')
    if (leftEl.value && Math.abs(leftEl.value.scrollTop - target) > 1) {
      expectedLeftTop = target
      leftEl.value.scrollTop = target
      leftScrollTop.value = leftEl.value.scrollTop
      scrollTop.value = leftEl.value.scrollTop
    }
  }
  bumpMeasure()
}

// minimap 跳转: 按真实像素 — clickY 比例 × scrollH = 目标 scrollTop(居中视口)
function jumpToRatio(ratio: number) {
  if (!leftEl.value) return
  const target = ratio * contentH.value - viewportH.value / 2
  leftEl.value.scrollTop = Math.max(0, Math.min(contentH.value - viewportH.value, target))
}

function onMinimapClick(e: MouseEvent) {
  if (!minimapEl.value) return
  const rect = minimapEl.value.getBoundingClientRect()
  jumpToRatio((e.clientY - rect.top) / rect.height)
}

let minimapDragging = false
function onMinimapDown(e: MouseEvent) {
  minimapDragging = true
  onMinimapClick(e)
  window.addEventListener('mousemove', onMinimapMove)
  window.addEventListener('mouseup', onMinimapUp, { once: true })
}
function onMinimapMove(e: MouseEvent) {
  if (minimapDragging) onMinimapClick(e)
}
function onMinimapUp() {
  minimapDragging = false
  window.removeEventListener('mousemove', onMinimapMove)
}

watch(
  () => [props.rows, props.filter],
  async () => {
    if (leftEl.value) leftEl.value.scrollTop = 0
    if (rightEl.value) rightEl.value.scrollTop = 0
    scrollTop.value = 0
    await nextTick()
    measureContent()
    bumpMeasure()
  },
)

watch(
  () => props.selectedIdx,
  (idx) => {
    if (idx === undefined || idx < 0) return
    const target = leftRowRefs.get(idx)
    if (!target || !leftEl.value) return
    const paneRect = leftEl.value.getBoundingClientRect()
    const rect = target.getBoundingClientRect()
    if (rect.top < paneRect.top + 10 || rect.bottom > paneRect.bottom - 10) {
      target.scrollIntoView({ block: 'center' })
    }
  },
)

function measureContent() {
  if (!leftEl.value || !rightEl.value) return
  viewportH.value = leftEl.value.clientHeight
  // Minimap / thumb 用 leftScrollH 单基准, 跟左侧滚动条 1:1 对应消除尺度失真
  contentH.value = leftEl.value.scrollHeight
}

onMounted(() => {
  if (!leftEl.value || !rightEl.value) return
  measureContent()
  bumpMeasure()
  ro = new ResizeObserver(() => {
    measureContent()
    bumpMeasure()
  })
  ro.observe(leftEl.value)
  ro.observe(rightEl.value)
  nextTick(() => {
    measureContent()
    bumpMeasure()
  })
})

onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('mousemove', onMinimapMove)
})
</script>
