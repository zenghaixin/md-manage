<script setup>
/**
 * 入口文件通用字段编辑器（挂在「通用字段」右栏书签）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '../../../../../components/AppIcon.vue'
import { api } from '../../../../../api'
import { alertError } from '../../../../../composables/useDialog'
import {
  GlossaryFieldKindPicker,
  TermFieldMarkdown,
  TermFieldTermRef,
  TermFieldText,
  fieldKindLabel,
} from '../fields'
import { glossaryEntryLabel, normalizeDocPath } from '../shared/glossaryPaths'
import { extractGlossarySubtree } from '../shared/termRefSlots'
import {
  emptyTermSchema,
  defaultTermSchemaFields,
  makeUniqueFieldLabel,
  normalizeSchemaField,
  normalizeTermSchema,
  saveTermSchema,
} from '../shared/termSchema'

const props = defineProps({
  /** 当前编辑的入口 md path */
  entryPath: { type: String, default: '' },
  /** 是否显示「入口文件」下拉（侧栏跟随当前页时可关） */
  showEntryPicker: { type: Boolean, default: true },
})

const emit = defineEmits(['saved', 'path-change'])

const entryOptions = ref([])
const selectedPath = ref(normalizeDocPath(props.entryPath))
const fileName = ref('')
const fields = ref([])
const busy = ref(false)
const dirty = ref(false)
const loadError = ref('')
/** @type {import('vue').Ref<Array<object>>} */
const glossaryTreeNodes = ref([])

/** 字段列表：对齐 fanwei-mini/draggable-list 的长按拖拽效果 */
const listEl = ref(null)
const dragging = ref(false)
const dragFromIndex = ref(-1)
const dragHoverIndex = ref(-1)
/** @type {import('vue').Ref<object | null>} */
const dragGhostField = ref(null)
const dragGhostTop = ref(0)
const dragGhostLeft = ref(0)
const dragGhostWidth = ref(0)
const dragGhostHeight = ref(0)
const LONG_PRESS_MS = 320
const MOVE_CANCEL_PX = 12
/** @type {ReturnType<typeof setTimeout> | null} */
let pressTimer = null
/** @type {{ index: number, startX: number, startY: number, x: number, y: number, pointerId: number } | null} */
let pressState = null
/** @type {Element | null} */
let captureEl = null
let rowHeight = 72

function clearPressTimer() {
  if (pressTimer != null) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}

function unbindDragListeners() {
  document.removeEventListener('pointermove', onDragPointerMove, true)
  document.removeEventListener('pointerup', onDragPointerUp, true)
  document.removeEventListener('pointercancel', onDragPointerUp, true)
}

function bindDragListeners() {
  document.addEventListener('pointermove', onDragPointerMove, {
    capture: true,
    passive: false,
  })
  document.addEventListener('pointerup', onDragPointerUp, true)
  document.addEventListener('pointercancel', onDragPointerUp, true)
}

function measureListMetrics(rowEl) {
  const root = listEl.value
  if (root) {
    const rect = root.getBoundingClientRect()
    dragGhostLeft.value = Math.round(rect.left)
    dragGhostWidth.value = Math.round(rect.width)
  }
  if (rowEl) {
    const rh = rowEl.getBoundingClientRect().height
    if (rh > 0) {
      rowHeight = rh
      dragGhostHeight.value = Math.round(rh)
    }
  }
}

/** 跟手：幽灵垂直居中于指针（同 draggable-list 的 dragGhostTop） */
function moveGhost(clientY) {
  dragGhostTop.value = Math.round(clientY - rowHeight / 2)
}

function endDragSession() {
  clearPressTimer()
  unbindDragListeners()
  if (pressState?.pointerId != null) {
    try {
      captureEl?.releasePointerCapture?.(pressState.pointerId)
    } catch {
      // ignore
    }
  }
  captureEl = null
  pressState = null
  dragging.value = false
  dragFromIndex.value = -1
  dragHoverIndex.value = -1
  dragGhostField.value = null
  dragGhostTop.value = 0
  document.body.classList.remove('is-schema-field-dragging')
}

