<template>
  <div class="rex-tree-canvas">
    <canvas ref="canvasEl" class="rex-tree-canvas__cv" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import type { FlatTree } from '../core/types'
import { TreeRenderer } from '../render/TreeRenderer'

const props = defineProps<{
  tree: FlatTree | null
  isDark: boolean
}>()

const emit = defineEmits<{
  select: [nodeId: number]
  contextmenu: [nodeId: number, x: number, y: number]
}>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
let renderer: TreeRenderer | null = null

onMounted(() => {
  if (!canvasEl.value) return
  renderer = new TreeRenderer(canvasEl.value, {
    onSelect: (id) => emit('select', id),
    onContextMenu: (id, x, y) => emit('contextmenu', id, x, y),
  })
  renderer.setTree(props.tree)
})

watch(
  () => props.tree,
  (t) => renderer?.setTree(t),
)
// 主题切换 → canvas 重读 CSS 变量配色
watch(
  () => props.isDark,
  () => renderer?.recolor(),
)

onBeforeUnmount(() => {
  renderer?.destroy()
  renderer = null
})

defineExpose({
  expandAll: () => renderer?.expandAll(),
  collapseAll: () => renderer?.collapseAll(),
  select: (id: number) => renderer?.select(id),
  setMatches: (ids: Int32Array, active: number) => renderer?.setMatches(ids, active),
  clearMatches: () => renderer?.clearMatches(),
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
