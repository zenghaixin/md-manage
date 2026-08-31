<script setup>
/**
 * 入口文件通用字段编辑器（挂在「通用字段」右栏书签）。
 */
import { onMounted, ref, watch } from 'vue'
import AppIcon from '../../../../../components/AppIcon.vue'
import { api } from '../../../../../api'
import { alertError } from '../../../../../composables/useDialog'
import {
  GlossaryFieldKindPicker,
  TermFieldMarkdown,
  TermFieldTermRef,
  TermFieldText,
} from '../fields'
import { glossaryEntryLabel, normalizeDocPath } from '../shared/glossaryPaths'
import { extractGlossarySubtree } from '../shared/termRefSlots'
import {
  emptyTermSchema,
  makeFieldKey,
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

/** 内容区草稿（仅本页预览/试填，不写入 schema） */
const contentDrafts = ref(/** @type {Record<string, string | string[]>} */ ({}))

function contentText(key) {
  const v = contentDrafts.value[key]
  return typeof v === 'string' ? v : ''
}

function contentTerms(key) {
  const v = contentDrafts.value[key]
  return Array.isArray(v) ? v : []
}

function setContent(key, value) {
  const k = String(key || '').trim()
  if (!k) return
  contentDrafts.value = {
    ...contentDrafts.value,
    [k]: value,
  }
}

function ensureContentDraft(field) {
  const k = String(field?.key || '').trim()
  if (!k) return
  if (Object.prototype.hasOwnProperty.call(contentDrafts.value, k)) return
  contentDrafts.value = {
    ...contentDrafts.value,
    [k]: field.type === 'term' ? [] : '',
  }
}

function migrateContentKey(fromKey, toKey, type) {
  const from = String(fromKey || '').trim()
  const to = String(toKey || '').trim()
  if (!from || !to || from === to) return
  const prev = contentDrafts.value[from]
  const next = { ...contentDrafts.value }
  delete next[from]
  if (!Object.prototype.hasOwnProperty.call(next, to)) {
    next[to] =
      prev !== undefined ? prev : type === 'term' ? [] : ''
  }
  contentDrafts.value = next
}

async function loadSchema(pathRel) {
  const path = normalizeDocPath(pathRel)
  loadError.value = ''
  if (!path) {
    fields.value = []
    fileName.value = ''
    contentDrafts.value = {}
    return
  }
  busy.value = true
  try {
    const data = await api.getGlossarySchema(path)
    selectedPath.value = normalizeDocPath(data?.path || path)
    fileName.value = String(data?.fileName || glossaryEntryLabel(path))
    const schema = normalizeTermSchema(data?.schema)
    fields.value = schema.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type === 'markdown' || f.type === 'term' ? f.type : 'text',
      sourcePath: f.sourcePath || '',
    }))
    const drafts = {}
    for (const f of fields.value) {
      drafts[f.key] = f.type === 'term' ? [] : ''
    }
    contentDrafts.value = drafts
    dirty.value = false
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '加载失败'
    fields.value = []
    contentDrafts.value = {}
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
  const keys = fields.value.map((f) => f.key)
  const label = '新字段'
  const key = makeFieldKey(label, keys)
  fields.value = [
    ...fields.value,
    {
      key,
      label,
      type,
      sourcePath: '',
    },
  ]
  ensureContentDraft({ key, type })
  dirty.value = true
}

function removeField(index) {
  const row = fields.value[index]
  if (row?.key) {
    const next = { ...contentDrafts.value }
    delete next[row.key]
    contentDrafts.value = next
  }
  fields.value = fields.value.filter((_, i) => i !== index)
  dirty.value = true
}

function onLabelChange(index) {
  const row = fields.value[index]
  if (!row) return
  const others = fields.value.filter((_, i) => i !== index).map((f) => f.key)
  const prevKey = row.key
  // 仅当 key 仍像自动生成时跟随 label
  if (!row.key || row.key.startsWith('新字段') || row.key === makeFieldKey(row.label, [])) {
    row.key = makeFieldKey(row.label, others)
    migrateContentKey(prevKey, row.key, row.type)
  }
  dirty.value = true
}

function onSourcePathChange(index, path) {
  const row = fields.value[index]
  if (!row) return
  row.sourcePath = normalizeDocPath(path)
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
          key: String(f.key || '').trim(),
          label: String(f.label || '').trim() || String(f.key || '').trim(),
          type,
          sourcePath: type === 'term' ? f.sourcePath : '',
        })
      })
      .filter(Boolean)
    const saved = await saveTermSchema(path, schema)
    fields.value = saved.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type === 'markdown' || f.type === 'term' ? f.type : 'text',
      sourcePath: f.sourcePath || '',
    }))
    const drafts = { ...contentDrafts.value }
    for (const f of fields.value) {
      if (!Object.prototype.hasOwnProperty.call(drafts, f.key)) {
        drafts[f.key] = f.type === 'term' ? [] : ''
      }
    }
    contentDrafts.value = drafts
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

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <p
        v-if="!fields.length"
        class="m-0 py-4 text-center text-sm text-[color:var(--muted,#5a6b75)]"
      >
        尚未配置字段
      </p>

      <div
        v-for="(field, index) in fields"
        :key="`${field.key}:${field.type}:${index}`"
        class="glossary-schema-editor__row"
      >
        <div class="glossary-schema-editor__row-main">
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
        <div class="glossary-schema-editor__content">
          <TermFieldText
            v-if="field.type === 'text'"
            :model-value="contentText(field.key)"
            placeholder="内容"
            @update:model-value="setContent(field.key, $event)"
          />
          <TermFieldMarkdown
            v-else-if="field.type === 'markdown'"
            :model-value="contentText(field.key)"
            placeholder="内容"
            :min-height="96"
            @update:model-value="setContent(field.key, $event)"
          />
          <TermFieldTermRef
            v-else-if="field.type === 'term'"
            :model-value="contentTerms(field.key)"
            :source-path="field.sourcePath || ''"
            :nodes="glossaryTreeNodes"
            placeholder="内容"
            :show-source-picker="true"
            @update:model-value="setContent(field.key, $event)"
            @update:source-path="onSourcePathChange(index, $event)"
          />
        </div>
      </div>
    </div>

    <div class="glossary-schema-editor__actions shrink-0">
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
      <button
        type="button"
        class="glossary-schema-editor__btn is-primary"
        :disabled="busy || !selectedPath || !dirty"
        @click="save"
      >
        保存
      </button>
    </div>
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

.glossary-schema-editor__row {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.65rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid color-mix(in srgb, var(--border, #c5d0d8) 60%, transparent);
}

.glossary-schema-editor__row-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1.75rem;
  gap: 0.35rem;
  align-items: center;
}

.glossary-schema-editor__content {
  width: 100%;
  min-width: 0;
}

.glossary-schema-editor__content :deep(.term-field-term-ref),
.glossary-schema-editor__content :deep(.term-field-markdown),
.glossary-schema-editor__content :deep(.term-field-text) {
  width: 100%;
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

.glossary-schema-editor__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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
