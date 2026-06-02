<template>
  <header class="rex-topbar">
    <h1 class="rex-topbar__title">{{ title }}</h1>
  </header>
</template>

<script setup lang="ts">
defineProps<{ title: string }>()
</script>
