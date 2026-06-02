<template>
  <div class="rex-search-bar">
    <button
      class="rex-search-bar__btn rex-search-bar__mode"
      :class="{ active: mode === 'path' }"
      :title="mode === 'path' ? '路径模式 (SQL-like: % 任意, _ 单字符) — 点切回文本' : '文本模式 — 点切到路径模式'"
      @click="emit('update:mode', mode === 'path' ? 'text' : 'path')"
    >
      <v-icon size="15">{{ mode === 'path' ? 'mdi-map-marker-path' : 'mdi-text-search' }}</v-icon>
    </button>
    <input
      class="rex-search-bar__input"
      :value="modelValue"
      :placeholder="placeholder"
      spellcheck="false"
      @input="onInput"
      @keydown.enter.prevent="emit('rerun')"
      @keydown.esc="clear"
      @focus="emit('rerun')"
      @click="emit('rerun')"
    />
    <span v-if="modelValue" class="rex-search-bar__count">{{ countLabel }}</span>
    <button class="rex-search-bar__btn" :disabled="count === 0" title="上一个" @click="emit('prev')">
      <v-icon size="16">mdi-chevron-up</v-icon>
    </button>
    <button class="rex-search-bar__btn" :disabled="count === 0" title="下一个" @click="emit('next')">
      <v-icon size="16">mdi-chevron-down</v-icon>
    </button>
    <button
      v-if="mode === 'text'"
      class="rex-search-bar__btn rex-search-bar__toggle"
      :class="{ active: caseSensitive }"
      title="区分大小写"
      @click="emit('update:caseSensitive', !caseSensitive)"
    >
      Aa
    </button>
    <button
      v-if="modelValue"
      class="rex-search-bar__btn"
      title="保存这个搜索"
      @click="emit('save')"
    >
      <v-icon size="15">mdi-bookmark-plus-outline</v-icon>
    </button>
    <button v-if="modelValue" class="rex-search-bar__btn" title="清除" @click="clear">
      <v-icon size="16">mdi-close</v-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SearchMode } from '../composables/useJsonDocument'

const props = defineProps<{
  modelValue: string
  count: number
  activeIndex: number
  caseSensitive: boolean
  mode: SearchMode
}>()

const emit = defineEmits<{
  'update:modelValue': [v: string]
  'update:caseSensitive': [v: boolean]
  'update:mode': [v: SearchMode]
  next: []
  prev: []
  rerun: []
  save: []
}>()

const countLabel = computed(() => (props.count > 0 ? `${props.activeIndex + 1}/${props.count}` : '0'))
const placeholder = computed(() =>
  props.mode === 'path' ? "路径模式: $.tools[%].features  (% 任意 / _ 单字符)" : '搜索 key / value…',
)

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

function clear() {
  emit('update:modelValue', '')
}
</script>
