<template>
  <div class="rex-tree-canvas">
    <canvas ref="canvasEl" class="rex-tree-canvas__cv" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import type { DiffRow } from '../core/diff'
import { DiffRenderer, type DiffFilter } from '../render/DiffRenderer'

const props = defineProps<{
  rows: DiffRow[]
  filter: DiffFilter
  isDark: boolean
}>()

const emit = defineEmits<{ select: [rowIndex: number] }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
let renderer: DiffRenderer | null = null

onMounted(() => {
  if (!canvasEl.value) return
  renderer = new DiffRenderer(canvasEl.value, {
    onSelect: (idx) => emit('select', idx),
  })
  renderer.setRows(props.rows)
  renderer.setFilter(props.filter)
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
  () => props.isDark,
  () => renderer?.recolor(),
)

onBeforeUnmount(() => {
  renderer?.destroy()
  renderer = null
})
</script>

<style scoped>
.rex-tree-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}
.rex-tree-canvas__cv {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
