<template>
  <v-navigation-drawer
    :model-value="visible"
    :rail="!expanded"
    :width="224"
    :rail-width="76"
    :mobile-breakpoint="0"
    class="rex-nav"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="rex-nav__logo" :class="{ collapsed: !expanded }">
      <img :src="logoUrl" class="rex-nav__logo-img" alt="" aria-hidden="true" />
      <transition name="logo-text">
        <span v-if="expanded" class="rex-nav__logo-text">instrumenta</span>
      </transition>
    </div>

    <v-divider class="mx-3 my-2" />

    <v-list nav density="comfortable" class="px-2">
      <v-list-item
        v-for="tool in tools"
        :key="tool.id"
        :active="current === tool.id"
        :prepend-icon="tool.icon"
        :title="expanded ? tool.title : ''"
        rounded="xl"
        class="rex-nav__item"
        @click="emit('navigate', tool)"
      />
    </v-list>

    <template #append>
      <v-list nav density="comfortable" class="px-2 pb-3">
        <v-list-item
          :prepend-icon="expanded ? 'mdi-chevron-left' : 'mdi-chevron-right'"
          :title="expanded ? '收窄' : ''"
          rounded="xl"
          class="rex-nav__item rex-nav__collapse-btn"
          @click="toggleExpanded"
        />
      </v-list>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ToolDef } from './tool'
import logoUrl from '@/assets/logo.svg'

defineProps<{
  tools: ToolDef[]
  current: string
  visible: boolean
}>()

const emit = defineEmits<{
  navigate: [tool: ToolDef]
  'update:visible': [v: boolean]
}>()

const expanded = ref(localStorage.getItem('ria-nav-expanded') !== '0')

function toggleExpanded() {
  expanded.value = !expanded.value
  localStorage.setItem('ria-nav-expanded', expanded.value ? '1' : '0')
}
</script>
