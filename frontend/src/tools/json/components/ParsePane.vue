<template>
  <div class="rex-parse">
    <!-- 工具条 -->
    <div class="rex-parse__toolbar">
      <v-btn
        size="small"
        variant="text"
        :icon="inputCollapsed ? 'mdi-dock-left' : 'mdi-chevron-left'"
        :title="inputCollapsed ? '展开输入' : '收起输入'"
        @click="inputCollapsed = !inputCollapsed"
      />
      <JsonSearchBar
        v-model="doc.searchQuery.value"
        :count="doc.matchCount.value"
        :active-index="doc.activeMatch.value"
        :case-sensitive="doc.searchOptions.value.caseSensitive"
        :mode="doc.searchMode.value"
        @update:case-sensitive="onCaseToggle"
        @update:mode="onModeToggle"
        @next="doc.nextMatch()"
        @prev="doc.prevMatch()"
        @rerun="doc.runSearch()"
        @save="onSaveSearch"
      />
      <div class="rex-parse__actions">
        <v-btn size="small" variant="tonal" prepend-icon="mdi-folder-open-outline" @click="openFile">打开</v-btn>
        <v-btn size="small" variant="text" prepend-icon="mdi-code-braces" :disabled="!doc.tree.value" @click="format">格式化</v-btn>
        <v-btn size="small" variant="text" prepend-icon="mdi-format-horizontal-align-center" :disabled="!doc.tree.value" @click="minify">压缩</v-btn>
        <span class="rex-parse__sep" />
        <v-btn size="small" variant="text" icon="mdi-unfold-more-horizontal" :disabled="!doc.tree.value" title="展开全部" @click="treeRef?.expandAll()" />
        <v-btn size="small" variant="text" icon="mdi-unfold-less-horizontal" :disabled="!doc.tree.value" title="折叠全部" @click="treeRef?.collapseAll()" />
        <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-content-copy" :disabled="!doc.tree.value" @click="copyAll">复制全部</v-btn>
        <v-btn size="small" variant="text" prepend-icon="mdi-language-python" :disabled="!doc.tree.value" title="复制全部为 Python dict" @click="copyAllPython">dict</v-btn>
      </div>
    </div>

    <!-- 已存搜索 tag -->
    <div v-if="savedSearches.saved.value.length" class="rex-saved">
      <span class="rex-saved__label">已存</span>
      <button
        v-for="(s, i) in savedSearches.saved.value"
        :key="i"
        class="rex-saved__chip"
        :title="`应用: ${s.mode === 'path' ? '路径' : '文本'} ${s.query}`"
        @click="applySaved(s)"
      >
        <v-icon size="12">{{ s.mode === 'path' ? 'mdi-map-marker-path' : 'mdi-text-search' }}</v-icon>
        <span class="rex-saved__q">{{ s.label || s.query }}</span>
        <span class="rex-saved__edit" title="改名" @click.stop="openRename(i)">
          <v-icon size="11">mdi-pencil-outline</v-icon>
        </span>
        <span class="rex-saved__x" title="删除" @click.stop="savedSearches.remove(i)">
          <v-icon size="12">mdi-close</v-icon>
        </span>
      </button>
    </div>

    <!-- 输入 / 树 分屏 -->
    <div class="rex-parse__body">
      <section class="rex-parse__input" :class="{ 'rex-parse__input--collapsed': inputCollapsed }">
        <textarea
          v-model="rawText"
          class="rex-parse__textarea"
          spellcheck="false"
          placeholder="把 JSON 粘贴到这里 — 右侧实时解析。也可直接在右侧粘贴 (Ctrl+V) 并自动收起此栏"
          @input="onInput"
        />
        <div v-if="doc.parseError.value" class="rex-parse__error">
          <v-icon size="15">mdi-alert-circle-outline</v-icon>
          <span>{{ errorText }}</span>
        </div>
      </section>

      <section class="rex-parse__tree">
        <JsonTreeCanvas
          ref="treeRef"
          :tree="doc.tree.value"
          :is-dark="isDark"
          @select="onSelect"
          @contextmenu="onContextMenu"
        />
        <div v-if="selectedId >= 0 && doc.tree.value" class="rex-parse__selbar">
          <span class="rex-parse__selpath" :title="selectedPath">{{ selectedPath }}</span>
          <button
            v-if="occurrence > 1"
            class="rex-parse__selcount"
            :title="`同结构(数组下标归一)共 ${occurrence} 处 — 点击筛出`"
            @click="focusStructural"
          >
            <v-icon size="12">mdi-format-list-numbered</v-icon> 同结构 {{ occurrence }}
          </button>
          <v-btn size="x-small" variant="text" prepend-icon="mdi-content-copy" @click="copyNode(selectedId, true)">复制值</v-btn>
          <v-btn size="x-small" variant="text" prepend-icon="mdi-map-marker-path" @click="copyPath(selectedId)">复制路径</v-btn>
        </div>
      </section>
    </div>

    <JsonStatsBar :stats="doc.stats.value" />

    <NodeContextMenu
      :visible="ctx.visible"
      :x="ctx.x"
      :y="ctx.y"
      :items="ctxItems"
      @close="ctx.visible = false"
      @action="onCtxAction"
    />

    <CopyToast :show="toast.show" :text="toast.text" :error="toast.error" />

    <!-- 已存搜索改名 -->
    <v-dialog v-model="renameDlg.show" max-width="400">
      <v-card class="rex-rename-card">
        <div class="rex-rename-card__title">给这个搜索改个名</div>
        <div class="rex-rename-card__q">{{ renameDlg.query }}</div>
        <v-text-field
          v-model="renameDlg.label"
          variant="outlined"
          density="compact"
          placeholder="短名(留空则显示原查询)"
          autofocus
          hide-details
          @keydown.enter="confirmRename"
        />
        <div class="rex-rename-card__actions">
          <v-btn variant="text" size="small" @click="renameDlg.show = false">取消</v-btn>
          <v-btn color="primary" variant="flat" size="small" @click="confirmRename">保存</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import JsonTreeCanvas from './JsonTreeCanvas.vue'
