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

    <!-- 文档历史条: 当前文档名 + 历史下拉(切换/改名/删除) + 新建 -->
    <div class="rex-parse__docbar">
      <v-menu v-model="docMenu" :close-on-content-click="false" location="bottom start" offset="6">
        <template #activator="{ props: menuProps }">
          <button class="rex-parse__docchip" v-bind="menuProps" title="历史文档 — 点击切换 / 管理">
            <v-icon size="15">mdi-history</v-icon>
            <span class="rex-parse__docname">{{ activeName }}</span>
            <v-icon size="14">mdi-chevron-down</v-icon>
          </button>
        </template>
        <div class="rex-doclist">
          <div class="rex-doclist__head">
            <span v-if="!selectMode">历史文档 · {{ libDocs.length }} 篇</span>
            <span v-else>已选 {{ selectedIds.length }} / {{ libDocs.length }}</span>
            <span class="rex-doclist__headacts">
              <template v-if="!selectMode">
                <button class="rex-doclist__headbtn" :disabled="!libDocs.length" @click="enterSelect">选择</button>
                <button
                  class="rex-doclist__headbtn rex-doclist__headbtn--danger"
                  :disabled="!unpinnedCount"
                  title="删除所有未固定的历史"
                  @click="clearUnpinned"
                >清空</button>
              </template>
              <template v-else>
                <button class="rex-doclist__headbtn" @click="toggleSelectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
                <button
                  class="rex-doclist__headbtn rex-doclist__headbtn--danger"
                  :disabled="!selectedIds.length"
                  @click="deleteSelected"
                >删除所选</button>
                <button class="rex-doclist__headbtn" @click="exitSelect">取消</button>
              </template>
            </span>
          </div>
          <div class="rex-doclist__items">
            <div
              v-for="d in libDocs"
              :key="d.id"
              class="rex-doclist__item"
              :class="{ active: !selectMode && d.id === activeId, selected: selectMode && selectedIds.includes(d.id) }"
              @click="onRowClick(d)"
            >
              <span v-if="selectMode" class="rex-doclist__check">
                <v-icon size="18">{{ selectedIds.includes(d.id) ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline' }}</v-icon>
              </span>
              <div class="rex-doclist__main">
                <span class="rex-doclist__name">
                  <v-icon v-if="d.pinned" class="rex-doclist__pinmark" size="12">mdi-pin</v-icon>{{ d.name }}
                </span>
                <span class="rex-doclist__preview">{{ d.preview || '空文档' }}</span>
              </div>
              <span class="rex-doclist__time">{{ relTime(d.updatedAt) }}</span>
              <template v-if="!selectMode">
                <span
                  class="rex-doclist__act"
                  :class="{ 'rex-doclist__act--on': d.pinned }"
                  :title="d.pinned ? '取消固定' : '固定置顶'"
                  @click.stop="togglePin(d)"
                >
                  <v-icon size="14">{{ d.pinned ? 'mdi-pin' : 'mdi-pin-outline' }}</v-icon>
                </span>
                <span class="rex-doclist__act" title="改名" @click.stop="openDocRename(d)">
                  <v-icon size="14">mdi-pencil-outline</v-icon>
                </span>
                <span class="rex-doclist__act rex-doclist__act--del" title="删除" @click.stop="deleteDoc(d.id)">
                  <v-icon size="14">mdi-trash-can-outline</v-icon>
                </span>
              </template>
            </div>
            <div v-if="!libDocs.length" class="rex-doclist__empty">还没有历史文档</div>
          </div>
        </div>
      </v-menu>
      <button class="rex-parse__docrename" title="给当前文档改名" @click="openDocRename()">
        <v-icon size="14">mdi-pencil-outline</v-icon>
      </button>
      <v-btn size="small" variant="text" prepend-icon="mdi-file-plus-outline" @click="newDoc">新建</v-btn>
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

    <!-- 文档改名 — 留空则按时间自动命名 -->
    <v-dialog v-model="docRename.show" max-width="420">
      <v-card class="rex-rename-card">
        <div class="rex-rename-card__title">给这份 JSON 改个名</div>
        <div class="rex-rename-card__q">{{ docRename.preview || '空文档' }}</div>
        <v-text-field
          v-model="docRename.name"
          variant="outlined"
          density="compact"
          placeholder="留空则按 yyyy-mm-dd-HH:mm导入的json 命名"
          autofocus
          hide-details
          @keydown.enter="confirmDocRename"
        />
        <div class="rex-rename-card__actions">
          <v-btn variant="text" size="small" @click="docRename.show = false">取消</v-btn>
          <v-btn color="primary" variant="flat" size="small" @click="confirmDocRename">保存</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- 批量清理确认 -->
    <v-dialog v-model="confirmState.show" max-width="380">
      <v-card class="rex-rename-card">
        <div class="rex-rename-card__title">{{ confirmState.text }}</div>
        <div class="rex-rename-card__actions">
          <v-btn variant="text" size="small" @click="confirmState.show = false">取消</v-btn>
          <v-btn color="error" variant="flat" size="small" @click="runConfirm">删除</v-btn>
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
import { useJsonLibrary } from '../composables/useJsonLibrary'
import type { JsonDoc } from '../store/docStore'
import { pathOf } from '../core/model'
import { countStructural, structuralPattern } from '../core/pathSearch'
import { jsonToPython } from '../core/pythonParse'
import { copyText, openTextFile } from '@/platform/native'
import { SAMPLE_JSON } from '../sample'

defineProps<{ isDark: boolean }>()

const doc = useJsonDocument()
const savedSearches = useSavedSearches()
const {
  docs: libDocs,
  activeId,
  activeDoc,
  init: initLibrary,
  load: loadLibDoc,
  save: saveActive,
  create: createDoc,
  rename: renameLibDoc,
  remove: removeLibDoc,
  setPin,
  removeMany,
} = useJsonLibrary()
const treeRef = ref<InstanceType<typeof JsonTreeCanvas> | null>(null)

const rawText = ref('')
const selectedId = ref(-1)
const inputCollapsed = ref(false)
const toast = ref({ show: false, text: '', error: false })
let toastTimer: number | undefined
const ctx = ref({ visible: false, x: 0, y: 0, nodeId: -1 })

const docMenu = ref(false)
const docRename = ref({ show: false, id: '', name: '', preview: '' })
const activeName = computed(() => activeDoc.value?.name ?? '未命名')
let saveTimer: number | undefined

let parseTimer: number | undefined
function onInput() {
  window.clearTimeout(parseTimer)
  parseTimer = window.setTimeout(() => doc.parse(rawText.value), 220)
  scheduleSave()
}

// 自动保存当前文档(防抖) — 编辑/格式化/粘贴后落库, 切换工具或关闭窗口也不丢
function scheduleSave() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => saveActive(rawText.value), 600)
}

