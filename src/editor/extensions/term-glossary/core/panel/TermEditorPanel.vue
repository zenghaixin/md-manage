<script setup>
/**
 * 词条定义表单：新建 / 编辑；确认才落盘，取消丢弃。
 * 分类由「词条」下文件夹体现，面板不再选类型。
 * 描述区使用通用 MarkdownField（lite）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MarkdownField from '../../../../../components/MarkdownField.vue'
import { api } from '../../../../../api'
import { useGlossaryStore } from '../../../../../stores/glossary'
import { peelRemarkBraceFromDescription } from '../model/syntax'
import { setHostTermTitle } from '../shared/editorViewRef'
import { ensureTermGlossaryStyles } from '../shared/styles'
import {
  GLOSSARY_DEFAULT_FILE,
  glossaryEntryLabel,
  normalizeDocPath,
} from '../shared/glossaryPaths'
import {
  extractGlossarySubtree,
  fetchTermTitlesForSource,
  loadGlossaryIndex,
  normalizeRefSources,
  normalizeTermRefs,
  resolveDefaultRefSources,
  resolveRefSlots,
  resolveSourceIdByPath,
} from '../shared/termRefSlots'
import {
  TermFieldControl,
  TermFieldTermRef,
} from '../fields'
import {
  fetchTermSchema,
  isRemarkSchemaField,
  isTitleSchemaField,
  isTermSchemaField,
  normalizeExtraFields,
} from '../shared/termSchema'

const props = defineProps({
  mode: { type: String, default: 'create' },
  initialTitle: { type: String, default: '' },
  initialDescription: { type: String, default: '' },
  /** 新建时默认存储位置（词条下当前文件 / 默认词条） */
  initialTargetPath: { type: String, default: '' },
  /** 编辑时词条所属入口文件（用于判定引用槽位） */
  initialSourcePath: { type: String, default: '' },
  /** 编辑时预填引用槽位值 */
  initialRefs: { type: Object, default: () => ({}) },
  /** 编辑时预填各槽位数据源 id */
  initialRefSources: { type: Array, default: () => [] },
  /** 编辑时预填本条额外字段（含 schema 文本字段） */
  initialExtraFields: { type: Array, default: () => [] },
  showHeading: { type: Boolean, default: true },
  /** 是否在面板内渲染取消/确认（浮层宿主可改到 footer） */
  showActions: { type: Boolean, default: true },
  /** 描述区工具栏是否显示源码切换（浮层可改到 footer） */
  showDescToggle: { type: Boolean, default: true },
  onConfirm: { type: Function, default: null },
  onCancel: { type: Function, default: null },
})

function cleanDesc(raw) {
  return peelRemarkBraceFromDescription(String(raw || '')).description
}

const title = ref(String(props.initialTitle || ''))
const description = ref(cleanDesc(props.initialDescription))
const busy = ref(false)
const mdFieldRef = ref(null)
/** 新建落盘位置；优先 initialTargetPath（词条下当前文件） */
const targetPath = ref(
  String(props.initialTargetPath || '').trim() || GLOSSARY_DEFAULT_FILE,
)
/** @type {import('vue').Ref<Array<{ path: string, label: string }>>} */
const entryOptions = ref([])
const glossaryStore = useGlossaryStore()
/** @type {import('vue').Ref<string[]>} */
const refSourceIds = ref([])
/** @type {import('vue').Ref<import('../shared/termRefSlots').GlossaryIndexEntry[]>} */
const glossaryIndexEntries = ref([])
/** @type {import('vue').Ref<Record<string, string[]>>} */
const slotValues = ref({})
/** @type {import('vue').Ref<Record<string, string[]>>} */
const termOptionsByPath = ref({})
/** @type {import('vue').Ref<Record<string, boolean>>} */
const loadingPaths = ref({})
/** @type {import('vue').Ref<Array<object>>} */
const glossaryTreeNodes = ref([])
/** @type {import('vue').Ref<import('../shared/termSchema').TermSchemaField[]>} */
const schemaFields = ref([])
/** schema 文本字段（非标题/备注）填值，落盘进 extraFields */
const textSchemaValues = ref({})
/** @type {import('vue').Ref<import('../shared/termSchema').TermExtraField[]>} */
const extraFields = ref([])

ensureTermGlossaryStyles()

