<template>
  <div class="rex-json-tool rex-view-enter">
    <div class="rex-json-tool__tabs">
      <button class="rex-json-tab" :class="{ active: mode === 'parse' }" @click="mode = 'parse'">
        <v-icon size="16">mdi-file-tree</v-icon>
        <span>解析 / 折叠</span>
      </button>
      <button class="rex-json-tab" :class="{ active: mode === 'compare' }" @click="mode = 'compare'">
        <v-icon size="16">mdi-compare</v-icon>
        <span>对比</span>
      </button>
    </div>

    <div class="rex-json-tool__body">
      <transition name="rex-fade">
        <ParsePane v-show="mode === 'parse'" :is-dark="isDark" />
      </transition>
      <transition name="rex-fade">
        <CompareView v-show="mode === 'compare'" :is-dark="isDark" />
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, toRefs } from 'vue'
import ParsePane from './components/ParsePane.vue'
import CompareView from './components/CompareView.vue'
import './json.css'

// isDark 由 App.vue 经 router-view 传入, 透传给 canvas 子组件触发 recolor
const props = withDefaults(defineProps<{ isDark?: boolean }>(), { isDark: false })
const { isDark } = toRefs(props)

const mode = ref<'parse' | 'compare'>('parse')
</script>