function hoverIndexAtPoint(clientY) {
  const root = listEl.value
  if (!root) return -1
  const rows = root.querySelectorAll('[data-schema-row]')
  if (!rows.length) return -1
  for (let i = 0; i < rows.length; i += 1) {
    const rect = rows[i].getBoundingClientRect()
    if (clientY >= rect.top && clientY <= rect.bottom) return i
  }
  const first = rows[0].getBoundingClientRect()
  if (clientY < first.top) return 0
  return rows.length - 1
}

function moveField(from, to) {
  if (from < 0 || to < 0 || from === to) return
  if (from >= fields.value.length || to >= fields.value.length) return
  const list = fields.value.slice()
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  fields.value = list
  dirty.value = true
}

function beginRowDrag(index, clientY) {
  if (dragging.value) return
  const rows = listEl.value?.querySelectorAll('[data-schema-row]')
  const rowEl = rows?.[index]
  const field = fields.value[index]
  if (!rowEl || !field) return
  measureListMetrics(rowEl)
  dragging.value = true
  dragFromIndex.value = index
  dragHoverIndex.value = index
  dragGhostField.value = field
  moveGhost(clientY)
  document.body.classList.add('is-schema-field-dragging')
}

function onRowPointerDown(e, index) {
  if (busy.value) return
  if (e.button != null && e.button !== 0) return
  e.preventDefault()
  clearPressTimer()
  pressState = {
    index,
    startX: e.clientX,
    startY: e.clientY,
    x: e.clientX,
    y: e.clientY,
    pointerId: e.pointerId,
  }
  captureEl = e.currentTarget
  try {
    captureEl?.setPointerCapture?.(e.pointerId)
  } catch {
    // ignore
  }
  bindDragListeners()
  pressTimer = setTimeout(() => {
    pressTimer = null
    if (!pressState || pressState.index !== index) return
    beginRowDrag(index, pressState.y)
  }, LONG_PRESS_MS)
}

function onDragPointerMove(e) {
  if (!pressState || e.pointerId !== pressState.pointerId) return
  pressState.x = e.clientX
  pressState.y = e.clientY
  if (!dragging.value) {
    const dx = e.clientX - pressState.startX
    const dy = e.clientY - pressState.startY
    if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
      endDragSession()
    }
    return
  }
  e.preventDefault()
  moveGhost(e.clientY)
  dragHoverIndex.value = hoverIndexAtPoint(e.clientY)
}

function onDragPointerUp(e) {
  if (!pressState || e.pointerId !== pressState.pointerId) return
  if (dragging.value) {
    e.preventDefault()
    const from = dragFromIndex.value
    const to = dragHoverIndex.value
    moveField(from, to)
  }
  endDragSession()
}

function endDrag() {
  endDragSession()
}

async function loadEntryOptions() {
  try {
    const data = await api.getGlossaryEntries()
    entryOptions.value = (Array.isArray(data?.entries) ? data.entries : [])
      .map((e) => ({
        path: normalizeDocPath(e.path || ''),
        label: String(e.label || glossaryEntryLabel(e.path) || e.path),
      }))
      .filter((e) => e.path)
  } catch (err) {
    console.warn('[schema-editor] load entries failed:', err)
    entryOptions.value = []
  }
}

async function loadGlossaryTree() {
  try {
    const data = await api.getTree()
    glossaryTreeNodes.value = extractGlossarySubtree(data?.tree || [])
  } catch (err) {
    console.warn('[schema-editor] load glossary tree failed:', err)
    glossaryTreeNodes.value = []
  }
}

