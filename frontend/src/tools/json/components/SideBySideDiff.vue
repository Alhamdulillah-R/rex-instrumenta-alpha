<template>
  <div class="rex-sbsc">
    <canvas ref="canvasEl" class="rex-sbsc__canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import type { DiffRow } from '../core/diff'
import { SideBySideRenderer, type DiffFilter } from '../render/SideBySideRenderer'

// canvas 虚拟渲染并排 diff —— 只画可视区, 上万行也不卡. 几何 / 命中 / 主题在 renderer 里.
const props = defineProps<{
  rows: DiffRow[]
  filter: DiffFilter
  selectedIdx?: number
  isDark: boolean
}>()

const emit = defineEmits<{ select: [idx: number] }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
let renderer: SideBySideRenderer | null = null

onMounted(() => {
  if (!canvasEl.value) return
  renderer = new SideBySideRenderer(canvasEl.value, {
    onSelect: (idx) => emit('select', idx),
  })
  renderer.setRows(props.rows)
  renderer.setFilter(props.filter)
  if (props.selectedIdx !== undefined && props.selectedIdx >= 0) renderer.setSelected(props.selectedIdx)
})

watch(
  () => props.rows,
  (r) => renderer?.setRows(r),
)
watch(
  () => props.filter,
  (f) => renderer?.setFilter(f),
)
watch(
  () => props.selectedIdx,
  (i) => renderer?.setSelected(i ?? -1),
)
watch(
  () => props.isDark,
  () => renderer?.recolor(),
)

onBeforeUnmount(() => {
  renderer?.destroy()
  renderer = null
})
</script>
