<template>
  <v-app :class="['rex-app', isDark ? 'rex-theme--dark' : 'rex-theme--light']">
    <TitleBar :is-dark="isDark" @toggle-theme="toggleTheme" @toggle-nav="navVisible = !navVisible" />

    <SideNav
      :tools="tools"
      :current="currentId"
      :visible="navVisible"
      @navigate="goTo"
      @update:visible="navVisible = $event"
    />

    <v-main class="rex-main">
      <TopBar :title="currentTitle" />
      <div class="rex-content">
        <!-- keep-alive: 切换工具时各工具组件不销毁, 保留输入/输出/滚动等状态(curl 也不重载 wasm) -->
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" :is-dark="isDark" />
          </keep-alive>
        </router-view>
      </div>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppTheme } from './composables/useTheme'
import { TOOLS } from './shell/registry'
import type { ToolDef } from './shell/tool'
import TitleBar from './shell/TitleBar.vue'
import SideNav from './shell/SideNav.vue'
import TopBar from './shell/TopBar.vue'

const { isDark, toggleTheme } = useAppTheme()
const route = useRoute()
const router = useRouter()

const tools = TOOLS
const navVisible = ref(localStorage.getItem('ria-nav-visible') !== '0')
watch(navVisible, (v) => localStorage.setItem('ria-nav-visible', v ? '1' : '0'))

const currentId = computed(() => String(route.name ?? ''))
const currentTitle = computed(
  () => TOOLS.find((t) => t.id === currentId.value)?.title ?? 'Rex Instrumenta',
)

function goTo(tool: ToolDef) {
  if (route.path !== tool.path) router.push(tool.path)
}
</script>
