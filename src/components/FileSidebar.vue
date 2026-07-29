<script setup>
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import FileTreeNode from './FileTreeNode.vue'
import {
  onDocumentOutlineChanged,
  requestScrollToHeading,
} from '../editor/shellEvents'

const props = defineProps({
  tree: { type: Array, default: () => [] },
  activePath: { type: String, default: '' },
})

const emit = defineEmits([
  'select',
  'add-root-folder',
  'add-folder',
  'remove-folder',
  'rename-folder',
  'add-file',
  'remove-file',
  'rename-file',
  'move',
])

/** @type {import('vue').Ref<'files' | 'outline'>} */
const sideTab = ref('files')
const sideTabs = [
  { id: 'files', label: '文件' },
  { id: 'outline', label: '大纲' },
]
/** @type {import('vue').Ref<import('../editor/shellEvents').OutlineHeading[]>} */
const outline = ref([])
const activeOutlineId = ref('')

const expanded = reactive({})
const renamingKey = ref('')
const renameDraft = ref('')
const renameInput = ref(null)
const dragging = ref(null)
const dropHint = ref(null)
/** 避免 dragend 先于 drop 清空状态导致松手无效果 */
let lastDropIntent = null
let longPressTimer = null
let stopOutline = null

watch(
  () => JSON.stringify(props.tree),
  () => {
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.type !== 'folder') continue
        if (expanded[n.path] === undefined) expanded[n.path] = true
        walk(n.children)
      }
    }
    walk(props.tree)
  },
  { immediate: true },
)

watch(
  () => props.activePath,
  (p) => {
    if (!p) return
    const parts = p.split('/')
    let acc = ''
    for (let i = 0; i < parts.length - 1; i += 1) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i]
      expanded[acc] = true
    }
  },
  { immediate: true },
)

onMounted(() => {
  stopOutline = onDocumentOutlineChanged((items) => {
    outline.value = items || []
    if (
      activeOutlineId.value &&
      !outline.value.some((h) => h.id === activeOutlineId.value)
    ) {
      activeOutlineId.value = ''
    }
  })
})

onUnmounted(() => {
  stopOutline?.()
  stopOutline = null
})

function setSideTab(tab) {
  sideTab.value = tab
}

function onOutlineClick(item) {
  if (!item) return
  activeOutlineId.value = item.id
  requestScrollToHeading({ pos: item.pos, line: item.line })
}

function outlinePad(level) {
  const lv = Math.min(Math.max(Number(level) || 1, 1), 6)
  return `${(lv - 1) * 0.7}rem`
}

function displayName(fileName) {
  return String(fileName || '').replace(/\.md$/, '')
}

function setRenameInput(el) {
  renameInput.value = el || null
}

function focusRenameInput() {
  renameInput.value?.focus?.()
  renameInput.value?.select?.()
}

function cancelRename() {
  renamingKey.value = ''
  renameDraft.value = ''
}

async function startRename(path, draft) {
  renamingKey.value = path
  renameDraft.value = draft
  await nextTick()
  focusRenameInput()
}

function commitRename(node) {
  if (renamingKey.value !== node.path) return
  const next = renameDraft.value.trim()
  cancelRename()
  if (!next) return
  if (node.type === 'folder') {
    if (next === node.name) return
    emit('rename-folder', { path: node.path, name: next })
  } else if (next !== displayName(node.name)) {
    emit('rename-file', { path: node.path, name: next })
  }
}

function onRenameKeydown(e, node) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitRename(node)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelRename()
  }
}

function toggleFolder(path) {
  expanded[path] = !expanded[path]
}

function onTouchStart(node) {
  clearTimeout(longPressTimer)
  longPressTimer = setTimeout(() => {
    startRename(
      node.path,
      node.type === 'file' ? displayName(node.name) : node.name,
    )
  }, 500)
}

function onTouchEnd() {
  clearTimeout(longPressTimer)
  longPressTimer = null
}

