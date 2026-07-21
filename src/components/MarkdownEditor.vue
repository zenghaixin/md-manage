<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import AppIcon from './AppIcon.vue'
import { api } from '../api'
import { fromStorageMarkdown, toStorageMarkdown } from '../editor/blankLines'
import {
  getAllTiptapExtensions,
  readEditorMarkdown,
} from '../editor/extensions'

const props = defineProps({
  tab: { type: String, default: '' },
  file: { type: String, default: '' },
  /** 左侧文件树是否可见 */
  sidebarOpen: { type: Boolean, default: true },
})

const emit = defineEmits(['toggle-sidebar'])

const content = ref('')
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)
const error = ref('')
/** @type {import('vue').Ref<'edit' | 'source'>} */
const viewMode = ref('edit')

const AUTOSAVE_MS = 3000
let saveTimer = null
let loadToken = 0
let applyingValue = false

const editor = useEditor({
  extensions: [StarterKit, Markdown, ...getAllTiptapExtensions()],
  content: '',
  editorProps: {
    attributes: {
      class: 'tiptap-prose',
      spellcheck: 'false',
    },
  },
  onUpdate: ({ editor: ed }) => {
    if (applyingValue) return
    // 落盘用真空行，不把 &nbsp; 写进源码
    content.value = toStorageMarkdown(ed.getMarkdown())
    dirty.value = true
  },
})
const editorReady = computed(() => !!editor.value && !editor.value.isDestroyed)

const sourceTextarea = ref(null)
const sourceGutter = ref(null)

const sourceLineCount = computed(() => {
  const text = content.value ?? ''
  return text.length === 0 ? 1 : text.split('\n').length
})

function syncSourceGutterScroll() {
  const ta = sourceTextarea.value
  const gutter = sourceGutter.value
  if (!ta || !gutter) return
  gutter.scrollTop = ta.scrollTop
}

function onSourceTextareaInput(event) {
  content.value = event.target.value
  dirty.value = true
}

function pullFromEditor() {
  if (editorReady.value && viewMode.value === 'edit') {
    content.value = readEditorMarkdown(editor.value)
  }
}

function syncEditorValue(value) {
  if (!editorReady.value || viewMode.value !== 'edit') return
  const storage = value || ''
  const current = toStorageMarkdown(editor.value.getMarkdown())
  if (current === storage) return
  applyingValue = true
  // 读入时把连续空行还原成 TipTap 空段
  editor.value.commands.setContent(fromStorageMarkdown(storage), {
    contentType: 'markdown',
    emitUpdate: false,
  })
  applyingValue = false
}

async function setViewMode(mode) {
  if (viewMode.value === mode) return

  pullFromEditor()

  if (mode === 'source') {
    viewMode.value = mode
    return
  }

  viewMode.value = mode
  await nextTick()
  syncEditorValue(content.value)
}

async function loadFile() {
  if (!props.tab || !props.file) {
    content.value = ''
    dirty.value = false
    if (editorReady.value) {
      applyingValue = true
      editor.value.commands.setContent('', { emitUpdate: false })
      applyingValue = false
    }
    return
  }

  const token = ++loadToken
  loading.value = true
  error.value = ''

  try {
    const data = await api.getFile(props.tab, props.file)
    if (token !== loadToken) return
    content.value = data.content
    dirty.value = false

    if (viewMode.value === 'edit') {
      await nextTick()
      // useEditor 可能尚未就绪
      if (editorReady.value) {
        syncEditorValue(data.content)
      } else {
        const stop = watch(editorReady, (ready) => {
          if (!ready || token !== loadToken) return
          syncEditorValue(data.content)
          stop()
        })
      }
    }
  } catch (err) {
    if (token !== loadToken) return
    error.value = err.message
  } finally {
    if (token === loadToken) loading.value = false
  }
}

