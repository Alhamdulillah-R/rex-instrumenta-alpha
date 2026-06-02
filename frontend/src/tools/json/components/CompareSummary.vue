<template>
  <div class="rex-cmp-summary">
    <button class="rex-cmp-chip" :class="{ active: filter === 'all' }" @click="emit('set-filter', 'all')">
      全部 <b>{{ stats.total }}</b>
    </button>
    <button class="rex-cmp-chip rex-cmp-chip--same" :class="{ active: filter === 'same' }" @click="emit('set-filter', 'same')">
      一致 <b>{{ stats.same }}</b>
    </button>
    <button class="rex-cmp-chip rex-cmp-chip--changed" :class="{ active: filter === 'changed' }" @click="emit('set-filter', 'changed')">
      差异 <b>{{ stats.changed }}</b>
    </button>
    <button class="rex-cmp-chip rex-cmp-chip--removed" :class="{ active: filter === 'removed' }" @click="emit('set-filter', 'removed')">
      仅左 <b>{{ stats.removed }}</b>
    </button>
    <button class="rex-cmp-chip rex-cmp-chip--added" :class="{ active: filter === 'added' }" @click="emit('set-filter', 'added')">
      仅右 <b>{{ stats.added }}</b>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { DiffStats } from '../core/diff'
import type { DiffFilter } from '../render/DiffRenderer'

defineProps<{
  stats: DiffStats
  filter: DiffFilter
}>()

const emit = defineEmits<{ 'set-filter': [filter: DiffFilter] }>()
</script>