function saveNow() {
  window.clearTimeout(saveTimer)
  saveActive(rawText.value)
}

// applyLoaded 把一段正文载入编辑器(不触发自动保存 —— 这是"载入"而非"编辑")
function applyLoaded(text: string) {
  rawText.value = text
  selectedId.value = -1
  doc.parse(text)
  inputCollapsed.value = !!text && !doc.parseError.value
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

// ─── 文档历史 ───
function fileBaseName(path: string): string {
  const base = path.split(/[\\/]/).pop()
  return base && base.trim() ? base : ''
}

// relTime 把时间戳渲染成相对时间(刚刚/分钟/小时), 超过一天回落到月-日 时:分
function relTime(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function selectDoc(id: string) {
  docMenu.value = false
  if (id === activeId.value) return
  applyLoaded(await loadLibDoc(id))
}

async function newDoc() {
  docMenu.value = false
  await createDoc('', '')
  applyLoaded('')
}

async function deleteDoc(id: string) {
  const next = await removeLibDoc(id)
  if (next !== null) applyLoaded(next)
}

function openDocRename(d?: { id: string; name: string; preview: string }) {
  const target = d ?? activeDoc.value
  if (!target) return
  docRename.value = { show: true, id: target.id, name: target.name, preview: target.preview }
}

async function confirmDocRename() {
  await renameLibDoc(docRename.value.id, docRename.value.name.trim())
  docRename.value.show = false
}

// ─── 固定 / 多选 / 清空 ───
const selectMode = ref(false)
const selectedIds = ref<string[]>([])
const confirmState = ref({ show: false, text: '' })
let confirmAction: (() => void | Promise<void>) | null = null

const unpinnedCount = computed(() => libDocs.value.filter((d) => !d.pinned).length)
const allSelected = computed(
  () => libDocs.value.length > 0 && selectedIds.value.length === libDocs.value.length,
)

// 关掉历史下拉时顺手退出多选, 免得下次打开还停在选择态
watch(docMenu, (open) => {
  if (!open) exitSelect()
})

function onRowClick(d: JsonDoc) {
  if (selectMode.value) toggleSelect(d.id)
  else selectDoc(d.id)
}

function toggleSelect(id: string) {
  const i = selectedIds.value.indexOf(id)
  if (i >= 0) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(id)
}

// toggleSelectAll 全选 / 取消全选(全选含固定项 — 显式全选不拦)
function toggleSelectAll() {
  selectedIds.value = allSelected.value ? [] : libDocs.value.map((d) => d.id)
}

function enterSelect() {
  selectMode.value = true
  selectedIds.value = []
}

function exitSelect() {
  selectMode.value = false
  selectedIds.value = []
}

async function togglePin(d: JsonDoc) {
  await setPin(d.id, !d.pinned)
}

function askConfirm(text: string, action: () => void | Promise<void>) {
  confirmState.value = { show: true, text }
  confirmAction = action
}

async function runConfirm() {
  const action = confirmAction
  confirmState.value.show = false
  confirmAction = null
  if (action) await action()
}

// clearUnpinned 清空全部未固定的历史(固定的保留)
function clearUnpinned() {
  const ids = libDocs.value.filter((d) => !d.pinned).map((d) => d.id)
  if (!ids.length) return
  askConfirm(`清空 ${ids.length} 篇未固定的历史?固定的会保留。`, async () => {
    const next = await removeMany(ids)
    if (next !== null) applyLoaded(next)
  })
}

function deleteSelected() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  askConfirm(`删除所选 ${ids.length} 篇?`, async () => {
    const next = await removeMany(ids)
    if (next !== null) applyLoaded(next)
    exitSelect()
  })
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
  // 打开文件 = 一次导入: 新建一篇以文件名命名的历史文档
  applyLoaded(file.content)
  await createDoc(fileBaseName(file.path), file.content)
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

// 粘贴 = 替换当前文档内容(算作编辑), 自动存进活动文档
function loadContent(text: string) {
  applyLoaded(text)
  scheduleSave()
}

function format() {
  const tree = doc.tree.value
  if (!tree) return
  rawText.value = JSON.stringify(tree.values[0], null, 2)
  doc.parse(rawText.value)
  scheduleSave()
}

function minify() {
  const tree = doc.tree.value
  if (!tree) return
  rawText.value = JSON.stringify(tree.values[0])
  doc.parse(rawText.value)
  scheduleSave()
}

onMounted(async () => {
  // 恢复上次正在看的文档(库为空时用样例 seed), 取代以往每次挂载强塞 SAMPLE
  const content = await initLibrary(SAMPLE_JSON)
  rawText.value = content
  doc.parse(content)
  window.addEventListener('paste', onWindowPaste)
  window.addEventListener('beforeunload', saveNow)
})

onBeforeUnmount(() => {
  // 切走前把未落的最后一次编辑 flush 掉
  saveNow()
  window.removeEventListener('paste', onWindowPaste)
  window.removeEventListener('beforeunload', saveNow)
})
</script>
