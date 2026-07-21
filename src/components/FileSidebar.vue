<script setup>
import { nextTick, reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** @type {{ name: string, files: string[] }[]} */
  folders: { type: Array, default: () => [] },
  activeTab: { type: String, default: '' },
  activeFile: { type: String, default: '' },
})

const emit = defineEmits([
  'select',
  'add-folder',
  'remove-folder',
  'add-file',
  'remove-file',
  'rename-file',
])

/** @type {Record<string, boolean>} */
const expanded = reactive({})

const renamingKey = ref('')
const renameDraft = ref('')
const renameInput = ref(null)

let longPressTimer = null

watch(
  () => props.folders.map((f) => f.name).join('\0'),
  () => {
    for (const folder of props.folders) {
      if (expanded[folder.name] === undefined) {
        expanded[folder.name] = true
      }
    }
  },
  { immediate: true },
)

watch(
  () => props.activeTab,
  (tab) => {
    if (tab) expanded[tab] = true
  },
  { immediate: true },
)

function displayName(file) {
  return file.replace(/\.md$/, '')
}

function fileKey(tab, file) {
  return `${tab}/${file}`
}

function isFileActive(tab, file) {
  return tab === props.activeTab && file === props.activeFile
}

function toggleFolder(name) {
  expanded[name] = !expanded[name]
}

function setRenameInput(el) {
  renameInput.value = el
}

async function startRename(tab, file) {
  renamingKey.value = fileKey(tab, file)
  renameDraft.value = displayName(file)
  await nextTick()
  renameInput.value?.focus?.()
  renameInput.value?.select?.()
}

function cancelRename() {
  renamingKey.value = ''
  renameDraft.value = ''
}

function commitRename(tab, file) {
  if (renamingKey.value !== fileKey(tab, file)) return
  const next = renameDraft.value.trim()
  cancelRename()
  if (!next || next === displayName(file)) return
  emit('rename-file', { tab, file, name: next })
}

function onRenameKeydown(e, tab, file) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitRename(tab, file)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelRename()
  }
}

function onFileClick(tab, file, e) {
  if (e.detail > 1) return
  emit('select', { tab, file })
}

function onTouchStart(tab, file) {
  clearTimeout(longPressTimer)
  longPressTimer = setTimeout(() => {
    startRename(tab, file)
  }, 500)
}

function onTouchEnd() {
  clearTimeout(longPressTimer)
  longPressTimer = null
}
</script>

<template>
  <aside class="file-sidebar flex w-full min-h-0 flex-col border-r border-border bg-surface md:w-64 md:shrink-0">
    <div v-if="folders.length" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5">
      <div v-for="folder in folders" :key="folder.name" class="mb-0.5">
        <!-- 文件夹行 -->
        <div
          class="group flex min-h-9 w-full items-center gap-1 rounded-md px-2 py-1 text-sm text-ink transition-colors hover:bg-surface-hover"
          :class="activeTab === folder.name && !activeFile ? 'bg-accent-soft/50' : ''"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border-0 bg-transparent p-0 text-left text-ink outline-none"
            @click="folder.files.length ? toggleFolder(folder.name) : undefined"
          >
            <AppIcon
              v-if="folder.files.length"
              name="chevronRight"
              :size="14"
              class="text-muted transition-transform"
              :class="expanded[folder.name] ? 'rotate-90' : ''"
            />
            <span
              v-else
              class="inline-flex w-[14px] shrink-0"
              aria-hidden="true"
            />
            <AppIcon
              :name="expanded[folder.name] && folder.files.length ? 'folderOpen' : 'folder'"
              :size="16"
              class="text-accent"
            />
            <span class="min-w-0 flex-1 truncate font-medium select-none">{{ folder.name }}</span>
          </button>
          <AppIcon
            name="plus"
            :size="14"
            class="w-5 shrink-0 cursor-pointer text-muted opacity-70 transition-opacity md:w-4 md:opacity-0 md:group-hover:opacity-70 hover:!text-accent hover:!opacity-100"
            title="在此新建文件"
            @click.stop="emit('add-file', folder.name)"
          />
          <AppIcon
            name="close"
            :size="14"
            class="w-5 shrink-0 cursor-pointer text-muted opacity-70 transition-opacity md:w-4 md:opacity-0 md:group-hover:opacity-60 hover:!text-danger hover:!opacity-100"
            title="删除文件夹"
            @click.stop="emit('remove-folder', folder.name)"
          />
        </div>

        <!-- 文件列表：左侧树形连接线，右侧与文件夹行对齐 -->
        <ul
          v-if="folder.files.length && expanded[folder.name]"
          class="m-0 ml-[1.125rem] list-none border-l border-border pl-3"
        >
          <li v-for="file in folder.files" :key="file" class="mb-0.5">
            <div
              v-if="renamingKey === fileKey(folder.name, file)"
              class="flex items-center gap-1 rounded-md border border-accent bg-accent-soft py-1 pl-2 pr-2"
            >
              <input
                :ref="setRenameInput"
                v-model="renameDraft"
                class="min-w-0 flex-1 border-none bg-transparent text-base text-ink outline-none md:text-sm"
                spellcheck="false"
                @keydown="onRenameKeydown($event, folder.name, file)"
                @blur="commitRename(folder.name, file)"
              >
              <span class="text-xs text-accent/70">.md</span>
            </div>

            <div
              v-else
              class="group/file flex min-h-8 w-full cursor-pointer items-center gap-1.5 rounded-md py-1.5 pl-2 pr-2 text-left text-sm transition-colors md:py-1"
              :class="
                isFileActive(folder.name, file)
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-ink hover:bg-surface-hover'
              "
              title="双击或长按重命名"
              @click="onFileClick(folder.name, file, $event)"
              @dblclick.prevent="startRename(folder.name, file)"
              @touchstart.passive="onTouchStart(folder.name, file)"
              @touchend="onTouchEnd"
              @touchmove="onTouchEnd"
              @touchcancel="onTouchEnd"
            >
              <AppIcon name="file" :size="14" class="opacity-70" />
              <span class="min-w-0 flex-1 truncate select-none">{{ displayName(file) }}</span>
              <span
                class="text-xs select-none"
                :class="isFileActive(folder.name, file) ? 'text-accent/70' : 'text-muted'"
              >.md</span>
              <AppIcon
                name="close"
                :size="14"
                class="w-5 shrink-0 text-muted opacity-70 transition-opacity md:w-4 md:opacity-0 md:group-hover/file:opacity-60 hover:!text-danger hover:!opacity-100"
                title="删除文件"
                @click.stop="emit('remove-file', { tab: folder.name, file })"
              />
            </div>
          </li>
        </ul>
      </div>
    </div>

    <p v-else class="m-auto px-4 py-6 text-center text-sm leading-normal text-muted">
      暂无文件夹
    </p>

    <div class="shrink-0 p-2">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-surface-hover px-2 py-2 text-sm text-ink transition-colors hover:bg-accent-soft hover:text-accent"
        @click="emit('add-folder')"
      >
        <span>新建文件夹</span>
      </button>
    </div>
  </aside>
</template>
