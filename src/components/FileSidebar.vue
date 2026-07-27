<script setup>
import { nextTick, reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import FileTreeNode from './FileTreeNode.vue'

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

const expanded = reactive({})
const renamingKey = ref('')
const renameDraft = ref('')
const renameInput = ref(null)
const dragging = ref(null)
const dropHint = ref(null)
/** 避免 dragend 先于 drop 清空状态导致松手无效果 */
let lastDropIntent = null
let longPressTimer = null

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
</style>
