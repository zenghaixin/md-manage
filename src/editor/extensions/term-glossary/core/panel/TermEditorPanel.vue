<script setup>
/**
 * 词条定义表单：新建 / 编辑；确认才落盘，取消丢弃。
 * 描述区使用通用 MarkdownField（lite）。
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import MarkdownField from '../../../../../components/MarkdownField.vue'
import {
  TERM_TYPE_BASIC,
  TERM_TYPE_SPECIALS,
  normalizeTermType,
  termTypeLabel,
} from '../shared/termTypes'
import {
  normalizeTermAttrs,
  termAttrFieldsForType,
} from '../../types/termAttrs'
import { peelRemarkBraceFromDescription } from '../model/syntax'
import { setHostTermTitle } from '../shared/editorViewRef'
import { ensureTermGlossaryStyles } from '../shared/styles'

const props = defineProps({
  mode: { type: String, default: 'create' },
  initialTitle: { type: String, default: '' },
  initialDescription: { type: String, default: '' },
  initialType: { type: String, default: TERM_TYPE_BASIC },
  initialAttrs: { type: Object, default: () => ({}) },
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
const termType = ref(normalizeTermType(props.initialType))
const attrsDraft = reactive({})
const busy = ref(false)
const mdFieldRef = ref(null)

ensureTermGlossaryStyles()

const emit = defineEmits(['update:ui'])

function fillAttrsDraft(type, raw) {
  const normalized = normalizeTermAttrs(type, raw)
  const fields = termAttrFieldsForType(type)
  for (const key of Object.keys(attrsDraft)) {
    delete attrsDraft[key]
  }
  for (const field of fields) {
    if (field.kind === 'enum') {
      attrsDraft[field.key] = normalized[field.key] || field.defaultValue
    } else {
      attrsDraft[field.key] = normalized[field.key] || ''
    }
  }
}

fillAttrsDraft(termType.value, props.initialAttrs)

watch(
  () => [
    props.initialTitle,
    props.initialDescription,
    props.initialType,
    props.initialAttrs,
  ],
  () => {
    title.value = String(props.initialTitle || '')
    description.value = cleanDesc(props.initialDescription)
    termType.value = normalizeTermType(props.initialType)
    fillAttrsDraft(termType.value, props.initialAttrs)
  },
)

watch(termType, (next, prev) => {
  if (normalizeTermType(next) === normalizeTermType(prev)) return
  fillAttrsDraft(next, {})
})

const heading = computed(() =>
  props.mode === 'edit' ? '编辑词条' : '新建词条',
)

const typeOptions = computed(() => [
  { id: TERM_TYPE_BASIC, label: termTypeLabel(TERM_TYPE_BASIC) },
  ...TERM_TYPE_SPECIALS.map((t) => ({ id: t.id, label: t.label })),
])

const attrFields = computed(() => termAttrFieldsForType(termType.value))

const canSubmit = computed(
  () =>
    !!String(title.value || '').trim() &&
    !!String(description.value || '').trim() &&
    !busy.value,
)

watch(
  [canSubmit, busy],
  () => {
    emit('update:ui', {
      canSubmit: canSubmit.value,
      busy: busy.value,
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
    const type = normalizeTermType(termType.value)
    const peeled = peelRemarkBraceFromDescription(
      String(description.value || '').trim(),
    )
    description.value = peeled.description
    await props.onConfirm?.({
      title: String(title.value || '').trim(),
      description: peeled.description,
      termType: type,
      attrs: normalizeTermAttrs(type, { ...attrsDraft }),
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
  <div class="ext-term-editor-panel flex h-full min-h-0 flex-col gap-3 p-3">
    <div
      v-if="showHeading"
      class="ext-term-editor-panel__head shrink-0"
    >
      <h3 class="m-0 text-sm font-semibold">{{ heading }}</h3>
    </div>

    <label class="ext-term-editor-field shrink-0">
      <span class="ext-term-editor-label">类型</span>
      <select v-model="termType" class="ext-term-editor-input">
        <option
          v-for="opt in typeOptions"
          :key="opt.id"
          :value="opt.id"
        >
          {{ opt.label }}
        </option>
      </select>
    </label>

    <label class="ext-term-editor-field shrink-0">
      <span class="ext-term-editor-label">标题</span>
      <input
        v-model="title"
        class="ext-term-editor-input"
        type="text"
        placeholder="词条标题"
        maxlength="80"
      >
    </label>

    <template v-if="attrFields.length">
      <label
        v-for="field in attrFields"
        :key="field.key"
        class="ext-term-editor-field shrink-0"
      >
        <span class="ext-term-editor-label">{{ field.label }}</span>
        <select
          v-if="field.kind === 'enum'"
          v-model="attrsDraft[field.key]"
          class="ext-term-editor-input"
        >
          <option
            v-for="opt in field.options || []"
            :key="opt.id"
            :value="opt.id"
          >
            {{ opt.label }}
          </option>
        </select>
        <input
          v-else
          v-model="attrsDraft[field.key]"
          class="ext-term-editor-input"
          type="text"
          :placeholder="field.key === 'timeLabel' ? '如：第三纪元末' : '可选'"
          maxlength="120"
        >
      </label>
    </template>

    <MarkdownField
      ref="mdFieldRef"
      v-model="description"
      class="min-h-0 flex-1"
      term-ref
      :host-term-title="title"
      :show-toggle="showDescToggle"
      placeholder="词条描述（Markdown）"
      :min-height="160"
    />

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
</style>
