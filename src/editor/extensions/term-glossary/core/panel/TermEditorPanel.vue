<script setup>
/**
 * 词条定义表单：新建 / 编辑；确认才落盘，取消丢弃。
 * 分类由「词条」下文件夹体现，面板不再选类型。
 * 描述区使用通用 MarkdownField（lite）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MarkdownField from '../../../../../components/MarkdownField.vue'
import { api } from '../../../../../api'
import { peelRemarkBraceFromDescription } from '../model/syntax'
import { setHostTermTitle } from '../shared/editorViewRef'
import { ensureTermGlossaryStyles } from '../shared/styles'
import {
  GLOSSARY_DEFAULT_FILE,
  glossaryEntryLabel,
} from '../shared/glossaryPaths'

const props = defineProps({
  mode: { type: String, default: 'create' },
  initialTitle: { type: String, default: '' },
  initialDescription: { type: String, default: '' },
  /** 新建时默认存储位置（词条下当前文件 / 默认词条） */
  initialTargetPath: { type: String, default: '' },
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

ensureTermGlossaryStyles()

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

onMounted(() => {
  void loadEntryOptions()
})

watch(
  () => props.mode,
  () => {
    if (props.mode === 'create') void loadEntryOptions()
  },
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
    const peeled = peelRemarkBraceFromDescription(
      String(description.value || '').trim(),
    )
    description.value = peeled.description
    await props.onConfirm?.({
      title: String(title.value || '').trim(),
      description: peeled.description,
      targetPath:
        props.mode === 'create'
          ? String(targetPath.value || GLOSSARY_DEFAULT_FILE)
          : undefined,
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
