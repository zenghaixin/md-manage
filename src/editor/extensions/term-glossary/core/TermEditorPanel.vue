<script setup>
/**
 * 右侧词条定义表单：新建 / 编辑；确认才落盘，取消丢弃。
 */
import { computed, ref, watch } from 'vue'
import {
  TERM_TYPE_BASIC,
  TERM_TYPE_SPECIALS,
  normalizeTermType,
  termTypeLabel,
} from './termTypes'

const props = defineProps({
  mode: { type: String, default: 'create' },
  initialTitle: { type: String, default: '' },
  initialDescription: { type: String, default: '' },
  initialType: { type: String, default: TERM_TYPE_BASIC },
  onConfirm: { type: Function, default: null },
  onCancel: { type: Function, default: null },
})

const title = ref(String(props.initialTitle || ''))
const description = ref(String(props.initialDescription || ''))
const termType = ref(normalizeTermType(props.initialType))
const busy = ref(false)

watch(
  () => [props.initialTitle, props.initialDescription, props.initialType],
  () => {
    title.value = String(props.initialTitle || '')
    description.value = String(props.initialDescription || '')
    termType.value = normalizeTermType(props.initialType)
  },
)

const heading = computed(() =>
  props.mode === 'edit' ? '编辑词条' : '新建词条',
)

const typeOptions = computed(() => [
  { id: TERM_TYPE_BASIC, label: termTypeLabel(TERM_TYPE_BASIC) },
  ...TERM_TYPE_SPECIALS.map((t) => ({ id: t.id, label: t.label })),
])

const canSubmit = computed(
  () =>
    !!String(title.value || '').trim() &&
    !!String(description.value || '').trim() &&
    !busy.value,
)

function cancel() {
  if (busy.value) return
  props.onCancel?.()
}

async function confirm() {
  if (!canSubmit.value) return
  busy.value = true
  try {
    await props.onConfirm?.({
      title: String(title.value || '').trim(),
      description: String(description.value || '').trim(),
      termType: normalizeTermType(termType.value),
    })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="ext-term-editor-panel flex h-full min-h-0 flex-col gap-3 p-3">
    <div class="ext-term-editor-panel__head shrink-0">
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

    <label class="ext-term-editor-field min-h-0 flex flex-1 flex-col">
      <span class="ext-term-editor-label">描述</span>
      <textarea
        v-model="description"
        class="ext-term-editor-textarea flex-1"
        placeholder="词条描述（支持 Markdown）"
        spellcheck="false"
      />
    </label>

    <div class="ext-term-editor-actions shrink-0 flex gap-2 justify-end">
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

.ext-term-editor-input,
.ext-term-editor-textarea {
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

.ext-term-editor-textarea {
  min-height: 160px;
  resize: vertical;
  line-height: 1.5;
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
