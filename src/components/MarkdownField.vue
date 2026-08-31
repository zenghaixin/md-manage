<script setup>
/**
 * 可复用 Markdown 编辑框（lite）：
 * TipTap 预览编辑 ↔ 源码，含 HeadingBackspace。
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import AppIcon from './AppIcon.vue'
import {
  fromStorageMarkdown,
  toStorageMarkdown,
} from '../editor/blankLines'
import { getMarkdownFieldLiteExtensions } from '../editor/markdownFieldLite'
import { setHostTermTitle } from '../editor/hostTermTitle'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** 是否挂 TermRef 节点 */
  termRef: { type: Boolean, default: false },
  /**
   * 当前宿主词条标题：描述内同名不灰线/不弹确认。
   * 空字符串则清除。
   */
  hostTermTitle: { type: String, default: '' },
  placeholder: { type: String, default: '支持 Markdown' },
  minHeight: { type: Number, default: 160 },
  showToggle: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue'])

const bodyStyle = computed(() => {
  const h = Number(props.minHeight)
  if (!Number.isFinite(h) || h <= 0) return undefined
  return { minHeight: `${h}px` }
})

const viewMode = ref(/** @type {'preview' | 'source'} */ ('preview'))
const sourceDraft = ref(String(props.modelValue || ''))
let applying = false

watch(
  () => props.hostTermTitle,
  (t) => {
    setHostTermTitle(String(t || '').trim() || null)
  },
  { immediate: true },
)

const editor = useEditor({
  extensions: getMarkdownFieldLiteExtensions({ termRef: props.termRef }),
  content: '',
  editorProps: {
    attributes: {
      class: 'markdown-field__tiptap tiptap',
      spellcheck: 'false',
    },
  },
  onUpdate: ({ editor: ed }) => {
    if (applying) return
    const md = toStorageMarkdown(ed.getMarkdown())
    sourceDraft.value = md
    emit('update:modelValue', md)
  },
  onCreate: ({ editor: ed }) => {
    applying = true
    ed.commands.setContent(fromStorageMarkdown(String(props.modelValue || '')), {
      contentType: 'markdown',
      emitUpdate: false,
    })
    applying = false
  },
})

function applyToEditor(md) {
  const ed = editor.value
  if (!ed || ed.isDestroyed) return
  applying = true
  ed.commands.setContent(fromStorageMarkdown(String(md || '')), {
    contentType: 'markdown',
    emitUpdate: false,
  })
  applying = false
}

function pullFromEditor() {
  const ed = editor.value
  if (!ed || ed.isDestroyed) return String(sourceDraft.value || '')
  const md = toStorageMarkdown(ed.getMarkdown())
  sourceDraft.value = md
  return md
}

watch(
  () => props.modelValue,
  (v) => {
    const next = String(v || '')
    if (next === sourceDraft.value) return
    sourceDraft.value = next
    if (viewMode.value === 'preview') {
      void nextTick(() => applyToEditor(next))
    }
  },
)

function onSourceInput(e) {
  const v = e.target?.value ?? ''
  sourceDraft.value = v
  emit('update:modelValue', v)
}

const toggleTitle = computed(() =>
  viewMode.value === 'source' ? '切换到预览' : '切换到源码',
)

function toggleView() {
  if (viewMode.value === 'preview') {
    const md = pullFromEditor()
    emit('update:modelValue', md)
    viewMode.value = 'source'
    return
  }
  viewMode.value = 'preview'
  void nextTick(() => applyToEditor(sourceDraft.value))
}

/** 确认前调用：保证 modelValue 与编辑器一致 */
function flush() {
  if (viewMode.value === 'preview') {
    const md = pullFromEditor()
    emit('update:modelValue', md)
    return md
  }
  return String(sourceDraft.value || '')
}

onBeforeUnmount(() => {
  setHostTermTitle(null)
  editor.value?.destroy()
})

defineExpose({ flush, toggleView, viewMode })
</script>