async function saveFile() {
  pullFromEditor()
  if (!props.tab || !props.file || !dirty.value || saving.value) return

  saving.value = true
  error.value = ''

  try {
    await api.saveFile(props.tab, props.file, content.value)
    dirty.value = false
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

function scheduleAutosave() {
  clearInterval(saveTimer)
  saveTimer = setInterval(() => {
    if (dirty.value) saveFile()
  }, AUTOSAVE_MS)
}

watch(
  () => [props.tab, props.file],
  async (_next, prev) => {
    const [prevTab, prevFile] = prev || []
    if (prevTab && prevFile && dirty.value) {
      pullFromEditor()
      try {
        await api.saveFile(prevTab, prevFile, content.value)
      } catch {
        // keep going to load next file
      }
    }
    await loadFile()
  },
)

onMounted(() => {
  loadFile()
  scheduleAutosave()
})

onUnmounted(() => {
  clearInterval(saveTimer)
  if (dirty.value && props.tab && props.file) {
    pullFromEditor()
    api.saveFile(props.tab, props.file, content.value).catch(() => {})
  }
  editor.value?.destroy()
})

defineExpose({ saveFile })
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
    <div v-if="!tab || !file" class="m-auto max-w-md px-5 py-8 text-center">
      <h2 class="mb-3 font-display text-lg font-semibold text-ink sm:text-xl">
        选择或新建一个 Markdown 文件
      </h2>
      <p class="m-0 text-sm leading-relaxed text-muted sm:text-[0.95rem]">
        左侧文件树中选择文件夹下的
        <code class="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.85em]">.md</code>
        文档即可编辑。支持即时渲染与源代码切换，内容每 {{ AUTOSAVE_MS / 1000 }} 秒自动保存。
      </p>
    </div>

    <div
      v-else
      class="md-editor relative min-h-0 flex-1"
      :class="{ 'is-loading': loading }"
    >
      <EditorContent
        v-show="viewMode === 'edit'"
        :editor="editor"
        class="tiptap-host h-full"
      />
      <div
        v-show="viewMode === 'source'"
        class="source-editor h-full"
      >
        <div
          ref="sourceGutter"
          class="source-gutter"
          aria-hidden="true"
        >
          <span
            v-for="n in sourceLineCount"
            :key="n"
            class="source-gutter-line"
          >{{ n }}</span>
        </div>
        <textarea
          ref="sourceTextarea"
          class="source-textarea"
          :value="content"
          :disabled="loading"
          spellcheck="false"
          wrap="off"
          @input="onSourceTextareaInput"
          @scroll="syncSourceGutterScroll"
        />
      </div>
    </div>

    <div
      class="flex shrink-0 items-center gap-1 border-t border-border bg-surface px-2 py-1"
    >
      <button
        type="button"
        class="inline-flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-surface-hover hover:text-ink"
        :title="sidebarOpen ? '关闭侧边栏' : '打开侧边栏'"
        :aria-label="sidebarOpen ? '关闭侧边栏' : '打开侧边栏'"
        @click="emit('toggle-sidebar')"
      >
        <AppIcon :name="sidebarOpen ? 'sidebarFold' : 'sidebarExpand'" :size="16" />
      </button>

      <button
        v-if="tab && file"
        type="button"
        class="inline-flex h-7 w-7 items-center justify-center rounded transition-colors"
        :class="
          viewMode === 'source'
            ? 'bg-accent-soft text-accent'
            : 'text-muted hover:bg-surface-hover hover:text-ink'
        "
        :title="viewMode === 'source' ? '切换到编辑' : '切换到源码'"
        :aria-label="viewMode === 'source' ? '切换到编辑' : '切换到源码'"
        :aria-pressed="viewMode === 'source'"
        @click="setViewMode(viewMode === 'source' ? 'edit' : 'source')"
      >
        <AppIcon name="source" :size="16" />
      </button>

      <div class="flex-1" />

      <span v-if="error" class="max-w-[40%] truncate text-xs text-danger">{{ error }}</span>
    </div>
  </section>
</template>