const refSlotDefs = computed(() =>
  resolveRefSlots(refSourceIds.value, glossaryIndexEntries.value),
)

function resolveEntryPathForRefSlots() {
  if (props.mode === 'edit') {
    return normalizeDocPath(props.initialSourcePath || '')
  }
  return normalizeDocPath(
    targetPath.value || props.initialTargetPath || GLOSSARY_DEFAULT_FILE,
  )
}

function initExtraFieldsFromProps() {
  extraFields.value = normalizeExtraFields(props.initialExtraFields).map(
    (f) => ({ ...f }),
  )
}

function initTextSchemaFromExtra() {
  const next = {}
  for (const field of schemaFields.value) {
    if (field.type !== 'text' || isTitleSchemaField(field)) continue
    const extra = extraFields.value.find((e) => e.label === field.label)
    next[field.label] = String(extra?.value ?? '')
  }
  textSchemaValues.value = next
}

async function loadSchemaForEntry() {
  const path = resolveEntryPathForRefSlots()
  if (!path) {
    schemaFields.value = []
    return
  }
  try {
    const data = await fetchTermSchema(path)
    schemaFields.value = data.schema.fields
    initTextSchemaFromExtra()
  } catch (err) {
    console.warn('[term-editor] load schema failed:', err)
    schemaFields.value = []
  }
}

function fieldValueOf(label) {
  const field = schemaFields.value.find((f) => f.label === label)
  if (field && isTitleSchemaField(field)) return title.value
  if (field && isRemarkSchemaField(field)) return description.value
  if (field?.type === 'text') return textSchemaValues.value[label] ?? ''
  return ''
}

function updateFieldValue(label, value) {
  const field = schemaFields.value.find((f) => f.label === label)
  if (field && isTitleSchemaField(field)) {
    title.value = Array.isArray(value) ? value.join('，') : String(value ?? '')
    return
  }
  if (field && isRemarkSchemaField(field)) {
    description.value = Array.isArray(value)
      ? value.join('，')
      : String(value ?? '')
    return
  }
  if (field?.type === 'text') {
    textSchemaValues.value = {
      ...textSchemaValues.value,
      [label]: Array.isArray(value) ? value.join('，') : String(value ?? ''),
    }
  }
}

function termRefValueForField(field) {
  const id = resolveSourceId(field.sourcePath || '')
  return id ? slotValueList(id) : []
}

function updateTermRefForField(field, value) {
  const id = resolveSourceId(field.sourcePath || '')
  if (!id) return
  if (!refSourceIds.value.includes(id)) {
    refSourceIds.value = [...refSourceIds.value, id]
  }
  updateSlotValue(id, value)
}

function extraFieldsForSave() {
  const schemaTextLabels = new Set(
    schemaFields.value
      .filter((f) => f.type === 'text' && !isTitleSchemaField(f))
      .map((f) => f.label),
  )
  const manual = extraFields.value.filter((e) => !schemaTextLabels.has(e.label))
  const fromSchema = schemaFields.value
    .filter((f) => f.type === 'text' && !isTitleSchemaField(f))
    .map((f) => ({
      label: f.label,
      type: 'text',
      value: String(textSchemaValues.value[f.label] ?? ''),
    }))
  return normalizeExtraFields([...fromSchema, ...manual])
}

const useSchemaForm = computed(() => schemaFields.value.length > 0)

const hasRemarkSchemaField = computed(() =>
  schemaFields.value.some((f) => isRemarkSchemaField(f)),
)

const remarkSchemaField = computed(
  () => schemaFields.value.find((f) => isRemarkSchemaField(f)) || null,
)

const schemaFieldsWithoutRemark = computed(() =>
  schemaFields.value.filter((f) => !isRemarkSchemaField(f)),
)

function initSlotValuesFromProps() {
  const indexEntries = glossaryIndexEntries.value
  const entryPath = resolveEntryPathForRefSlots()
  let initialSources = normalizeRefSources(props.initialRefSources, indexEntries)
  if (!initialSources.length) {
    initialSources = normalizeRefSources(
      Object.keys(props.initialRefs || {}),
      indexEntries,
    )
  }
  const useSchema = schemaFields.value.length > 0
  if (useSchema) {
    for (const field of schemaFields.value) {
      if (!isTermSchemaField(field)) continue
      const id = resolveSourceIdByPath(field.sourcePath || '', indexEntries)
      if (id && !initialSources.includes(id)) initialSources.push(id)
    }
  } else if (!initialSources.length) {
    initialSources = resolveDefaultRefSources(entryPath, indexEntries)
  }
  const initial = normalizeTermRefs(props.initialRefs, initialSources)
  refSourceIds.value = [...initialSources]
  slotValues.value = { ...initial }
}

