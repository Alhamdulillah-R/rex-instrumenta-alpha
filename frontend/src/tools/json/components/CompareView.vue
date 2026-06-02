<template>
  <div class="rex-compare">
    <!-- 双输入 -->
    <div class="rex-compare__inputs">
      <section class="rex-compare__col">
        <div class="rex-compare__col-head">
          <span class="rex-compare__col-tag rex-compare__col-tag--a">样本 A</span>
          <v-btn size="x-small" variant="text" prepend-icon="mdi-folder-open-outline" @click="openInto('left')">打开</v-btn>
        </div>
        <textarea v-model="leftText" class="rex-compare__textarea" spellcheck="false" placeholder="粘贴左侧 JSON…" />
      </section>
      <section class="rex-compare__col">
        <div class="rex-compare__col-head">
          <span class="rex-compare__col-tag rex-compare__col-tag--b">样本 B</span>
          <v-btn size="x-small" variant="text" prepend-icon="mdi-folder-open-outline" @click="openInto('right')">打开</v-btn>
        </div>
        <textarea v-model="rightText" class="rex-compare__textarea" spellcheck="false" placeholder="粘贴右侧 JSON…" />
      </section>
    </div>

    <!-- 动作条 -->
    <div class="rex-compare__bar">
      <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-compare" :loading="loading" @click="compare">对比</v-btn>
      <v-btn size="small" variant="text" prepend-icon="mdi-swap-horizontal" @click="swap">交换</v-btn>
      <v-btn size="small" variant="text" prepend-icon="mdi-flask-outline" @click="loadSample">示例</v-btn>
      <CompareSummary v-if="result && !error" :stats="result.stats" :filter="filter" @set-filter="filter = $event" />
    </div>

    <!-- 错误 -->
    <div v-if="error" class="rex-compare__error">
      <v-icon size="16">mdi-alert-circle-outline</v-icon>
      <span>{{ error }}</span>
    </div>

    <!-- diff 结果 -->
    <div v-if="result && !error && result.rows.length" class="rex-compare__result">
      <DiffCanvas :rows="result.rows" :filter="filter" :is-dark="isDark" @select="onSelect" />
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
import { ref, computed } from 'vue'
import DiffCanvas from './DiffCanvas.vue'
import CompareSummary from './CompareSummary.vue'
import CopyToast from './CopyToast.vue'
import type { DiffResult, DiffRow } from '../core/diff'
import type { DiffFilter } from '../render/DiffRenderer'
import { diffJson } from '../api'
import { copyText, openTextFile } from '@/platform/native'
import { SAMPLE_LEFT, SAMPLE_RIGHT } from '../sample'

defineProps<{ isDark: boolean }>()

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
    error.value = '请先在两侧都粘贴 JSON'
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

function swap() {
  const t = leftText.value
  leftText.value = rightText.value
  rightText.value = t
}

function loadSample() {
  leftText.value = SAMPLE_LEFT
  rightText.value = SAMPLE_RIGHT
  compare()
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
