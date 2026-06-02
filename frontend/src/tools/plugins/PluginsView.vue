<template>
  <div class="rex-plugins rex-view-enter">
    <aside class="rex-plugins__side">
      <div class="rex-plugins__side-head">
        <span class="rex-plugins__count">{{ plugins.length }} 个插件</span>
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          prepend-icon="mdi-folder-plus-outline"
          :loading="loading"
          @click="doImport"
        >导入</v-btn>
      </div>

      <div class="rex-plugins__list">
        <button
          v-for="p in plugins"
          :key="p.id"
          class="rex-plugins__item"
          :class="{ active: p.id === selectedId && !showDoc }"
          @click="selectedId = p.id; showDoc = false"
        >
          <v-icon size="18">mdi-puzzle</v-icon>
          <span class="rex-plugins__item-name">{{ p.name }}</span>
          <span class="rex-plugins__del" title="移除" @click.stop="doRemove(p.id)">
            <v-icon size="15">mdi-close</v-icon>
          </span>
        </button>
        <div v-if="plugins.length === 0" class="rex-plugins__empty-side">还没有插件</div>
      </div>

      <button class="rex-plugins__doc" :class="{ active: showDoc }" @click="openDoc">
        <v-icon size="14">mdi-file-document-outline</v-icon> SDK 文档
      </button>
    </aside>

    <section class="rex-plugins__stage">
      <div v-if="showDoc" class="rex-plugins__docview">
        <div class="rex-plugins__docview-bar">
          <span><v-icon size="15">mdi-file-document-outline</v-icon> SDK 文档</span>
          <v-btn size="x-small" variant="text" icon="mdi-close" @click="showDoc = false" />
        </div>
        <pre class="rex-plugins__docview-body">{{ docText || '加载中…' }}</pre>
      </div>
      <iframe
        v-else-if="selected"
        ref="iframeEl"
        :key="selected.id"
        :src="src"
        class="rex-plugins__frame"
        @load="postTheme"
      />
      <div v-else class="rex-plugins__empty">
        <v-icon size="46" color="primary">mdi-puzzle-outline</v-icon>
        <p>导入一个含 <code>index.html</code> 的文件夹作为插件</p>
        <p class="rex-plugins__empty-sub">
          该文件夹即工作目录 · SDK:<code>/plugins/__sdk__/monet.css · rex-plugin.js · vue.js</code>
          —— 同色系 + Vue + 字体
        </p>
        <p v-if="error" class="rex-plugins__err">{{ error }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { listPlugins, importPlugin, removePlugin, pluginUrl, type Plugin } from './api'
import './plugins.css'

const props = withDefaults(defineProps<{ isDark?: boolean }>(), { isDark: false })

const plugins = ref<Plugin[]>([])
const selectedId = ref('')
const loading = ref(false)
const error = ref('')
const showDoc = ref(false)
const docText = ref('')
const iframeEl = ref<HTMLIFrameElement | null>(null)

// SDK 文档在应用内查看(fetch 文本渲染), 避开 target=_blank 在 Wails 开新窗口的坑
async function openDoc() {
  showDoc.value = true
  if (docText.value) return
  try {
    const res = await fetch('/plugins/__sdk__/DOC.md')
    docText.value = res.ok ? await res.text() : '文档需在桌面端加载'
  } catch {
    docText.value = '文档需在桌面端(Wails)运行时加载'
  }
}

const selected = computed(() => plugins.value.find((p) => p.id === selectedId.value) ?? null)
const src = computed(() => (selected.value ? pluginUrl(selected.value) : ''))

async function refresh(selectId?: string) {
  plugins.value = await listPlugins()
  if (selectId) selectedId.value = selectId
  else if (!selected.value && plugins.value.length) selectedId.value = plugins.value[0].id
}

async function doImport() {
  loading.value = true
  error.value = ''
  try {
    const r = await importPlugin()
    if (r.error) {
      error.value = r.error
      return
    }
    plugins.value = r.plugins
    if (r.newId) {
      selectedId.value = r.newId
      showDoc.value = false
    }
  } finally {
    loading.value = false
  }
}

async function doRemove(id: string) {
  const r = await removePlugin(id)
  if (r.error) {
    error.value = r.error
    return
  }
  plugins.value = r.plugins
  if (selectedId.value === id) selectedId.value = plugins.value[0]?.id ?? ''
}

// 把当前明暗主题推给插件 iframe(rex-plugin.js 收到后切 .rex-dark/.rex-light)
function postTheme() {
  iframeEl.value?.contentWindow?.postMessage({ type: 'rex-theme', dark: props.isDark }, '*')
}

// 插件加载完会 postMessage rex-plugin-ready, 收到即回推当前主题
function onMessage(e: MessageEvent) {
  if (e.data && e.data.type === 'rex-plugin-ready') postTheme()
}

watch(() => props.isDark, postTheme)

onMounted(() => {
  window.addEventListener('message', onMessage)
  refresh()
})
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
</script>
