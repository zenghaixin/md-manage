<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { api } from '../api'
import { useTheme } from '../composables/useTheme'

const props = defineProps({
  tab: { type: String, default: '' },
  file: { type: String, default: '' },
})

const { resolvedTheme } = useTheme()

const content = ref('')
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)
const error = ref('')
/** @type {import('vue').Ref<'edit' | 'source'>} */
const viewMode = ref('edit')
const editorHost = ref(null)

const AUTOSAVE_MS = 3000
let saveTimer = null
let loadToken = 0
/** @type {Vditor | null} */
let vditor = null
let applyingValue = false
let vditorReady = false

function vditorTheme() {
  return resolvedTheme.value === 'dark' ? 'dark' : 'classic'
}

function destroyVditor() {
  if (!vditor) return
  vditor.destroy()
  vditor = null
  vditorReady = false
}

function pullFromEditor() {
  if (vditor && vditorReady && viewMode.value === 'edit') {
    content.value = vditor.getValue()
  }
}

function syncEditorValue(value) {
  if (!vditor || !vditorReady || viewMode.value !== 'edit') return
  const current = vditor.getValue()
  if (current === value) return
  applyingValue = true
  vditor.setValue(value || '', true)
  applyingValue = false
}

async function ensureVditor() {
  if (vditor || !editorHost.value || viewMode.value !== 'edit') return

  await nextTick()
  if (!editorHost.value || viewMode.value !== 'edit') return

  await new Promise((resolve) => {
    vditor = new Vditor(editorHost.value, {
      height: '100%',
      mode: 'ir',
      theme: vditorTheme(),
      icon: 'ant',
      placeholder: '',
      cache: { enable: false },
      toolbar: [],
      toolbarConfig: { hide: true },
      preview: {
        theme: {
          current: resolvedTheme.value === 'dark' ? 'dark' : 'light',
        },
        hljs: {
          style: resolvedTheme.value === 'dark' ? 'github-dark' : 'github',
        },
      },
      after: () => {
        vditorReady = true
        applyingValue = true
        vditor?.setValue(content.value || '', true)
        applyingValue = false
        resolve()
      },
      input: (value) => {
        if (applyingValue) return
        content.value = value
        dirty.value = true
      },
      blur: (value) => {
        if (applyingValue) return
        content.value = value
      },
    })
  })
}

async function setViewMode(mode) {
  if (viewMode.value === mode) return

  pullFromEditor()

  if (mode === 'source') {
    destroyVditor()
    viewMode.value = mode
    return
  }

  viewMode.value = mode
  await nextTick()
  await ensureVditor()
  syncEditorValue(content.value)
}

function onSourceInput(value) {
  content.value = value
  dirty.value = true
}

async function loadFile() {
  if (!props.tab || !props.file) {
    content.value = ''
    dirty.value = false
    destroyVditor()
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
      if (vditor && vditorReady) {
        syncEditorValue(data.content)
      } else {
        await ensureVditor()
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

watch(resolvedTheme, (theme) => {
  if (!vditor || !vditorReady) return
  vditor.setTheme(theme === 'dark' ? 'dark' : 'classic', theme === 'dark' ? 'dark' : 'light')
})

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
  destroyVditor()
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
        顶部标签对应文件夹，文件列表中的
        <code class="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.85em]">.md</code>
        文档可编辑。支持即时渲染与源代码切换，内容每 {{ AUTOSAVE_MS / 1000 }} 秒自动保存。
      </p>
    </div>

    <template v-else>
      <div
        class="flex flex-col gap-2 border-b border-border bg-surface px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4"
      >
        <div class="flex min-w-0 items-baseline gap-1.5 text-sm">
          <span class="text-muted">{{ tab }}</span>
          <span class="text-border-strong">/</span>
          <span class="truncate font-mono text-ink">{{ file }}</span>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
          <span v-if="error" class="text-xs text-danger">{{ error }}</span>
          <el-radio-group
            :model-value="viewMode"
            size="small"
            @update:model-value="setViewMode"
          >
            <el-radio-button value="edit">编辑</el-radio-button>
            <el-radio-button value="source">源码</el-radio-button>
          </el-radio-group>
          <el-button
            type="primary"
            size="small"
            :disabled="!dirty || saving"
            :loading="saving"
            @click="saveFile"
          >
            保存
          </el-button>
        </div>
      </div>

      <div
        class="md-editor relative min-h-0 flex-1"
        :class="{ 'is-loading': loading }"
      >
        <div
          v-show="viewMode === 'edit'"
          ref="editorHost"
          class="vditor-host h-full"
        />
        <el-input
          v-show="viewMode === 'source'"
          class="editor-input h-full"
          type="textarea"
          :model-value="content"
          :disabled="loading"
          :autosize="false"
          resize="none"
          spellcheck="false"
          @update:model-value="onSourceInput"
        />
      </div>
    </template>
  </section>
</template>