<template>
  <div class="markdown-field">
    <div
      v-if="showToggle"
      class="markdown-field__toolbar"
    >
      <slot name="label">
        <span class="markdown-field__label">描述</span>
      </slot>
      <button
        type="button"
        class="markdown-field__toggle"
        :class="{ 'is-active': viewMode === 'source' }"
        :title="toggleTitle"
        :aria-label="toggleTitle"
        :aria-pressed="viewMode === 'source'"
        @click="toggleView"
      >
        <AppIcon name="source" :size="14" />
      </button>
    </div>
    <div
      v-else
      class="markdown-field__toolbar markdown-field__toolbar--label-only"
    >
      <slot name="label">
        <span class="markdown-field__label">描述</span>
      </slot>
    </div>

    <div
      class="markdown-field__body"
      :class="{ 'is-flex-fill': !bodyStyle }"
      :style="bodyStyle"
    >
      <EditorContent
        v-show="viewMode === 'preview'"
        :editor="editor"
        class="markdown-field__preview"
      />
      <textarea
        v-show="viewMode === 'source'"
        class="markdown-field__source"
        :value="sourceDraft"
        :placeholder="placeholder"
        spellcheck="false"
        @input="onSourceInput"
      />
    </div>
  </div>
</template>

<style scoped>
.markdown-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-height: 0;
  flex: 1 1 auto;
}

.markdown-field__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex: 0 0 auto;
}

.markdown-field__toolbar--label-only {
  justify-content: flex-start;
}


.markdown-field__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--muted, #6b7c88);
  cursor: pointer;
}

.markdown-field__toggle:hover,
.markdown-field__toggle.is-active {
  border-color: var(--border, #c5d0d8);
  color: var(--ink, #1a2830);
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.markdown-field__body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: var(--surface, #f4f7f9);
  overflow: hidden;
}

/* 不设 min-height 时：完全由 flex 占满剩余高度，避免撑破父级 padding */
.markdown-field__body.is-flex-fill {
  flex: 1 1 0%;
  min-height: 0;
}

.markdown-field__preview {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0.4rem;
}

.markdown-field__preview :deep(.markdown-field__tiptap),
.markdown-field__preview :deep(.tiptap) {
  min-height: calc(100% - 0.4rem);
  padding: 0.2rem 0.3rem;
  outline: none;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--ink, #1a2830);
}

.markdown-field__preview :deep(.tiptap > *:first-child) {
  margin-top: 0;
}

.markdown-field__preview :deep(.tiptap > *:last-child) {
  margin-bottom: 0;
}

.markdown-field__preview :deep(p) {
  margin: 0.35em 0;
}

.markdown-field__preview :deep(h1),
.markdown-field__preview :deep(h2),
.markdown-field__preview :deep(h3),
.markdown-field__preview :deep(h4) {
  margin: 0.45em 0 0.25em;
  font-weight: 700;
  line-height: 1.35;
}

.markdown-field__preview :deep(h1) { font-size: 1.25em; }
.markdown-field__preview :deep(h2) { font-size: 1.12em; }
.markdown-field__preview :deep(h3) { font-size: 1.05em; }
.markdown-field__preview :deep(h4) { font-size: 1em; }

.markdown-field__preview :deep(ul),
.markdown-field__preview :deep(ol) {
  margin: 0.35em 0;
  padding-left: 1.35em;
}

.markdown-field__preview :deep(li) {
  margin: 0.15em 0;
}

.markdown-field__preview :deep(strong) {
  font-weight: 700;
}

.markdown-field__preview :deep(em) {
  font-style: italic;
}

.markdown-field__preview :deep(code) {
  padding: 0.1em 0.3em;
  border-radius: 3px;
  background: color-mix(in srgb, var(--ink, #1a2830) 8%, transparent);
  font-family: var(--font-mono, Consolas, monospace);
  font-size: 0.92em;
}

.markdown-field__preview :deep(blockquote) {
  margin: 0.4em 0;
  padding-left: 0.75em;
  border-left: 3px solid var(--border, #c5d0d8);
  color: var(--muted, #5a6b75);
}

.markdown-field__preview :deep(hr) {
  margin: 0.6em 0;
  border: none;
  border-top: 1px solid var(--border, #c5d0d8);
}

.markdown-field__source {
  flex: 1 1 auto;
  min-height: inherit;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0.45rem 0.55rem;
  border: none;
  border-radius: 0;
  resize: none;
  background: transparent;
  color: var(--ink, #1a2830);
  font-family: var(--font-mono, Consolas, monospace);
  font-size: 0.8125rem;
  line-height: 1.5;
}
</style>
