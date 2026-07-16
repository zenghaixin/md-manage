<!--
 * @Author: zenghaixin seastar.zeng@gmail.com
 * @Date: 2026-07-16 13:59:19
 * @LastEditors: zenghaixin seastar.zeng@gmail.com
 * @LastEditTime: 2026-07-16 14:01:08
 * @FilePath: \game\md-manage\src\layouts\AppLayout.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<script setup>
import { ref } from 'vue'
import { Setting } from '@element-plus/icons-vue'
import SettingsModal from '../components/SettingsModal.vue'

const settingsOpen = ref(false)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header
      class="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-surface px-4"
    >
      <div class="font-display text-lg font-bold tracking-wide text-ink">md</div>
      <div class="flex-1" />
      <el-button
        :icon="Setting"
        circle
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
