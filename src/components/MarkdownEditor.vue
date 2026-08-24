<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import AppIcon from './AppIcon.vue'
import { api } from '../api'
import { fromStorageMarkdown, toStorageMarkdown } from '../editor/blankLines'
import { HeadingBackspace } from '../editor/headingBackspace'
import { SelectionActionsExtension } from './selection-actions'
import {
  applyFromStorageTransforms,
  applyToStorageTransforms,
  getAllTiptapExtensions,
  readEditorMarkdown,
  runFileSaveHooks,
} from '../editor/extensions'
import {
  onReloadFileRequest,
  onSaveCurrentFileRequest,
  onScrollToHeadingRequest,
  publishDocumentOutline,
} from '../editor/shellEvents'

const props = defineProps({
  /** 相对 md 根的完整路径，如 `文件夹/a.md` 或根级 `a.md` */
  path: { type: String, default: '' },
  /** 左侧文件树是否可见 */
  sidebarOpen: { type: Boolean, default: true },
})

const emit = defineEmits(['toggle-sidebar'])

const filePath = computed(() => String(props.path || '').trim())
const hasFile = computed(() => !!filePath.value)

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
let stopReload = null

const editor = useEditor({
  extensions: [
    StarterKit,
    HeadingBackspace,
    SelectionActionsExtension,
    // 自定义节点须先于 Markdown，便于 tokenizer / renderMarkdown 注册完整
    ...getAllTiptapExtensions(),
    Markdown,
  ],
  content: '',
  editorProps: {
    attributes: {
      class: 'tiptap-prose',
      spellcheck: 'false',
    },
  },
  onUpdate: ({ editor: ed }) => {
    if (applyingValue) return
    // 落盘用真空行，并套用扩展 transform（如备注描述块）
    content.value = applyToStorageTransforms(
      toStorageMarkdown(ed.getMarkdown()),
      filePath.value,
    )
    dirty.value = true
    publishOutlineFromEditor(ed)
  },
  onCreate: ({ editor: ed }) => {
    publishOutlineFromEditor(ed)
  },
})
const editorReady = computed(() => !!editor.value && !editor.value.isDestroyed)

/** @param {import('@tiptap/core').Editor | null | undefined} ed */
function publishOutlineFromEditor(ed) {
  if (!filePath.value || !ed || ed.isDestroyed) {
    publishDocumentOutline([])
    return
  }
  /** @type {import('../editor/shellEvents').OutlineHeading[]} */
  const items = []
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = Number(node.attrs.level) || 1
      const text = String(node.textContent || '').trim() || '（无标题）'
      items.push({
        id: `h-${pos}-${level}`,
        level,
        text,
        pos,
      })
      return
    }
    if (node.type.name === 'termGlossary') {
      const text = String(node.attrs.title || '').trim() || '（无标题词条）'
      items.push({
        id: `term-${pos}`,
        level: 2,
        text,
        pos,
      })
    }
  })
  publishDocumentOutline(items)
}

/** 源码模式：ATX 标题 + ::: term 定义块 */
function publishOutlineFromSource(markdown) {
  if (!filePath.value) {
    publishDocumentOutline([])
    return
  }
  const src = String(markdown ?? '')
  const lines = src.split('\n')
  /** @type {import('../editor/shellEvents').OutlineHeading[]} */
  const items = []
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i])
    if (!m) continue
    const level = m[1].length
    const text = m[2].replace(/\s+#+\s*$/, '').trim() || '（无标题）'
    items.push({
      id: `src-${i + 1}-${level}`,
      level,
      text,
      pos: -1,
      line: i + 1,
    })
  }
  const termRe = /:::[\t ]*term[\t ]*\[([^\]]*)\]/gi
  let tm
  while ((tm = termRe.exec(src)) !== null) {
    const title = String(tm[1] || '').trim() || '（无标题词条）'
    const before = src.slice(0, tm.index)
    const line = before.split('\n').length
    items.push({
      id: `src-term-${line}-${tm.index}`,
      level: 2,
      text: title,
      pos: -1,
      line,
    })
  }
  items.sort((a, b) => (a.line || 0) - (b.line || 0) || a.id.localeCompare(b.id))
  publishDocumentOutline(items)
}

function refreshOutline() {
  if (!filePath.value) {
    publishDocumentOutline([])
    return
  }
  if (viewMode.value === 'source') {
    publishOutlineFromSource(content.value)
    return
  }
  if (editorReady.value) {
    publishOutlineFromEditor(editor.value)
  } else {
    publishOutlineFromSource(content.value)
  }
}