async function loadSchema(pathRel) {
  const path = normalizeDocPath(pathRel)
  loadError.value = ''
  if (!path) {
    fields.value = []
    fileName.value = ''
    return
  }
  busy.value = true
  try {
    const data = await api.getGlossarySchema(path)
    selectedPath.value = normalizeDocPath(data?.path || path)
    fileName.value = String(data?.fileName || glossaryEntryLabel(path))
    let schema = normalizeTermSchema(data?.schema)
    // 服务端偶发空模板时，前端补默认并落盘，与「恢复」一致
    if (!schema.fields.length) {
      schema = {
        version: 1,
        fields: defaultTermSchemaFields(),
      }
      try {
        schema = await saveTermSchema(selectedPath.value, schema)
      } catch (err) {
        console.warn('[schema-editor] seed default schema failed:', err)
      }
    }
    fields.value = schema.fields.map((f) => ({
      label: f.label,
      type: f.type === 'markdown' || f.type === 'term' ? f.type : 'text',
      sourcePath: f.sourcePath || '',
    }))
    dirty.value = false
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '加载失败'
    fields.value = []
  } finally {
    busy.value = false
  }
}

function onSelectPath(path) {
  const next = normalizeDocPath(path)
  if (!next || next === selectedPath.value) return
  selectedPath.value = next
  emit('path-change', next)
  void loadSchema(next)
}

const addPickerOpen = ref(false)

function openAddPicker() {
  if (busy.value || !selectedPath.value) return
  addPickerOpen.value = !addPickerOpen.value
}

function addField(kind) {
  const type =
    kind === 'markdown' || kind === 'term' || kind === 'text' ? kind : 'text'
  const labels = fields.value.map((f) => f.label)
  fields.value = [
    ...fields.value,
    {
      label: makeUniqueFieldLabel('新字段', labels),
      type,
      sourcePath: '',
    },
  ]
  dirty.value = true
}

function removeField(index) {
  fields.value = fields.value.filter((_, i) => i !== index)
  dirty.value = true
}

function onLabelChange(index) {
  const row = fields.value[index]
  if (!row) return
  const others = fields.value.filter((_, i) => i !== index).map((f) => f.label)
  row.label = makeUniqueFieldLabel(row.label || '新字段', others)
  dirty.value = true
}

function onSourcePathChange(index, path) {
  const row = fields.value[index]
  if (!row) return
  row.sourcePath = normalizeDocPath(path)
  dirty.value = true
}

function restoreDefaultFields() {
  if (busy.value || !selectedPath.value) return
  fields.value = defaultTermSchemaFields().map((f) => ({
    ...f,
    sourcePath: '',
  }))
  dirty.value = true
}

async function save() {
  const path = normalizeDocPath(selectedPath.value)
  if (!path || busy.value) return
  busy.value = true
  try {
    const schema = emptyTermSchema()
    schema.fields = fields.value
      .map((f) => {
        const type =
          f.type === 'markdown' || f.type === 'term' || f.type === 'text'
            ? f.type
            : 'text'
        return normalizeSchemaField({
          label: String(f.label || '').trim(),
          type,
          sourcePath: type === 'term' ? f.sourcePath : '',
        })
      })
      .filter(Boolean)
    const saved = await saveTermSchema(path, schema)
    fields.value = saved.fields.map((f) => ({
      label: f.label,
      type: f.type === 'markdown' || f.type === 'term' ? f.type : 'text',
      sourcePath: f.sourcePath || '',
    }))
    dirty.value = false
    emit('saved', { path, schema: saved })
  } catch (err) {
    await alertError(err instanceof Error ? err.message : '保存字段模板失败')
  } finally {
    busy.value = false
  }
}

watch(
  () => props.entryPath,
  (path) => {
    const next = normalizeDocPath(path)
    if (!next) return
    if (next === selectedPath.value) return
    selectedPath.value = next
    void loadSchema(next)
  },
)

onMounted(async () => {
  void loadGlossaryTree()
  if (props.showEntryPicker) await loadEntryOptions()
  const initial = normalizeDocPath(props.entryPath)
  if (initial) {
    selectedPath.value = initial
    await loadSchema(initial)
    return
  }
  // 未指定入口时：仅在展示选择器时回退到列表首项
  if (props.showEntryPicker) {
    await loadEntryOptions()
    const fallback = entryOptions.value[0]?.path || ''
    if (fallback) {
      selectedPath.value = fallback
      await loadSchema(fallback)
      emit('path-change', fallback)
    }
  }
})