async function loadGlossaryIndexData() {
  const index = await loadGlossaryIndex()
  glossaryIndexEntries.value = index.entries
  return index.entries
}

function resolveSourceId(path, entries = glossaryIndexEntries.value) {
  let newId = resolveSourceIdByPath(path, entries)
  if (newId) return newId
  const fromStore = glossaryStore.index?.entries || []
  if (fromStore.length) {
    newId = resolveSourceIdByPath(path, fromStore)
    if (newId) return newId
  }
  return ''
}

async function loadGlossaryTree() {
  try {
    const data = await api.getTree()
    glossaryTreeNodes.value = extractGlossarySubtree(data?.tree || [])
  } catch (err) {
    console.warn('[term-editor] load glossary tree failed:', err)
    glossaryTreeNodes.value = []
  }
}

async function loadOptionsForPath(sourcePath, { force = false } = {}) {
  const path = normalizeDocPath(sourcePath)
  if (!path) return []
  if (!force && Object.prototype.hasOwnProperty.call(termOptionsByPath.value, path)) {
    return termOptionsByPath.value[path]
  }
  loadingPaths.value = { ...loadingPaths.value, [path]: true }
  try {
    const titles = await fetchTermTitlesForSource(path, glossaryStore.terms)
    termOptionsByPath.value = {
      ...termOptionsByPath.value,
      [path]: titles,
    }
    return titles
  } finally {
    const next = { ...loadingPaths.value }
    delete next[path]
    loadingPaths.value = next
  }
}

const slotOptionsMap = computed(() => {
  const map = {}
  for (const slot of refSlotDefs.value) {
    const path = normalizeDocPath(slot.path || '')
    map[slot.id] = path ? termOptionsByPath.value[path] || [] : []
  }
  return map
})

function isSlotLoading(slotId) {
  const slot = refSlotDefs.value.find((s) => s.id === slotId)
  const path = normalizeDocPath(slot?.path || '')
  return !!(path && loadingPaths.value[path])
}

function updateSlotValue(slotId, value) {
  slotValues.value = {
    ...slotValues.value,
    [slotId]: Array.isArray(value) ? value : [],
  }
}

function slotValueList(slotId) {
  const list = slotValues.value[slotId]
  return Array.isArray(list) ? list : []
}

function pruneSlotValues(slotId, path) {
  const valid = new Set(termOptionsByPath.value[path] || [])
  const current = slotValues.value[slotId] || []
  const next = current.filter((t) => valid.has(t))
  if (next.length !== current.length) {
    slotValues.value = { ...slotValues.value, [slotId]: next }
  }
}

async function refreshAllSlotOptions(force = false) {
  for (const slot of refSlotDefs.value) {
    if (!slot.path || slot.deleted) continue
    await loadOptionsForPath(slot.path, { force })
  }
  for (const field of schemaFields.value) {
    if (!isTermSchemaField(field) || !field.sourcePath) continue
    await loadOptionsForPath(field.sourcePath, { force })
  }
}

watch(
  () => [props.initialTitle, props.initialRefs, props.initialRefSources],
  () => {
    if (!glossaryIndexEntries.value.length) return
    initSlotValuesFromProps()
    void refreshAllSlotOptions(true)
  },
  { deep: true },
)

watch(
  termOptionsByPath,
  (map) => {
    for (const slot of refSlotDefs.value) {
      const path = normalizeDocPath(slot.path || '')
      if (path && map[path]) pruneSlotValues(slot.id, path)
    }
  },
  { deep: true },
)

