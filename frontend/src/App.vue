<template>
  <v-app :class="['rex-app', isDark ? 'rex-theme--dark' : 'rex-theme--light', { 'rex-immersive': immersive }]">
    <TitleBar :is-dark="isDark" @toggle-theme="toggleTheme" @toggle-nav="navVisible = !navVisible" />

    <SideNav
      :tools="tools"
      :current="currentId"
      :visible="navVisible && !immersive"
      @navigate="goTo"
      @update:visible="navVisible = $event"
    />

    <v-main class="rex-main">
      <TopBar :title="currentTitle" />
      <div class="rex-content">
        <!-- v-show 常驻(懒挂载): 工具首访才挂载, 之后保留 DOM 不 detach —— 切换不重置, 且插件 iframe
             不 reload、canvas 不重建(keep-alive 会 detach DOM 到离屏容器, 导致 iframe 在 Chromium 下重载) -->
        <component
          v-for="t in mountedTools"
          :key="t.id"
          :is="t.comp"
          v-show="t.id === currentId"
          :is-dark="isDark"
        />
      </div>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, markRaw, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppTheme } from './composables/useTheme'
import { useImmersive } from './composables/useImmersive'
import { TOOLS } from './shell/registry'
import type { ToolDef } from './shell/tool'
import TitleBar from './shell/TitleBar.vue'
import SideNav from './shell/SideNav.vue'
import TopBar from './shell/TopBar.vue'

const { isDark, toggleTheme } = useAppTheme()
const { immersive, exit: exitImmersive } = useImmersive()
const route = useRoute()
const router = useRouter()

const tools = TOOLS

// 懒挂载 + 常驻: 工具首次访问才挂载, 之后用 v-show 保留(切换不重置; 插件 iframe 不重载、canvas 不重建)
const compCache = new Map<string, Component>()
function resolveComp(t: ToolDef): Component {
  let c = compCache.get(t.id)
  if (!c) {
    c = markRaw(defineAsyncComponent(t.component))
    compCache.set(t.id, c)
  }
  return c
}
const mountedIds = ref<string[]>([])
const mountedTools = computed(() =>
  TOOLS.filter((t) => mountedIds.value.includes(t.id)).map((t) => ({ id: t.id, comp: resolveComp(t) })),
)

const navVisible = ref(localStorage.getItem('ria-nav-visible') !== '0')
watch(navVisible, (v) => localStorage.setItem('ria-nav-visible', v ? '1' : '0'))

const currentId = computed(() => String(route.name ?? ''))
// 访问过的工具加入挂载集合(并保持挂载), 实现懒挂载 + 常驻
watch(
  currentId,
  (id) => {
    if (id && !mountedIds.value.includes(id)) mountedIds.value.push(id)
    exitImmersive() // 切工具退出沉浸, 防 teleport 到标题栏的 actions 残留
  },
  { immediate: true },
)
const currentTitle = computed(
  () => TOOLS.find((t) => t.id === currentId.value)?.title ?? 'Rex Instrumenta',
)

function goTo(tool: ToolDef) {
  if (route.path !== tool.path) router.push(tool.path)
}
</script>