onBeforeUnmount(() => {
  endDrag()
})
</script>

<template>
  <div class="glossary-schema-editor flex h-full min-h-0 flex-col gap-3">
    <label
      v-if="showEntryPicker"
      class="glossary-schema-editor__field shrink-0"
    >
      <span class="glossary-schema-editor__label">入口文件</span>
      <select
        class="glossary-schema-editor__input"
        :value="selectedPath"
        :disabled="busy"
        @change="onSelectPath(($event.target).value)"
      >
        <option
          v-for="opt in entryOptions"
          :key="opt.path"
          :value="opt.path"
        >
          {{ opt.label }}
        </option>
      </select>
    </label>

    <p
      v-if="!entryPath && !selectedPath"
      class="m-0 text-sm text-[color:var(--muted,#5a6b75)]"
    >
      请先打开词条目录下的入口文件。
    </p>

    <p
      v-if="loadError"
      class="m-0 text-sm text-[color:var(--danger,#b42318)]"
    >
      {{ loadError }}
    </p>

    <div
      ref="listEl"
      class="glossary-schema-editor__list min-h-0 flex-1 overflow-y-auto overscroll-contain"
      :class="{ 'is-dragging': dragging }"
    >
      <p
        v-if="!fields.length"
        class="m-0 py-4 text-center text-sm text-[color:var(--muted,#5a6b75)]"
      >
        尚未配置字段
      </p>

      <div
        v-for="(field, index) in fields"
        :key="`${field.label}:${field.type}:${index}`"
        class="glossary-schema-editor__row"
        :class="{
          'is-drag-source': dragging && dragFromIndex === index,
          'is-drag-hover':
            dragging &&
            dragHoverIndex === index &&
            dragFromIndex !== index,
        }"
        data-schema-row
      >
        <div class="glossary-schema-editor__row-main">
          <button
            type="button"
            class="glossary-schema-editor__drag-handle"
            title="长按拖动排序"
            aria-label="长按拖动排序"
            @pointerdown="onRowPointerDown($event, index)"
          >
            <AppIcon name="grip" :size="20" />
          </button>
          <input
            v-model="field.label"
            class="glossary-schema-editor__input"
            placeholder="标题"
            @input="onLabelChange(index)"
          >
          <button
            type="button"
            class="glossary-schema-editor__icon-btn"
            title="删除字段"
            aria-label="删除字段"
            @click="removeField(index)"
          >
            <AppIcon name="trash" :size="14" />
          </button>
        </div>
        <div class="glossary-schema-editor__preview">
          <TermFieldText
            v-if="field.type === 'text'"
            model-value=""
            :placeholder="fieldKindLabel(field.type)"
            disabled
          />
          <TermFieldMarkdown
            v-else-if="field.type === 'markdown'"
            model-value=""
            :placeholder="fieldKindLabel(field.type)"
            :min-height="120"
            disabled
          />
          <TermFieldTermRef
            v-else-if="field.type === 'term'"
            :model-value="[]"
            :source-path="field.sourcePath || ''"
            :nodes="glossaryTreeNodes"
            :placeholder="fieldKindLabel(field.type)"
            disabled
            :show-source-picker="true"
            @update:source-path="onSourcePathChange(index, $event)"
          />
        </div>
      </div>
    </div>

    <div class="glossary-schema-editor__actions shrink-0">
      <div class="glossary-schema-editor__toolbar">
        <button
          type="button"
          class="glossary-schema-editor__tool-btn"
          title="恢复为标题 + 备注"
          aria-label="恢复为标题 + 备注"
          :disabled="busy || !selectedPath"
          @click="restoreDefaultFields"
        >
          <AppIcon name="restore" :size="16" />
        </button>
        <GlossaryFieldKindPicker
          v-model="addPickerOpen"
          :nodes="glossaryTreeNodes"
          @select="addField"
        >
          <button
            type="button"
            class="glossary-schema-editor__add"
            title="添加字段"
            aria-label="添加字段"
            :disabled="busy || !selectedPath"
            @click="openAddPicker"
          >
            <AppIcon name="plus" :size="16" />
          </button>
        </GlossaryFieldKindPicker>
      </div>
      <button
        type="button"
        class="glossary-schema-editor__btn is-primary"
        :disabled="busy || !selectedPath || !dirty"
        @click="save"
      >
        保存
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="dragging && dragGhostField"
        class="glossary-schema-drag-ghost"
        aria-hidden="true"
        :style="{
          left: `${dragGhostLeft}px`,
          width: `${dragGhostWidth}px`,
          top: `${dragGhostTop}px`,
          minHeight: dragGhostHeight ? `${dragGhostHeight}px` : undefined,
        }"
      >
        <div class="glossary-schema-editor__row-main">
          <span class="glossary-schema-editor__drag-handle" aria-hidden="true">
            <AppIcon name="grip" :size="20" />
          </span>
          <input
            class="glossary-schema-editor__input"
            :value="dragGhostField.label || ''"
            placeholder="标题"
            disabled
            tabindex="-1"
          >
          <span class="glossary-schema-editor__icon-btn" aria-hidden="true">
            <AppIcon name="trash" :size="14" />
          </span>
        </div>
        <div class="glossary-schema-editor__preview">
          <TermFieldText
            v-if="dragGhostField.type === 'text'"
            model-value=""
            :placeholder="fieldKindLabel(dragGhostField.type)"
            disabled
          />
          <TermFieldMarkdown
            v-else-if="dragGhostField.type === 'markdown'"
            model-value=""
            :placeholder="fieldKindLabel(dragGhostField.type)"
            :min-height="120"
            disabled
          />
          <TermFieldTermRef
            v-else-if="dragGhostField.type === 'term'"
            :model-value="[]"
            :source-path="dragGhostField.sourcePath || ''"
            :nodes="glossaryTreeNodes"
            :placeholder="fieldKindLabel(dragGhostField.type)"
            disabled
            :show-source-picker="true"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.glossary-schema-editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.glossary-schema-editor__label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted, #5a6b75);
}