async function onSlotSourceChange(slotId, path) {
  const normalized = normalizeDocPath(path)
  if (!normalized) return

  const currentSlot = refSlotDefs.value.find((s) => s.id === slotId)
  if (normalizeDocPath(currentSlot?.path || '') === normalized) return

  let newId = resolveSourceId(normalized)
  if (!newId) {
    await loadGlossaryIndexData()
    newId = resolveSourceId(normalized)
  }
  if (!newId) {
    await api.syncGlossary()
    await glossaryStore.reload()
    glossaryIndexEntries.value = glossaryStore.index.entries
    newId = resolveSourceId(normalized)
  }
  if (!newId) return

  const idx = refSourceIds.value.indexOf(slotId)
  if (idx === -1) return

  refSourceIds.value = refSourceIds.value.filter(
    (id, i) => i === idx || id !== newId,
  )
  refSourceIds.value[idx] = newId

  const next = { ...slotValues.value }
  delete next[slotId]
  next[newId] = []
  for (const id of Object.keys(next)) {
    if (!refSourceIds.value.includes(id)) delete next[id]
  }
  slotValues.value = next

  await loadOptionsForPath(normalized, { force: true })
}

async function onTermSchemaSourceChange(fieldLabel, path) {
  const normalized = normalizeDocPath(path)
  const field = schemaFields.value.find((f) => f.label === fieldLabel)
  if (!field || !isTermSchemaField(field)) return
  const oldPath = normalizeDocPath(field.sourcePath || '')
  if (oldPath === normalized) return

  schemaFields.value = schemaFields.value.map((f) =>
    f.label === fieldLabel ? { ...f, sourcePath: normalized } : f,
  )

  let newId = resolveSourceId(normalized)
  if (!newId) {
    await loadGlossaryIndexData()
    newId = resolveSourceId(normalized)
  }
  if (!newId) {
    await api.syncGlossary()
    await glossaryStore.reload()
    glossaryIndexEntries.value = glossaryStore.index.entries
    newId = resolveSourceId(normalized)
  }
  if (!newId) return

  const oldId = oldPath ? resolveSourceId(oldPath) : ''
  if (oldId && refSourceIds.value.includes(oldId)) {
    const stillUsed = schemaFields.value.some(
      (f) =>
        isTermSchemaField(f) &&
        f.label !== fieldLabel &&
        resolveSourceId(f.sourcePath || '') === oldId,
    )
    if (!stillUsed) {
      refSourceIds.value = refSourceIds.value.filter((id) => id !== oldId)
      const next = { ...slotValues.value }
      delete next[oldId]
      slotValues.value = next
    }
  }

  if (!refSourceIds.value.includes(newId)) {
    refSourceIds.value = [...refSourceIds.value, newId]
  }
  if (!Array.isArray(slotValues.value[newId])) {
    slotValues.value = { ...slotValues.value, [newId]: [] }
  }

  await loadOptionsForPath(normalized, { force: true })
}

function resolvePreferredTarget(list) {
  const preferred =
    String(props.initialTargetPath || '').trim() || GLOSSARY_DEFAULT_FILE
  if (list.some((e) => e.path === preferred)) return preferred
  if (list.some((e) => e.path === GLOSSARY_DEFAULT_FILE)) {
    return GLOSSARY_DEFAULT_FILE
  }
  return list[0]?.path || preferred
}

async function loadEntryOptions() {
  if (props.mode !== 'create') return
  try {
    const data = await api.getGlossaryEntries()
    const list = Array.isArray(data?.entries) ? data.entries : []
    entryOptions.value = list
      .map((e) => ({
        path: String(e.path || ''),
        label: String(e.label || glossaryEntryLabel(e.path) || e.path),
      }))
      .filter((e) => e.path)
    const preferred =
      String(props.initialTargetPath || '').trim() || GLOSSARY_DEFAULT_FILE
    // 当前文件尚未进索引时仍展示可选
    if (
      preferred &&
      preferred.endsWith('.md') &&
      !entryOptions.value.some((e) => e.path === preferred)
    ) {
      entryOptions.value = [
        {
          path: preferred,
          label: glossaryEntryLabel(preferred),
        },
        ...entryOptions.value,
      ]
    }
    targetPath.value = resolvePreferredTarget(entryOptions.value)
  } catch (err) {
    console.warn('[term-editor] load entry options failed:', err)
    const preferred =
      String(props.initialTargetPath || '').trim() || GLOSSARY_DEFAULT_FILE
    entryOptions.value = [
      {
        path: preferred,
        label: glossaryEntryLabel(preferred),
      },
    ]
    targetPath.value = preferred
  }
}

onMounted(async () => {
  void loadEntryOptions()
  void loadGlossaryTree()
  await loadGlossaryIndexData()
  initExtraFieldsFromProps()
  await loadSchemaForEntry()
  initSlotValuesFromProps()
  void refreshAllSlotOptions(true)
})