function scrollToHeading({ pos, line }) {
  if (viewMode.value === 'source') {
    const ta = sourceTextarea.value
    if (!ta || !line || line < 1) return
    const lines = (content.value ?? '').split('\n')
    let offset = 0
    for (let i = 0; i < line - 1 && i < lines.length; i += 1) {
      offset += lines[i].length + 1
    }
    ta.focus()
    ta.setSelectionRange(offset, offset)
    const lineHeight =
      Number.parseFloat(getComputedStyle(ta).lineHeight) || 20
    ta.scrollTop = Math.max(0, (line - 1) * lineHeight - ta.clientHeight / 3)
    syncSourceGutterScroll()
    return
  }

  const ed = editor.value
  if (!ed || ed.isDestroyed || typeof pos !== 'number' || pos < 0) return
  const max = ed.state.doc.content.size
  const safePos = Math.min(Math.max(pos, 0), max)
  ed.chain()
    .focus()
    .setTextSelection(Math.min(safePos + 1, max))
    .run()
  const dom = ed.view.nodeDOM(safePos)
  if (!(dom instanceof HTMLElement)) return
  const scroller =
    dom.closest('.tiptap-host') || ed.view.dom.parentElement
  if (scroller instanceof HTMLElement) {
    const domRect = dom.getBoundingClientRect()
    const scRect = scroller.getBoundingClientRect()
    const nextTop =
      scroller.scrollTop + (domRect.top - scRect.top) - scroller.clientHeight * 0.12
    scroller.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
  } else {
    dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

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
  publishOutlineFromSource(content.value)
}

function pullFromEditor() {
  if (editorReady.value && viewMode.value === 'edit') {
    content.value = readEditorMarkdown(editor.value, filePath.value)
  }
}

function syncEditorValue(value) {
  if (!editorReady.value || viewMode.value !== 'edit') return
  const storage = value || ''
  const forEditor = applyFromStorageTransforms(storage, filePath.value)
  const currentBody = toStorageMarkdown(editor.value.getMarkdown())
  if (currentBody === forEditor) return
  applyingValue = true
  // 读入时把连续空行还原成 TipTap 空段
  editor.value.commands.setContent(fromStorageMarkdown(forEditor), {
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
    publishOutlineFromSource(content.value)
    return
  }

  viewMode.value = mode
  await nextTick()
  syncEditorValue(content.value)
  refreshOutline()
}

async function loadFile() {
  if (!filePath.value) {
    content.value = ''
    dirty.value = false
    if (editorReady.value) {
      applyingValue = true
      editor.value.commands.setContent('', { emitUpdate: false })
      applyingValue = false
    }
    publishDocumentOutline([])
    return
  }

  const token = ++loadToken
  loading.value = true
  error.value = ''

  try {
    const data = await api.getFileByPath(filePath.value)
    if (token !== loadToken) return
    content.value = data.content
    dirty.value = false

    if (viewMode.value === 'edit') {
      await nextTick()
      // useEditor 可能尚未就绪
      if (editorReady.value) {
        syncEditorValue(data.content)
        publishOutlineFromEditor(editor.value)
      } else {
        const stop = watch(editorReady, (ready) => {
          if (!ready || token !== loadToken) return
          syncEditorValue(data.content)
          publishOutlineFromEditor(editor.value)
          stop()
        })
        publishOutlineFromSource(data.content)
      }
    } else {
      publishOutlineFromSource(data.content)
    }
  } catch (err) {
    if (token !== loadToken) return
    error.value = err.message
    publishDocumentOutline([])
  } finally {
    if (token === loadToken) loading.value = false
  }
}

async function saveFile(force = false) {
  pullFromEditor()
  if (!filePath.value || saving.value) return
  if (!force && !dirty.value) return

  saving.value = true
  error.value = ''

  try {
    await api.saveFileByPath(filePath.value, content.value)
    dirty.value = false
    await runFileSaveHooks({
      path: filePath.value,
      markdown: content.value,
    })
  } catch (err) {
    error.value = err.message
    throw err
  } finally {
    saving.value = false
  }
}

function scheduleAutosave() {
  clearInterval(saveTimer)
  saveTimer = setInterval(() => {
    if (dirty.value) {
      saveFile().catch(() => {})
    }
  }, AUTOSAVE_MS)
}

watch(
  filePath,
  async (next, prev) => {
    if (prev && dirty.value) {
      pullFromEditor()
      try {
        await api.saveFileByPath(prev, content.value)
        await runFileSaveHooks({
          path: prev,
          markdown: content.value,
        })
      } catch {
        // keep going to load next file
      }
    }
    await loadFile()
  },
)

let stopSaveCurrent = null
let stopScrollHeading = null

onMounted(() => {
  loadFile()
  scheduleAutosave()
  stopReload = onReloadFileRequest(({ path }) => {
    if (path === filePath.value) {
      // 扩展已写盘：以磁盘为准，避免本地 dirty 把外部改写盖回去
      dirty.value = false
      loadFile()
    }
  })
  stopSaveCurrent = onSaveCurrentFileRequest(async () => {
    await saveFile(true)
  })
  stopScrollHeading = onScrollToHeadingRequest(scrollToHeading)
})

onUnmounted(() => {
  clearInterval(saveTimer)
  stopReload?.()
  stopReload = null
  stopSaveCurrent?.()
  stopSaveCurrent = null
  stopScrollHeading?.()
  stopScrollHeading = null
  publishDocumentOutline([])
  if (dirty.value && filePath.value) {
    pullFromEditor()
    const path = filePath.value
    const markdown = content.value
    api
      .saveFileByPath(path, markdown)
      .then(() => runFileSaveHooks({ path, markdown }))
      .catch(() => {})
  }
  editor.value?.destroy()
})

defineExpose({ saveFile })
</script>

<template>
  <section class="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-bg">
    <div v-if="!hasFile" class="m-auto max-w-md px-5 py-8 text-center">
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
        v-if="hasFile"
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
