<template>
  <div v-if="stats" class="rex-stats-bar">
    <span class="rex-stat"><b>{{ fmt(stats.totalNodes) }}</b> 节点</span>
    <span class="rex-stat-dot" />
    <span class="rex-stat"><b>{{ stats.maxDepth }}</b> 层深</span>
    <span class="rex-stat-dot" />
    <span class="rex-stat rex-stat--obj"><b>{{ fmt(stats.objects) }}</b> 对象</span>
    <span class="rex-stat rex-stat--arr"><b>{{ fmt(stats.arrays) }}</b> 数组</span>
    <span class="rex-stat rex-stat--str"><b>{{ fmt(stats.strings) }}</b> 串</span>
    <span class="rex-stat rex-stat--num"><b>{{ fmt(stats.numbers) }}</b> 数</span>
    <span class="rex-stat rex-stat--bool"><b>{{ fmt(stats.booleans) }}</b> 布尔</span>
    <span class="rex-stat rex-stat--null"><b>{{ fmt(stats.nulls) }}</b> null</span>
    <span class="rex-stat-dot" />
    <span class="rex-stat"><b>{{ fmt(stats.keys) }}</b> 键</span>
    <span class="rex-stat"><b>{{ humanSize(stats.byteSize) }}</b></span>
  </div>
</template>

<script setup lang="ts">
import type { JsonStats } from '../core/stats'

defineProps<{ stats: JsonStats | null }>()

// fmt 千分位, 大计数也好读
function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
</script>