watch(
  () => props.mode,
  () => {
    if (props.mode === 'create') void loadEntryOptions()
  },
)

watch(
  () => targetPath.value,
  async () => {
    if (props.mode !== 'create' || !glossaryIndexEntries.value.length) return
    await loadSchemaForEntry()
    initSlotValuesFromProps()
    void refreshAllSlotOptions(true)
  },
)

watch(
  () => [props.initialExtraFields, props.initialSourcePath],
  async () => {
    initExtraFieldsFromProps()
    await loadSchemaForEntry()
    initTextSchemaFromExtra()
    initSlotValuesFromProps()
  },
  { deep: true },
)

const emit = defineEmits(['update:ui'])

watch(
  () => [props.initialTitle, props.initialDescription],
  () => {
    title.value = String(props.initialTitle || '')
    description.value = cleanDesc(props.initialDescription)
  },
)

const heading = computed(() =>
  props.mode === 'edit' ? '编辑词条' : '新建词条',
)

const canSubmit = computed(() => {
  if (busy.value) return false
  if (!String(title.value || '').trim()) return false
  const needDesc =
    !useSchemaForm.value || schemaFields.value.some((f) => isRemarkSchemaField(f))
  if (needDesc && !String(description.value || '').trim()) return false
  return true
})

watch(
  [canSubmit, busy, useSchemaForm, hasRemarkSchemaField],
  () => {
    emit('update:ui', {
      canSubmit: canSubmit.value,
      busy: busy.value,
      showDescSourceToggle: !useSchemaForm.value || hasRemarkSchemaField.value,
    })
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  setHostTermTitle(null)
})

function cancel() {
  if (busy.value) return
  props.onCancel?.()
}

async function confirm() {
  if (!canSubmit.value) return
  const flushed = mdFieldRef.value?.flush?.()
  if (typeof flushed === 'string') description.value = flushed
  busy.value = true
  try {
    const peeled = peelRemarkBraceFromDescription(
      String(description.value || '').trim(),
    )
    description.value = peeled.description
    const refSources = normalizeRefSources(refSourceIds.value, glossaryIndexEntries.value)
    await props.onConfirm?.({
      title: String(title.value || '').trim(),
      description: peeled.description,
      targetPath:
        props.mode === 'create'
          ? String(targetPath.value || GLOSSARY_DEFAULT_FILE)
          : undefined,
      refs: refSources.length
        ? normalizeTermRefs(slotValues.value, refSources)
        : undefined,
      refSources: refSources.length ? refSources : undefined,
      extraFields: extraFieldsForSave(),
    })
  } finally {
    busy.value = false
  }
}

defineExpose({
  confirm,
  cancel,
  canSubmit,
  busy,
  toggleDescView: () => mdFieldRef.value?.toggleView?.(),
  isDescSource: () => {
    const mode = mdFieldRef.value?.viewMode
    const raw = mode && typeof mode === 'object' && 'value' in mode ? mode.value : mode
    return raw === 'source'
  },
})
</script>

