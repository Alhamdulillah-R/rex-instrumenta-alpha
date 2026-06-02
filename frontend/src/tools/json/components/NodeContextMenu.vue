<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="rex-ctx-backdrop"
      @click="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div class="rex-ctx-menu" :style="style" @click.stop>
        <button
          v-for="item in items"
          :key="item.action"
          class="rex-ctx-menu__item"
          @click="pick(item.action)"
        >
          <v-icon size="16" class="rex-ctx-menu__icon">{{ item.icon }}</v-icon>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </div>
  </teleport>
</template>

<script lang="ts">
// 具名导出放普通 script 块 — <script setup> 不支持额外具名导出
export interface ContextMenuItem {
  label: string
  icon: string
  action: string
}
</script>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{
  close: []
  action: [action: string]
}>()

// 钳制到视口内, 避免靠右/靠下时菜单溢出屏外
const style = computed(() => {
  const menuW = 190
  const menuH = props.items.length * 38 + 12
  const left = Math.min(props.x, window.innerWidth - menuW - 8)
  const top = Math.min(props.y, window.innerHeight - menuH - 8)
  return { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }
})

function pick(action: string) {
  emit('action', action)
  emit('close')
}
</script>
