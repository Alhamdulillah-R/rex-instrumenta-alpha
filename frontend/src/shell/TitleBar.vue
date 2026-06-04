<template>
  <v-app-bar :height="40" flat class="rex-titlebar" style="--wails-draggable: drag">
    <div class="rex-titlebar__left">
      <button class="rex-titlebar__btn rex-nodrag" title="切换侧栏" @click="emit('toggle-nav')">
        <v-icon size="18">mdi-menu</v-icon>
      </button>
      <img :src="logoUrl" class="rex-titlebar__logo" alt="" aria-hidden="true" />
      <span class="rex-titlebar__brand">Rex Instrumenta</span>
      <span class="rex-titlebar__alpha">α</span>
    </div>

    <div class="rex-titlebar__right rex-nodrag">
      <!-- 沉浸模式落点: ParsePane 的操作按钮 teleport 到这里, 与主题切换同一行 -->
      <div id="rex-titlebar-actions" class="rex-titlebar__actions"></div>
      <button class="rex-titlebar__btn" :title="isDark ? '切换到浅色' : '切换到深色'" @click="onTheme">
        <v-icon size="17">{{ isDark ? 'mdi-weather-night' : 'mdi-white-balance-sunny' }}</v-icon>
      </button>
      <button class="rex-titlebar__btn" title="最小化" @click="appWindow.minimize()">
        <v-icon size="16">mdi-window-minimize</v-icon>
      </button>
      <button class="rex-titlebar__btn" title="最大化 / 还原" @click="appWindow.toggleMaximize()">
        <v-icon size="15">mdi-window-maximize</v-icon>
      </button>
      <button class="rex-titlebar__btn rex-titlebar__btn--close" title="关闭(收起到托盘)" @click="appWindow.close()">
        <v-icon size="17">mdi-window-close</v-icon>
      </button>
    </div>
  </v-app-bar>
</template>

<script setup lang="ts">
import { appWindow } from '@/platform/window'
import logoUrl from '@/assets/logo.svg'

defineProps<{ isDark: boolean }>()
const emit = defineEmits<{ 'toggle-nav': []; 'toggle-theme': [origin: { x: number; y: number }] }>()

// 把点击坐标传出去做圆形揭示圆心
function onTheme(e: MouseEvent) {
  emit('toggle-theme', { x: e.clientX, y: e.clientY })
}
</script>
