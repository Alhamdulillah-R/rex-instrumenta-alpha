<template>
  <div ref="rootEl" class="rex-compare" tabindex="-1" @keydown="onKeydown">
    <!-- 双输入 — 沉浸时整块收起 -->
    <div class="rex-compare__inputs">
      <section class="rex-compare__col">
        <textarea
          :value="leftText"
          class="rex-compare__textarea"
          spellcheck="false"
          placeholder="粘贴左侧 JSON…"
          @input="onTextInput('left', $event)"
          @keydown="onTextareaKeydown"
        />
        <v-btn
          class="rex-compare__col-open"
          size="x-small"
          variant="text"
          icon="mdi-folder-open-outline"
          title="打开文件到左侧"
          @click="openInto('left')"
        />
      </section>
      <section class="rex-compare__col">
        <textarea
          :value="rightText"
          class="rex-compare__textarea"
          spellcheck="false"
          placeholder="粘贴右侧 JSON…"
          @input="onTextInput('right', $event)"
          @keydown="onTextareaKeydown"
        />
        <v-btn
          class="rex-compare__col-open"
          size="x-small"
          variant="text"
          icon="mdi-folder-open-outline"
          title="打开文件到右侧"
          @click="openInto('right')"
        />
      </section>
    </div>

    <!-- 动作条 — 响应式对比, 不再需要"对比"主按钮; chips 在左侧主位置, 交换按钮靠右 -->
    <div class="rex-compare__bar">
      <CompareSummary v-if="result && !error && !immersive" :stats="result.stats" :filter="filter" @set-filter="filter = $event" />
      <v-progress-circular v-if="loading" size="14" width="2" indeterminate color="primary" class="rex-compare__spin" />
      <v-btn class="rex-compare__bar-swap" size="small" variant="text" prepend-icon="mdi-swap-horizontal" @click="swap">交换</v-btn>
    </div>

    <!-- 沉浸模式: chips teleport 到标题栏(与主题切换同一行), 跟解析 tab 的 actions 一致 -->
    <Teleport to="#rex-titlebar-actions" :disabled="!immersive || !active">
      <CompareSummary
        v-if="immersive && active && result && !error"
        class="rex-titlebar-chips"
        :stats="result.stats"
        :filter="filter"
        @set-filter="filter = $event"
      />
    </Teleport>

    <!-- 错误 -->
    <div v-if="error" class="rex-compare__error">
      <v-icon size="16">mdi-alert-circle-outline</v-icon>
      <span>{{ error }}</span>
    </div>

    <!-- diff 结果 — PyCharm 风格并排, 差异色块高亮 + 右侧 minimap 跳转 -->
    <div v-if="result && !error && result.rows.length" class="rex-compare__result">
      <SideBySideDiff
        :rows="result.rows"
        :filter="filter"
        :selected-idx="selectedRowIdx"
        :is-dark="isDark"
        @select="onSelect"
      />
      <div v-if="selectedRow" class="rex-parse__selbar">
        <span class="rex-parse__selpath" :title="selectedRow.path">{{ selectedRow.path }}</span>
        <v-btn size="x-small" variant="text" prepend-icon="mdi-map-marker-path" @click="copy(selectedRow.path, '已复制路径')">路径</v-btn>
        <v-btn size="x-small" variant="text" :disabled="!selectedRow.left" @click="copy(selectedRow.left, '已复制左值')">A 值</v-btn>
        <v-btn size="x-small" variant="text" :disabled="!selectedRow.right" @click="copy(selectedRow.right, '已复制右值')">B 值</v-btn>
      </div>
    </div>

    <!-- 空态 -->
    <div v-else-if="!error" class="rex-compare__empty">
      <v-icon size="40" color="primary">mdi-compare-horizontal</v-icon>
      <p>粘贴两份 JSON，点「对比」看结构化差异</p>
      <p class="rex-compare__empty-sub">差异在 Go 后端计算，大整数精度无损 · 一致 / 差异 / 仅左 / 仅右 可筛选</p>
    </div>

    <CopyToast :show="toast.show" :text="toast.text" :error="toast.error" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useImmersive } from '@/composables/useImmersive'
import SideBySideDiff from './SideBySideDiff.vue'
import CompareSummary from './CompareSummary.vue'
import CopyToast from './CopyToast.vue'
import type { DiffResult, DiffRow } from '../core/diff'
import type { DiffFilter } from '../render/DiffRenderer'
import { diffJson } from '../api'
import { copyText, openTextFile } from '@/platform/native'

const props = withDefaults(defineProps<{ isDark: boolean; active?: boolean }>(), { active: true })
// 给模板读 active 用(避免 unused 警告 + 跟 ParsePane 一致写法)
const active = computed(() => props.active)