function onDragStart(e, node) {
  dragging.value = { type: node.type, path: node.path }
  lastDropIntent = null
  dropHint.value = null
  e.dataTransfer.effectAllowed = 'move'
  try {
    e.dataTransfer.setData('text/plain', node.path)
  } catch {
    // ignore
  }
}

function onDragEnd() {
  // drop 通常在 dragend 之前；若取消拖拽则稍后清掉指示
  window.setTimeout(() => {
    dragging.value = null
    dropHint.value = null
    // lastDropIntent 留给可能稍晚的 drop；再延迟清一次
  }, 0)
  window.setTimeout(() => {
    lastDropIntent = null
  }, 50)
}

function isInvalidDrop(targetFolderPath) {
  const drag = dragging.value
  if (!drag || drag.type !== 'folder') return false
  if (targetFolderPath === drag.path) return true
  if (targetFolderPath.startsWith(`${drag.path}/`)) return true
  return false
}

function setDropIntent(intent) {
  lastDropIntent = intent
  dropHint.value = intent
}

function onDragOverRow(e, opts) {
  e.preventDefault()
  e.stopPropagation()
  if (!dragging.value) return
  try {
    e.dataTransfer.dropEffect = 'move'
  } catch {
    // ignore
  }

  if (opts.intoFolder && opts.node?.type === 'folder') {
    const folderPath = opts.node.path
    if (isInvalidDrop(folderPath)) {
      setDropIntent(null)
      return
    }
    // 折叠：落入该文件夹末尾；展开时也允许落在文件夹行上 = 末尾
    setDropIntent({ parentPath: folderPath, index: -1, mode: 'into' })
    return
  }

  if (dragging.value.type === 'folder' && isInvalidDrop(opts.parentPath)) {
    setDropIntent(null)
    return
  }

  const rect = e.currentTarget.getBoundingClientRect()
  const before = e.clientY < rect.top + rect.height / 2
  setDropIntent({
    parentPath: opts.parentPath,
    index: before ? opts.index : opts.index + 1,
    mode: before ? 'before' : 'after',
  })
}

function onDropRow(e) {
  e.preventDefault()
  e.stopPropagation()
  const drag =
    dragging.value ||
    (() => {
      const path = e.dataTransfer?.getData?.('text/plain') || ''
      if (!path) return null
      return {
        type: path.endsWith('.md') ? 'file' : 'folder',
        path,
      }
    })()
  const hint = lastDropIntent || dropHint.value
  dragging.value = null
  dropHint.value = null
  lastDropIntent = null
  if (!drag?.path || !hint) return
  if (drag.type === 'folder' && isInvalidDrop(hint.parentPath)) return

  emit('move', {
    fromPath: drag.path,
    toParentPath: hint.parentPath,
    toIndex: hint.index,
  })
}

const treeApi = reactive({
  expanded,
  get renamingKey() {
    return renamingKey.value
  },
  get renameDraft() {
    return renameDraft.value
  },
  set renameDraft(v) {
    renameDraft.value = v
  },
  get dragging() {
    return dragging.value
  },
  get dropHint() {
    return dropHint.value
  },
  activePath: () => props.activePath,
  displayName,
  setRenameInput,
  toggleFolder,
  startRename,
  commitRename,
  onRenameKeydown,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDropRow,
  onTouchStart,
  onTouchEnd,
  emitSelect: (path) => emit('select', { path }),
  emitAddFolder: (path) => emit('add-folder', path),
  emitAddFile: (path) => emit('add-file', path),
  emitRemoveFolder: (path) => emit('remove-folder', path),
  emitRemoveFile: (path) => emit('remove-file', path),
})
</script>