<template>
  <div class="ext-term-editor-panel flex h-full min-h-0 w-full flex-col overflow-x-hidden overflow-y-auto">
    <!--
      grow + shrink-0 + basis auto：矮时被拉满（描述 flex-1 才有剩余空间），
      高时不压缩，由本层滚动。
      不要 min-h-full：min-height 在 Chromium 里不是确定高度，子项 flex-1 分不到空。
      不要 flex-1（basis 0%）：会从 0 长到父级高度，min-height:auto 在滚动 flex 里常被当成 0。
    -->
    <div class="flex grow shrink-0 flex-col gap-3 p-3">
    <div
      v-if="showHeading"
      class="ext-term-editor-panel__head shrink-0"
    >
        <h3 class="m-0 text-sm font-semibold">{{ heading }}</h3>
      </div>

      <label
        v-if="mode === 'create'"
        class="ext-term-editor-field shrink-0"
      >
        <span class="ext-term-editor-label">存储位置</span>
        <select v-model="targetPath" class="ext-term-editor-input">
          <option
            v-for="opt in entryOptions"
            :key="opt.path"
            :value="opt.path"
          >
            {{ opt.label }}（{{ opt.path }}）
          </option>
        </select>
      </label>

      <label
        v-if="!useSchemaForm"
        class="ext-term-editor-field shrink-0"
      >
        <span class="ext-term-editor-label">标题</span>
        <input
          v-model="title"
          class="ext-term-editor-input"
          type="text"
          placeholder="词条标题"
          maxlength="80"
        >
      </label>

      <div
        v-if="refSlotDefs.length && !useSchemaForm"
        class="ext-term-ref-slots shrink-0"
      >
        <TermFieldTermRef
          v-for="slot in refSlotDefs"
          :key="slot.id"
          :label="slot.name"
          :label-deleted="slot.deleted"
          :model-value="slotValueList(slot.id)"
          :source-path="slot.path"
          :nodes="glossaryTreeNodes"
          :disabled="slot.deleted"
          :placeholder="slot.deleted ? '来源已删除' : '选择词条'"
          @update:model-value="updateSlotValue(slot.id, $event)"
          @update:source-path="onSlotSourceChange(slot.id, $event)"
        />
      </div>

      <div
        v-if="useSchemaForm"
        class="ext-term-schema-fields flex flex-col gap-3"
        :class="hasRemarkSchemaField ? 'min-h-[160px] flex-1' : 'shrink-0'"
      >
        <label
          v-for="field in schemaFieldsWithoutRemark"
          :key="field.label"
          class="ext-term-editor-field shrink-0"
        >
          <span class="ext-term-editor-label">{{ field.label }}</span>
          <TermFieldControl
            :kind="field.type || 'text'"
            :model-value="
              isTermSchemaField(field)
                ? termRefValueForField(field)
                : fieldValueOf(field.label)
            "
            :source-path="field.sourcePath || ''"
            :nodes="glossaryTreeNodes"
            :host-term-title="title"
            :placeholder="field.label"
            :show-source-picker="true"
            :min-height="field.type === 'markdown' ? 120 : 96"
            @update:model-value="
              isTermSchemaField(field)
                ? updateTermRefForField(field, $event)
                : updateFieldValue(field.label, $event)
            "
            @update:source-path="
              isTermSchemaField(field)
                ? onTermSchemaSourceChange(field.label, $event)
                : undefined
            "
          />
        </label>
        <label
          v-if="remarkSchemaField"
          class="ext-term-editor-field flex min-h-0 flex-1 flex-col"
        >
          <span class="ext-term-editor-label">{{ remarkSchemaField.label }}</span>
          <MarkdownField
            ref="mdFieldRef"
            v-model="description"
            class="min-h-0 flex-1"
            term-ref
            :host-term-title="title"
            :show-toggle="showDescToggle"
            :placeholder="remarkSchemaField.label"
            :min-height="120"
          />
        </label>
      </div>

      <div
        v-else
        class="flex min-h-[160px] flex-1 flex-col"
      >
        <MarkdownField
          ref="mdFieldRef"
          v-model="description"
          class="h-full min-h-0 flex-1"
          term-ref
          :host-term-title="title"
          :show-toggle="showDescToggle"
          placeholder="词条描述（Markdown）"
          :min-height="0"
        />
      </div>

      <div
        v-if="showActions"
        class="ext-term-editor-actions shrink-0 flex gap-2 justify-end"
      >
        <button
          type="button"
          class="ext-term-editor-btn"
          :disabled="busy"
          @click="cancel"
        >
          取消
        </button>
        <button
          type="button"
          class="ext-term-editor-btn is-primary"
          :disabled="!canSubmit"
          @click="confirm"
        >
        确认
      </button>
    </div>
    </div>
  </div>
</template>

<style scoped>
.ext-term-editor-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ext-term-editor-label {
  font-size: 0.75rem;
  color: var(--muted, #5a6b75);
}

.ext-term-editor-input {
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: var(--surface, #f4f7f9);
  color: var(--ink, #1a2830);
  font: inherit;
  font-size: 0.8125rem;
}

.ext-term-editor-btn {
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.ext-term-editor-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ext-term-editor-btn.is-primary {
  border-color: color-mix(in srgb, var(--accent, #0d6e6e) 55%, var(--border, #c5d0d8));
  background: color-mix(in srgb, var(--accent, #0d6e6e) 16%, transparent);
  color: var(--accent, #0d6e6e);
  font-weight: 600;
}

.ext-term-ref-slots {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ext-term-schema-fields {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>

<style>
.ext-term-ref-select-popper {
  z-index: 20050 !important;
}
</style>