const { immersive, toggle: toggleImmersive } = useImmersive()
const rootEl = ref<HTMLDivElement | null>(null)

// Q 切沉浸 — 仅在焦点不在 textarea/input 时(避免打字吃掉);
// Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 撤销 / 重做(整对左右快照)
function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
    return
  }
  if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault()
    redo()
    return
  }
  if (e.key !== 'q' && e.key !== 'Q') return
  const ae = document.activeElement
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return
  e.preventDefault()
  toggleImmersive()
}

// textarea 自己接 Ctrl+Z/Y — 拦掉浏览器原生 undo 走我们的栈, 同时 stopPropagation 防 ParsePane 的 window 监听误触发
function onTextareaKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
    e.preventDefault()
    e.stopPropagation()
    if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) undo()
    else redo()
  }
}

// ─── 撤销 / 重做: 整对 {left, right} 快照 ───
interface Snapshot { left: string; right: string }
const undoStack = ref<Snapshot[]>([])
const redoStack = ref<Snapshot[]>([])
const UNDO_LIMIT = 100
let editing = false
let editTimer: number | undefined

function pushUndo() {
  const snap: Snapshot = { left: leftText.value, right: rightText.value }
  const top = undoStack.value[undoStack.value.length - 1]
  if (top && top.left === snap.left && top.right === snap.right) return
  undoStack.value.push(snap)
  if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift()
  redoStack.value = []
}

function onTextInput(side: 'left' | 'right', e: Event) {
  // 编辑组开始 → 先记一份"编辑前"的快照, 连续打字合并成一个撤销单元
  if (!editing) {
    pushUndo()
    editing = true
  }
  const v = (e.target as HTMLTextAreaElement).value
  if (side === 'left') leftText.value = v
  else rightText.value = v
  window.clearTimeout(editTimer)
  editTimer = window.setTimeout(() => { editing = false }, 600)
}

function undo() {
  if (!undoStack.value.length) {
    showToast('没有可撤销的了', true)
    return
  }
  redoStack.value.push({ left: leftText.value, right: rightText.value })
  const prev = undoStack.value.pop()!
  leftText.value = prev.left
  rightText.value = prev.right
  editing = false
  showToast('已撤销')
}

function redo() {
  if (!redoStack.value.length) {
    showToast('没有可重做的了', true)
    return
  }
  undoStack.value.push({ left: leftText.value, right: rightText.value })
  const next = redoStack.value.pop()!
  leftText.value = next.left
  rightText.value = next.right
  editing = false
  showToast('已重做')
}

function showToast(text: string, error = false) {
  toast.value = { show: true, text, error }
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = { ...toast.value, show: false } }, 1400)
}

// 进沉浸时把焦点交给容器, 这样后续 Q / Esc / Ctrl+F 直接生效
watch(immersive, (v) => {
  if (v) nextTick(() => rootEl.value?.focus())
})

const leftText = ref('')
const rightText = ref('')
const result = ref<DiffResult | null>(null)
const error = ref('')
const filter = ref<DiffFilter>('all')
const loading = ref(false)
const selectedRowIdx = ref(-1)
const toast = ref({ show: false, text: '', error: false })
let toastTimer: number | undefined

const selectedRow = computed<DiffRow | null>(() =>
  result.value && selectedRowIdx.value >= 0 ? result.value.rows[selectedRowIdx.value] ?? null : null,
)

async function compare() {
  if (!leftText.value.trim() || !rightText.value.trim()) {
    error.value = ''
    result.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await diffJson(leftText.value, rightText.value)
    if (res.error) {
      error.value = res.error
      result.value = null
    } else {
      result.value = res
      filter.value = 'all'
      selectedRowIdx.value = -1
    }
  } finally {
    loading.value = false
  }
}

// 响应式对比 — 任一侧改动触发 debounce, 不用点按钮; 300ms 内连续打字合并成一次
let compareTimer: number | undefined
watch([leftText, rightText], () => {
  window.clearTimeout(compareTimer)
  compareTimer = window.setTimeout(() => compare(), 300)
})

function swap() {
  const t = leftText.value
  leftText.value = rightText.value
  rightText.value = t
}

async function openInto(side: 'left' | 'right') {
  const file = await openTextFile()
  if (!file) return
  if (side === 'left') leftText.value = file.content
  else rightText.value = file.content
}

function onSelect(idx: number) {
  selectedRowIdx.value = idx
}

async function copy(text: string, okMsg: string) {
  const ok = await copyText(text)
  toast.value = { show: true, text: ok ? okMsg : '复制失败', error: !ok }
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = { ...toast.value, show: false }
  }, 1400)
}
</script>
