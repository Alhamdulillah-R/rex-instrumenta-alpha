<template>
  <teleport to="body">
    <transition name="rex-toast">
      <div v-if="show" class="rex-copy-toast" :class="{ 'rex-copy-toast--err': error }">
        <v-icon size="15">{{ error ? 'mdi-alert-circle-outline' : 'mdi-check-circle-outline' }}</v-icon>
        <span>{{ text }}</span>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
defineProps<{
  show: boolean
  text: string
  error?: boolean
}>()
</script>