.glossary-schema-editor__input {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: var(--surface, #f4f7f9);
  color: var(--ink, #1a2830);
  font: inherit;
  font-size: 0.8125rem;
}

.glossary-schema-editor__list.is-dragging {
  overflow: hidden;
  touch-action: none;
}

.glossary-schema-editor__row {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.65rem;
  padding: 0.15rem 0.2rem 0.65rem;
  border-bottom: 1px solid color-mix(in srgb, var(--border, #c5d0d8) 60%, transparent);
  background: transparent;
}

.glossary-schema-editor__row.is-drag-source {
  opacity: 0.28;
}

.glossary-schema-editor__row.is-drag-hover {
  background: color-mix(in srgb, var(--accent, #0d6e6e) 8%, transparent);
  border-radius: 8px;
}

.glossary-schema-editor__row-main {
  display: grid;
  grid-template-columns: 1.75rem minmax(0, 1fr) 1.75rem;
  gap: 0.35rem;
  align-items: center;
}

.glossary-schema-editor__drag-handle {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted, #5a6b75);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.glossary-schema-editor__drag-handle::after {
  content: '';
  position: absolute;
  inset: -0.35rem;
}

.glossary-schema-editor__drag-handle:hover {
  color: var(--ink, #1a2830);
  background: color-mix(in srgb, var(--border, #c5d0d8) 35%, transparent);
}

.glossary-schema-editor__row .glossary-schema-editor__input,
.glossary-schema-editor__row .glossary-schema-editor__icon-btn {
  cursor: auto;
}

.glossary-schema-editor__row .glossary-schema-editor__icon-btn {
  cursor: pointer;
}

.glossary-schema-editor__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted, #5a6b75);
  cursor: pointer;
}

.glossary-schema-editor__icon-btn:hover {
  color: var(--danger, #b42318);
  background: color-mix(in srgb, var(--danger, #b42318) 10%, transparent);
}

.glossary-schema-editor__preview {
  width: 100%;
  min-width: 0;
}

.glossary-schema-editor__preview :deep(.term-field-term-ref),
.glossary-schema-editor__preview :deep(.term-field-markdown),
.glossary-schema-editor__preview :deep(.term-field-text) {
  width: 100%;
}

.glossary-schema-editor__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.glossary-schema-editor__toolbar {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  gap: 0.4rem;
  align-items: stretch;
}

.glossary-schema-editor__toolbar :deep(.el-tooltip__trigger),
.glossary-schema-editor__toolbar :deep(.glossary-field-kind-picker__trigger) {
  display: block;
  width: 100%;
  height: 100%;
}

.glossary-schema-editor__tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  min-height: 2.25rem;
  margin: 0;
  padding: 0;
  border: 1px dashed var(--border, #c5d0d8);
  border-radius: 6px;
  background: transparent;
  color: var(--muted, #5a6b75);
  cursor: pointer;
}

.glossary-schema-editor__tool-btn:hover:not(:disabled) {
  border-color: var(--accent, #0d6e6e);
  color: var(--accent, #0d6e6e);
  background: color-mix(in srgb, var(--accent, #0d6e6e) 6%, transparent);
}

.glossary-schema-editor__tool-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.glossary-schema-editor__actions :deep(.el-tooltip__trigger) {
  display: block;
  width: 100%;
}

.glossary-schema-editor__add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 2.25rem;
  margin: 0;
  padding: 0.45rem;
  border: 1px dashed var(--border, #c5d0d8);
  border-radius: 6px;
  background: transparent;
  color: var(--muted, #5a6b75);
  cursor: pointer;
}

.glossary-schema-editor__add:hover:not(:disabled) {
  border-color: var(--accent, #0d6e6e);
  color: var(--accent, #0d6e6e);
  background: color-mix(in srgb, var(--accent, #0d6e6e) 6%, transparent);
}

.glossary-schema-editor__add:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.glossary-schema-editor__btn {
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  align-self: flex-end;
}

.glossary-schema-editor__btn.is-primary {
  background: var(--accent, #0d6e6e);
  border-color: var(--accent, #0d6e6e);
  color: #fff;
}

.glossary-schema-editor__btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

<style>
body.is-schema-field-dragging {
  cursor: grabbing !important;
  user-select: none !important;
  touch-action: none !important;
}

body.is-schema-field-dragging * {
  cursor: grabbing !important;
}

.glossary-schema-drag-ghost {
  position: fixed;
  left: 0;
  z-index: 20200;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0.15rem 0.2rem 0.65rem;
  border-radius: 10px;
  border: 1px solid transparent;
  border-bottom-color: transparent;
  background: color-mix(in srgb, var(--surface, #ffffff) 96%, transparent);
  box-shadow: 0 8px 28px rgba(26, 40, 48, 0.18);
  pointer-events: none;
  will-change: top;
}

.glossary-schema-drag-ghost .glossary-schema-editor__row-main {
  display: grid;
  grid-template-columns: 1.75rem minmax(0, 1fr) 1.75rem;
  gap: 0.35rem;
  align-items: center;
}

.glossary-schema-drag-ghost .glossary-schema-editor__input {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: var(--surface, #f4f7f9);
  color: var(--ink, #1a2830);
  font: inherit;
  font-size: 0.8125rem;
}

.glossary-schema-drag-ghost .glossary-schema-editor__drag-handle,
.glossary-schema-drag-ghost .glossary-schema-editor__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  color: var(--muted, #5a6b75);
}

.glossary-schema-drag-ghost .glossary-schema-editor__preview {
  width: 100%;
  min-width: 0;
  pointer-events: none;
}
</style>