<template>
  <aside class="file-sidebar flex h-full w-full min-h-0 flex-col border-r border-border bg-surface">
    <div
      class="sidebar-tab-bar shrink-0 px-2 pt-2"
      role="tablist"
      aria-label="侧栏视图"
    >
      <button
        v-for="tab in sideTabs"
        :key="tab.id"
        type="button"
        role="tab"
        class="sidebar-bookmark-tab"
        :class="{ 'is-active': sideTab === tab.id }"
        :aria-selected="sideTab === tab.id"
        @click="setSideTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <template v-if="sideTab === 'files'">
      <div
        v-if="tree.length"
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5"
        @dragover.prevent="onDragOverRow($event, { parentPath: '', index: tree.length })"
        @drop="onDropRow"
      >
        <FileTreeNode
          v-for="(node, index) in tree"
          :key="node.path"
          :node="node"
          :index="index"
          parent-path=""
          :api="treeApi"
        />
      </div>

      <p v-else class="m-auto px-4 py-6 text-center text-sm leading-normal text-muted">
        暂无文件夹
      </p>

      <div class="shrink-0 p-2">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-surface-hover px-2 py-2 text-sm text-ink transition-colors hover:bg-accent-soft hover:text-accent"
          @click="emit('add-root-folder')"
        >
          <span>新建文件夹</span>
        </button>
      </div>
    </template>

    <template v-else>
      <div
        v-if="outline.length"
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5"
        role="list"
        aria-label="文档大纲"
      >
        <button
          v-for="item in outline"
          :key="item.id"
          type="button"
          role="listitem"
          class="mb-0.5 flex w-full cursor-pointer items-start rounded-md border-0 px-2 py-1.5 text-left text-sm leading-snug transition-colors"
          :class="
            item.id === activeOutlineId
              ? 'bg-accent-soft text-accent'
              : 'bg-transparent text-ink hover:bg-surface-hover'
          "
          :style="{ paddingLeft: `calc(0.5rem + ${outlinePad(item.level)})` }"
          :title="item.text"
          @click="onOutlineClick(item)"
        >
          <span
            class="mr-1.5 shrink-0 font-mono text-[0.7rem] leading-5 text-muted"
            aria-hidden="true"
          >H{{ item.level }}</span>
          <span class="min-w-0 flex-1 truncate">{{ item.text }}</span>
        </button>
      </div>

      <p v-else class="m-auto px-4 py-6 text-center text-sm leading-normal text-muted">
        {{ activePath ? '当前文档暂无标题' : '打开文档后显示大纲' }}
      </p>
    </template>
  </aside>
</template>

<style>
.file-sidebar .drop-before::before,
.file-sidebar .drop-after::after {
  content: '';
  position: absolute;
  left: 0.25rem;
  right: 0.25rem;
  height: 2px;
  background: var(--accent, #2563eb);
  pointer-events: none;
  z-index: 2;
}
.file-sidebar .drop-before::before {
  top: 0;
}
.file-sidebar .drop-after::after {
  bottom: 0;
}
.file-sidebar .drop-into {
  outline: 1px solid var(--accent, #2563eb);
  background: color-mix(in srgb, var(--accent, #2563eb) 12%, transparent);
}

.sidebar-tab-bar {
  display: flex;
  gap: 0.35rem;
  border-bottom: 1px solid var(--border, #c5d0d8);
}

.sidebar-bookmark-tab {
  position: relative;
  box-sizing: border-box;
  flex: 1;
  margin: 0 0 -1px;
  padding: 0.45rem 0.5rem 0.55rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 0.45rem 0.45rem 0 0;
  background: color-mix(in srgb, var(--surface, #f4f7f9) 88%, var(--ink, #1a2830));
  color: var(--muted, #5a6b75);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 -1px 4px rgba(26, 40, 48, 0.08);
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.sidebar-bookmark-tab:hover {
  background: var(--surface-hover, #e8eef2);
  color: var(--ink, #1a2830);
}

.sidebar-bookmark-tab.is-active {
  z-index: 1;
  background: transparent;
  color: var(--accent, #2563eb);
  border-color: var(--border, #c5d0d8);
  border-bottom-color: var(--surface, #f4f7f9);
  box-shadow: 0 -1px 5px rgba(26, 40, 48, 0.1);
}
</style>
