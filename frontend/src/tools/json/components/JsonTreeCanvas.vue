<template>
  <div class="rex-tree-canvas" ref="rootEl" tabindex="0" @keydown="onKeydown" @mousedown="focusSelf">
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
  next: []
  prev: []
  'toggle-immersive': []
  'copy-value': []
}>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const rootEl = ref<HTMLDivElement | null>(null)
let renderer: TreeRenderer | null = null

// canvas 是自绘的, 靠容器 tabindex 接键盘: 聚焦后 ↓/↑ 切换搜索匹配的第几个
function focusSelf() {
  rootEl.value?.focus()
}
function onKeydown(e: KeyboardEvent) {
  // Ctrl+C: 复制选中节点 value(格式化), 由父组件按 selectedId 取值
  if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
    emit('copy-value')
    e.preventDefault()
    return
  }
  // Q: 切换沉浸模式(canvas 聚焦即"JSON 为焦点")
  if (e.key === 'q' || e.key === 'Q') {
    emit('toggle-immersive')
    e.preventDefault()
    return
  }
  if (e.key === 'ArrowDown') {
    emit('next')
    e.preventDefault()
  } else if (e.key === 'ArrowUp') {
    emit('prev')
    e.preventDefault()
  }
}

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
  focus: () => rootEl.value?.focus(),
})
</script>

<style scoped>
.rex-tree-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  outline: none;
}
.rex-tree-canvas__cv {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