import JsonSearchBar from './JsonSearchBar.vue'
import JsonStatsBar from './JsonStatsBar.vue'
import NodeContextMenu, { type ContextMenuItem } from './NodeContextMenu.vue'
import CopyToast from './CopyToast.vue'
import { useJsonDocument, type SearchMode } from '../composables/useJsonDocument'
import { useSavedSearches, type SavedSearch } from '../composables/useSavedSearches'
import { pathOf } from '../core/model'
import { countStructural, structuralPattern } from '../core/pathSearch'
import { jsonToPython } from '../core/pythonParse'
import { copyText, openTextFile } from '@/platform/native'
import { SAMPLE_JSON } from '../sample'

defineProps<{ isDark: boolean }>()

const doc = useJsonDocument()
const savedSearches = useSavedSearches()
const treeRef = ref<InstanceType<typeof JsonTreeCanvas> | null>(null)

const rawText = ref('')
const selectedId = ref(-1)
const inputCollapsed = ref(false)
const toast = ref({ show: false, text: '', error: false })
let toastTimer: number | undefined
const ctx = ref({ visible: false, x: 0, y: 0, nodeId: -1 })

let parseTimer: number | undefined
function onInput() {
  window.clearTimeout(parseTimer)
  parseTimer = window.setTimeout(() => doc.parse(rawText.value), 220)
}

const errorText = computed(() => {
  const e = doc.parseError.value
  if (!e) return ''
  return e.line > 0 ? `第 ${e.line} 行第 ${e.column} 列: ${e.message}` : e.message
})

const selectedPath = computed(() =>
  doc.tree.value && selectedId.value >= 0 ? pathOf(doc.tree.value, selectedId.value) : '',
)

// 同结构出现次数 — 超大树跳过(每次点击 O(n) 算 pathOf 太贵)
const occurrence = computed(() => {
  const t = doc.tree.value
  if (!t || selectedId.value < 0 || t.count > 100000) return 0
  return countStructural(t, selectedId.value)
})

const ctxItems = computed<ContextMenuItem[]>(() => [
  { label: '复制值 (格式化)', icon: 'mdi-content-copy', action: 'copy-value-pretty' },
  { label: '复制值 (压缩)', icon: 'mdi-format-horizontal-align-center', action: 'copy-value-min' },
  { label: '复制路径', icon: 'mdi-map-marker-path', action: 'copy-path' },
  { label: '复制 key', icon: 'mdi-key-outline', action: 'copy-key' },
  { label: '复制为 Python dict', icon: 'mdi-language-python', action: 'copy-python' },
  { label: '筛同结构路径', icon: 'mdi-format-list-numbered', action: 'filter-structural' },
])

watch(
  () => [doc.matches.value, doc.activeMatch.value] as const,
  ([m, a]) => treeRef.value?.setMatches(m, a),
)
// 实时搜索 — 打字即搜(回车/聚焦的 @rerun 是额外的再次触发)
watch(
  () => doc.searchQuery.value,
  () => doc.runSearch(),
)

