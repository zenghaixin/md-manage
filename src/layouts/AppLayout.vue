<script setup>
import { ref } from 'vue'
import { Setting } from '@element-plus/icons-vue'
import SettingsModal from '../components/SettingsModal.vue'

const settingsOpen = ref(false)
</script>

<template>
  <div class="app-shell flex h-full min-h-0 flex-col">
    <header
      class="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 sm:gap-4 sm:px-4"
    >
      <div class="font-display text-lg font-bold tracking-wide text-ink">md</div>
      <div class="flex-1" />
      <el-button
        :icon="Setting"
        circle
        size="default"
        title="设置"
        aria-label="打开设置"
        @click="settingsOpen = true"
      />
    </header>

    <main class="flex min-h-0 flex-1 flex-col">
      <RouterView />
    </main>

    <SettingsModal v-model="settingsOpen" />
  </div>
</template>
