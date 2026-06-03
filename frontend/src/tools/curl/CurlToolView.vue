<template>
  <div class="rex-curl">
    <!-- 工具条 -->
    <div class="rex-curl__toolbar">
      <v-btn
        size="small"
        variant="text"
        :icon="inputCollapsed ? 'mdi-dock-left' : 'mdi-chevron-left'"
        :title="inputCollapsed ? '展开 curl 输入' : '收起 curl 输入'"
        @click="inputCollapsed = !inputCollapsed"
      />
      <div class="rex-curl__brand">
        <v-icon size="19" color="primary">mdi-language-python</v-icon>
        <span class="rex-curl__brand-txt">cURL → curl_cffi</span>
      </div>
      <div class="rex-curl__grow" />
      <span class="rex-curl__imp-label">impersonate</span>
      <v-combobox
        v-model="impersonate"
        :items="impOptions"
        density="compact"
        variant="outlined"
        hide-details
        class="rex-curl__imp"
        @blur="commitImpersonate"
        @keydown.enter="commitImpersonate"
      >
        <template #item="{ props, item }">
          <v-list-item v-bind="props">
            <template v-if="isCustomImp(item.value)" #append>
              <v-icon size="15" class="rex-curl__imp-del" title="删除此自定义版本" @click.stop="removeImp(item.value)">mdi-close</v-icon>
            </template>
          </v-list-item>
        </template>
      </v-combobox>
      <v-btn size="small" variant="text" prepend-icon="mdi-broom" :disabled="!input" @click="clearAll">清空</v-btn>
      <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-content-copy" :disabled="!output" @click="copyOut">复制</v-btn>
    </div>

    <!-- 左右分屏: curl 输入 / curl_cffi 输出 -->
    <div class="rex-curl__body">
      <section class="rex-curl__pane" :class="{ 'rex-curl__pane--collapsed': inputCollapsed }">
        <div class="rex-curl__label">
          <v-icon size="13">mdi-console-line</v-icon>
          <span>curl 命令</span>
        </div>
        <textarea
          v-model="input"
          class="rex-curl__io"
          spellcheck="false"
          autocomplete="off"
          placeholder="粘贴 curl 命令(支持 Reqable 导出的多 -H 形式)…"
        />
      </section>

      <section class="rex-curl__pane">
        <div class="rex-curl__label">
          <v-icon size="13">mdi-language-python</v-icon>
          <span>curl_cffi 代码</span>
          <span v-if="error" class="rex-curl__err" :title="error">{{ error }}</span>
        </div>
        <textarea
          v-if="output"
          class="rex-curl__io rex-curl__io--out"
          :value="output"
          readonly
          spellcheck="false"
        />
        <div v-else class="rex-curl__io rex-curl__empty">{{ error ? '↑ 解析失败,检查 curl 是否完整' : '左侧粘贴 curl,自动转换为 curl_cffi 代码' }}</div>
      </section>
    </div>

    <CopyToast :show="toast.show" :text="toast.text" :error="toast.error" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onBeforeUnmount } from 'vue'
import { convertCurlToCffi } from './core/convert'
import { useImpersonate } from './composables/useImpersonate'
import { copyText } from '@/platform/native'
import CopyToast from '@/tools/json/components/CopyToast.vue'
import './curl.css'

// impersonate 版本(记忆上次选/填 + 自定义累加; commit 在失焦/回车确认时才累加, 避免输入中间态)
const {
  current: impersonate,
  options: impOptions,
  commit: commitImpersonate,
  removeCustom: removeImp,
  isCustom: isCustomImp,
} = useImpersonate()

const input = ref('')
const inputCollapsed = ref(false)
const output = ref('')
const error = ref('')
const toast = reactive({ show: false, text: '', error: false })

// 输入防抖转换; impersonate 变化即时重转(解析很快)
let convertTimer: ReturnType<typeof setTimeout> | undefined
function scheduleConvert() {
  clearTimeout(convertTimer)
  convertTimer = setTimeout(runConvert, 220)
}
function runConvert() {
  const curl = input.value.trim()
  if (!curl) {
    output.value = ''
    error.value = ''
    return
  }
  try {
    output.value = convertCurlToCffi(curl, (impersonate.value || 'chrome146').trim())
    error.value = ''
  } catch (e) {
    output.value = ''
    error.value = e instanceof Error ? e.message : String(e)
  }
}

watch(input, scheduleConvert)
watch(impersonate, runConvert)
onBeforeUnmount(() => clearTimeout(convertTimer))

let toastTimer: ReturnType<typeof setTimeout> | undefined
function flashToast(text: string, isErr = false) {
  toast.text = text
  toast.error = isErr
  toast.show = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.show = false), 1600)
}

async function copyOut() {
  if (!output.value) return
  const ok = await copyText(output.value)
  flashToast(ok ? '已复制 curl_cffi 代码' : '复制失败', !ok)
}

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}
</script>