function onCaseToggle(v: boolean) {
  doc.searchOptions.value.caseSensitive = v
  doc.runSearch()
}

function onModeToggle(m: SearchMode) {
  doc.searchMode.value = m
  doc.runSearch()
}

function onSaveSearch() {
  if (savedSearches.add(doc.searchQuery.value, doc.searchMode.value)) showToast('已保存搜索')
  else showToast('已存在或为空', true)
}

function applySaved(s: SavedSearch) {
  doc.searchMode.value = s.mode
  doc.searchQuery.value = s.query
  doc.runSearch()
}

const renameDlg = ref({ show: false, index: -1, query: '', label: '' })
function openRename(i: number) {
  const s = savedSearches.saved.value[i]
  renameDlg.value = { show: true, index: i, query: s.query, label: s.label || '' }
}
function confirmRename() {
  savedSearches.rename(renameDlg.value.index, renameDlg.value.label)
  renameDlg.value.show = false
}

function onSelect(nodeId: number) {
  selectedId.value = nodeId
}

function onContextMenu(nodeId: number, x: number, y: number) {
  selectedId.value = nodeId
  ctx.value = { visible: true, x, y, nodeId }
}

function focusStructural() {
  const t = doc.tree.value
  if (!t || selectedId.value < 0) return
  doc.searchByPath(structuralPattern(pathOf(t, selectedId.value)))
}

function onCtxAction(action: string) {
  const id = ctx.value.nodeId
  if (id < 0) return
  switch (action) {
    case 'copy-value-pretty':
      copyNode(id, true)
      break
    case 'copy-value-min':
      copyNode(id, false)
      break
    case 'copy-path':
      copyPath(id)
      break
    case 'copy-key':
      copyKey(id)
      break
    case 'copy-python':
      copyPython(id)
      break
    case 'filter-structural':
      selectedId.value = id
      focusStructural()
      break
  }
}

async function copyNode(id: number, pretty: boolean) {
  const tree = doc.tree.value
  if (!tree) return
  const value = tree.values[id]
  const text = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)
  await doCopy(text ?? 'undefined', pretty ? '已复制值 (格式化)' : '已复制值 (压缩)')
}

async function copyPath(id: number) {
  const tree = doc.tree.value
  if (!tree) return
  await doCopy(pathOf(tree, id), '已复制路径')
}

async function copyKey(id: number) {
  const tree = doc.tree.value
  if (!tree) return
  const key = tree.keys[id]
  await doCopy(key !== null ? key : `[${tree.arrayIndex[id]}]`, '已复制 key')
}

async function copyPython(id: number) {
  const tree = doc.tree.value
  if (!tree) return
  await doCopy(jsonToPython(tree.values[id]), '已复制为 Python dict')
}

async function copyAll() {
  const tree = doc.tree.value
  if (!tree) return
  await doCopy(JSON.stringify(tree.values[0], null, 2), '已复制全部 JSON')
}

async function copyAllPython() {
  const tree = doc.tree.value
  if (!tree) return
  await doCopy(jsonToPython(tree.values[0]), '已复制全部为 Python dict')
}

async function doCopy(text: string, okMsg: string) {
  const ok = await copyText(text)
  showToast(ok ? okMsg : '复制失败', !ok)
}

function showToast(text: string, error = false) {
  toast.value = { show: true, text, error }
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = { ...toast.value, show: false }
  }, 1400)
}

async function openFile() {
  const file = await openTextFile()
  if (!file) return
  loadContent(file.content)
}

// 在树区域直接粘贴 — 不在 textarea 里时, 全局 paste 当作加载 JSON, 并收起输入栏
function onWindowPaste(e: ClipboardEvent) {
  const ae = document.activeElement
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return
  const text = e.clipboardData?.getData('text')
  if (!text) return
  e.preventDefault()
  loadContent(text)
}

function loadContent(text: string) {
  rawText.value = text
  doc.parse(text)
  if (!doc.parseError.value) inputCollapsed.value = true
}

function format() {
  const tree = doc.tree.value
  if (!tree) return
  rawText.value = JSON.stringify(tree.values[0], null, 2)
  doc.parse(rawText.value)
}

function minify() {
  const tree = doc.tree.value
  if (!tree) return
  rawText.value = JSON.stringify(tree.values[0])
  doc.parse(rawText.value)
}

onMounted(() => {
  rawText.value = SAMPLE_JSON
  doc.parse(SAMPLE_JSON)
  window.addEventListener('paste', onWindowPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onWindowPaste)
})
</script>
