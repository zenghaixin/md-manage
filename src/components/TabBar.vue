<script setup>
import { Plus, Close } from '@element-plus/icons-vue'

defineProps({
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: '' },
})

const emit = defineEmits(['select', 'add', 'remove'])
</script>

<template>
  <div class="flex min-h-10 shrink-0 items-stretch border-b border-border bg-surface px-4">
    <nav class="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto pt-1.5" aria-label="页面标签">
      <button
        v-for="tab in tabs"
        :key="tab"
        type="button"
        class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-lg border border-transparent border-b-0 px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-ink"
        :class="
          tab === activeTab
            ? 'border-border bg-bg font-semibold text-ink'
            : ''
        "
        @click="emit('select', tab)"
      >
        <span>{{ tab }}</span>
        <el-icon
          class="opacity-45 hover:rounded hover:bg-danger-soft hover:text-danger hover:opacity-100"
          title="删除标签及文件夹"
          @click.stop="emit('remove', tab)"
        >
          <Close />
        </el-icon>
      </button>
      <el-button
        class="mb-0.5"
        :icon="Plus"
        text
        type="primary"
        title="新增标签"
        @click="emit('add')"
      />
    </nav>
  </div>
</template>
