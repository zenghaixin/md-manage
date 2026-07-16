<script setup>
import { nextTick, ref } from 'vue'
import { Close } from '@element-plus/icons-vue'

const props = defineProps({
  files: { type: Array, default: () => [] },
  activeFile: { type: String, default: '' },
  tabName: { type: String, default: '' },
})

const emit = defineEmits(['select', 'add', 'remove', 'rename'])

const renamingFile = ref('')
const renameDraft = ref('')
const renameInput = ref(null)

let longPressTimer = null

function displayName(file) {
  return file.replace(/\.md$/, '')
}

function isActive(file) {
  return file === props.activeFile
}

function setRenameInput(el) {
  renameInput.value = el
}

async function startRename(file) {
  renamingFile.value = file
  renameDraft.value = displayName(file)
  await nextTick()
  renameInput.value?.focus?.()
  renameInput.value?.select?.()
}

function cancelRename() {
  renamingFile.value = ''
  renameDraft.value = ''
}

function commitRename(file) {
  if (renamingFile.value !== file) return
  const next = renameDraft.value.trim()
  cancelRename()
  if (!next || next === displayName(file)) return
  emit('rename', { file, name: next })
}

function onRenameKeydown(e, file) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitRename(file)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelRename()
  }
}

function onItemClick(file, e) {
  if (e.detail > 1) return
  emit('select', file)
}

function onTouchStart(file) {
  clearTimeout(longPressTimer)
  longPressTimer = setTimeout(() => {
    startRename(file)
  }, 500)
}

function onTouchEnd() {
  clearTimeout(longPressTimer)
  longPressTimer = null
}
</script>

<template>
  <aside class="file-sidebar flex w-full min-h-0 flex-col border-r border-border bg-surface md:w-60 md:shrink-0">
    <div class="flex items-center border-b border-border px-3.5 py-3">
      <el-button
        size="small"
        type="primary"
        plain
        :disabled="!tabName"
        @click="emit('add')"
      >
        新增md
      </el-button>
    </div>

    <ul v-if="files.length" class="m-0 flex-1 list-none overflow-y-auto overscroll-contain p-2">
      <li v-for="file in files" :key="file" class="mb-0.5">
        <div
          v-if="renamingFile === file"
          class="flex items-center gap-1 rounded-lg border border-accent bg-accent-soft px-2 py-1.5"
        >
          <input
            :ref="setRenameInput"
            v-model="renameDraft"
            class="min-w-0 flex-1 border-none bg-transparent text-base text-ink outline-none md:text-sm"
            spellcheck="false"
            @keydown="onRenameKeydown($event, file)"
            @blur="commitRename(file)"
          >
          <span class="text-xs text-accent/70">.md</span>
        </div>

        <div
          v-else
          class="group flex min-h-11 w-full cursor-pointer items-center gap-1 rounded-lg border border-transparent px-2.5 py-2.5 text-left text-sm transition-colors md:min-h-0 md:py-2"
          :class="
            isActive(file)
              ? 'border-accent/30 bg-accent-soft font-medium text-accent'
              : 'bg-transparent text-ink active:bg-surface-hover hover:bg-surface-hover'
          "
          title="双击或长按重命名"
          @click="onItemClick(file, $event)"
          @dblclick.prevent="startRename(file)"
          @touchstart.passive="onTouchStart(file)"
          @touchend="onTouchEnd"
          @touchmove="onTouchEnd"
          @touchcancel="onTouchEnd"
        >
          <span class="min-w-0 flex-1 truncate select-none">{{ displayName(file) }}</span>
          <span
            class="text-xs select-none"
            :class="isActive(file) ? 'text-accent/70' : 'text-muted'"
          >.md</span>
          <el-icon
            class="w-5 shrink-0 text-muted opacity-70 transition-opacity md:w-4 md:opacity-0 md:group-hover:opacity-60 hover:!text-danger hover:!opacity-100"
            title="删除文件"
            @click.stop="emit('remove', file)"
          >
            <Close />
          </el-icon>
        </div>
      </li>
    </ul>

    <p v-else-if="tabName" class="m-6 text-center text-sm leading-normal text-muted">
      暂无文件
    </p>
    <p v-else class="m-6 text-sm leading-normal text-muted">
      请先创建或选择顶部标签
    </p>
  </aside>
</template>
