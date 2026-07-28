<script setup>
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import FileSidebar from '../components/FileSidebar.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import OpsSidePanel from '../components/OpsSidePanel.vue'
import PaneSplitter from '../components/PaneSplitter.vue'
import { api } from '../api'
import { useToast } from '../composables/useToast'
import { useMediaQuery } from '../composables/useMediaQuery'
import {
  onOpenFileRequest,
  onOpenRightPanelRequest,
  onCloseRightPanelRequest,
  notifyRightPanelDismiss,
  notifyRightPanelOpened,
  getRightPanelHost,
  isUiGestureLocked,
} from '../editor/shellEvents'
import {
  getRightPanelModule,
  listVisibleRightPanelModules,
  onRightPanelModulesChanged,
  resolveActiveRightPanelModuleId,
} from '../editor/rightPanelRegistry'
import { appConfig, patchAppConfig } from '../composables/useAppConfig'
import { useGlossaryStore } from '../stores/glossary'

const { showToast } = useToast()
const isMobile = useMediaQuery('(max-width: 767px)')

const LEFT_MIN = 160
const LEFT_DEFAULT = 256
const RIGHT_MIN = 240
const RIGHT_DEFAULT = 320
const EDITOR_MIN = 320
const SPLITTER_W = 1

/** 路径变更后重扫词库，保证弹窗「跟踪文件」的 sourcePath 与磁盘一致 */
async function refreshGlossaryPaths() {
  try {
    await useGlossaryStore().bootstrap()
  } catch (err) {
    console.warn('[docs] refresh glossary failed:', err)
  }
}

/** @type {import('vue').Ref<any[]>} */
const tree = ref([])
/** 当前文件完整路径，如 `文件夹/子/a.md` */
const activePath = ref('')
const busy = ref(false)
const sidebarVisible = ref(true)
const sidebarOpen = ref(false)

const leftWidth = ref(LEFT_DEFAULT)
const rightWidth = ref(RIGHT_DEFAULT)
const rightOpen = ref(false)
const activeModuleId = ref('')
const bookmarkTick = ref(0)
const layoutEl = ref(null)
const opsPanelRef = ref(null)

/** 当前已挂载的模块 id（用于切换时 unmount） */
let mountedModuleId = ''

/** 拖拽缓存 */
let dragLeftStart = 0
let dragRightStart = 0

const sidebarShown = computed(() =>
  isMobile.value ? sidebarOpen.value : sidebarVisible.value,
)

const visibleBookmarks = computed(() => {
  bookmarkTick.value
  return listVisibleRightPanelModules().map((m) => ({
    id: m.id,
    label: m.label,
  }))
})

const showLeftPane = computed(() => !isMobile.value && sidebarVisible.value)
const showLeftSplitter = computed(() => showLeftPane.value)
const showRightSplitter = computed(() => !isMobile.value && rightOpen.value)

function refreshBookmarks() {
  bookmarkTick.value += 1
}

function resolveModuleId(preferId) {
  const saved = preferId ?? appConfig.value.rightPanelActiveModuleId
  return resolveActiveRightPanelModuleId(saved)
}

async function mountActiveModule() {
  const id = activeModuleId.value
  const host =
    (await opsPanelRef.value?.waitHost?.()) ||
    opsPanelRef.value?.getHost?.() ||
    getRightPanelHost()
  if (!host) return

  // 同一模块已挂载则不重复 mount，避免右栏/布局抖动波及编辑器
  if (id && id === mountedModuleId && host.childNodes.length) {
    return
  }

  if (mountedModuleId) {
    try {
      getRightPanelModule(mountedModuleId)?.unmount?.()
    } catch (err) {
      console.warn('[docs] unmount module failed:', err)
    }
    mountedModuleId = ''
  }

  host.replaceChildren()
  if (!id) return

  const mod = getRightPanelModule(id)
  if (!mod || !mod.isVisible()) {
    const fallback = resolveModuleId('')
    activeModuleId.value = fallback
    if (!fallback || fallback === id) return
    return mountActiveModule()
  }

  try {
    mod.mount(host)
    mountedModuleId = id
  } catch (err) {
    console.warn('[docs] mount module failed:', err)
  }
}

function unmountActiveModule() {
  if (!mountedModuleId) return
  try {
    getRightPanelModule(mountedModuleId)?.unmount?.()
  } catch (err) {
    console.warn('[docs] unmount module failed:', err)
  }
  mountedModuleId = ''
}

async function activateModule(moduleId, { persist = true } = {}) {
  const next = resolveModuleId(moduleId)
  activeModuleId.value = next
  // 仅用户点书签时持久化；扩展自动打开右栏不要写 .app-config（会触发 Vite 整页刷新）
  if (persist) {
    void patchAppConfig({ rightPanelActiveModuleId: next })
  }
  if (rightOpen.value) await mountActiveModule()
}

function toggleSidebar() {
  if (isMobile.value) {
    sidebarOpen.value = !sidebarOpen.value
  } else {
    sidebarVisible.value = !sidebarVisible.value
  }
}

async function toggleRightPanel() {
  if (rightOpen.value) {
    closeRightPanelByShell()
  } else {
    rightOpen.value = true
    activeModuleId.value = resolveModuleId(activeModuleId.value)
    await mountActiveModule()
    notifyRightPanelOpened()
  }
}

function closeRightPanelByShell() {
  if (!rightOpen.value) return
  notifyRightPanelDismiss()
  unmountActiveModule()
  rightOpen.value = false
}

function closeRightPanelSilent() {
  unmountActiveModule()
  rightOpen.value = false
}

function onSelectModule(id) {
  if (!id || id === activeModuleId.value) return
  void activateModule(id)
}

function layoutBudget() {
  const total = layoutEl.value?.clientWidth || window.innerWidth
  const left = showLeftPane.value ? leftWidth.value + SPLITTER_W : 0
  const right = rightOpen.value ? rightWidth.value + SPLITTER_W : 0
  return { total, left, right, editor: total - left - right }
}

function clampLeft(next) {
  const { total } = layoutBudget()
  const right = rightOpen.value ? rightWidth.value + SPLITTER_W : 0
  const max = Math.max(LEFT_MIN, total - EDITOR_MIN - right - SPLITTER_W)
  return Math.min(Math.max(next, LEFT_MIN), max)
}

function clampRight(next) {
  const { total } = layoutBudget()
  const left = showLeftPane.value ? leftWidth.value + SPLITTER_W : 0
  const max = Math.max(RIGHT_MIN, total - EDITOR_MIN - left - SPLITTER_W)
  return Math.min(Math.max(next, RIGHT_MIN), max)
}

function onLeftDragStart() {
  dragLeftStart = leftWidth.value
}

function onLeftDrag({ deltaX }) {
  leftWidth.value = clampLeft(dragLeftStart + deltaX)
}

function onRightDragStart() {
  dragRightStart = rightWidth.value
}

function onRightDrag({ deltaX }) {
  rightWidth.value = clampRight(dragRightStart - deltaX)
}

function collectFilePaths(nodes, out = []) {
  for (const n of nodes || []) {
    if (n.type === 'file') out.push(n.path)
    else collectFilePaths(n.children, out)
  }
  return out
}

async function refreshTree(preferPath) {
  const data = await api.getTree()
  tree.value = data.tree || []
  const files = collectFilePaths(tree.value)
  let next = preferPath && files.includes(preferPath) ? preferPath : activePath.value
  if (!files.includes(next)) next = files[0] || ''
  activePath.value = next
}

async function promptName(title) {
  try {
    const { value } = await ElMessageBox.prompt('', title, {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
    })
    return value.trim()
  } catch {
    return ''
  }
}

async function onAddRootFolder() {
  const trimmed = await promptName('新建文件夹')
  if (!trimmed) return
  busy.value = true
  try {
    const data = await api.createFolder('', trimmed)
    await refreshTree(activePath.value)
    showToast(`已创建文件夹：md/${data.path}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onAddFolder(parentPath) {
  const trimmed = await promptName('新建子文件夹')
  if (!trimmed) return
  busy.value = true
  try {
    const data = await api.createFolder(parentPath, trimmed)
    await refreshTree(activePath.value)
    showToast(`已创建文件夹：md/${data.path}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onRemoveFolder(pathRel) {
  try {
    await ElMessageBox.confirm(
      `确定删除文件夹「${pathRel}」及其内部全部子文件夹与 Markdown 文件？此操作不可恢复。`,
      '删除文件夹',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  busy.value = true
  try {
    await api.deleteFolder(pathRel)
    if (
      activePath.value === pathRel ||
      activePath.value.startsWith(`${pathRel}/`)
    ) {
      activePath.value = ''
    }
    await refreshTree()
    await refreshGlossaryPaths()
    showToast(`已删除：md/${pathRel}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onRenameFolder({ path: pathRel, name }) {
  if (!pathRel || !name) return
  busy.value = true
  try {
    const data = await api.renameFolder(pathRel, name)
    let prefer = activePath.value
    if (prefer === pathRel || prefer.startsWith(`${pathRel}/`)) {
      prefer = data.path + prefer.slice(pathRel.length)
    }
    await refreshTree(prefer)
    await refreshGlossaryPaths()
    showToast(`已重命名文件夹为：${data.name}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onAddFile(parentPath) {
  if (!parentPath) return
  const trimmed = await promptName('新建文件')
  if (!trimmed) return
  busy.value = true
  try {
    const data = await api.createFileIn(parentPath, trimmed)
    await refreshTree(data.path)
    showToast(`已创建：md/${data.path}`, 'success')
    if (isMobile.value) sidebarOpen.value = false
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onRenameFile({ path: pathRel, name }) {
  if (!pathRel || !name) return
  busy.value = true
  try {
    const data = await api.renameFileByPath(pathRel, name)
    const prefer = activePath.value === pathRel ? data.path : activePath.value
    await refreshTree(prefer)
    await refreshGlossaryPaths()
    showToast(`已重命名为：${data.name}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onRemoveFile(pathRel) {
  if (!pathRel) return
  try {
    await ElMessageBox.confirm(`确定删除文件「${pathRel}」？`, '删除文件', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  busy.value = true
  try {
    await api.deleteFileByPath(pathRel)
    if (activePath.value === pathRel) activePath.value = ''
    await refreshTree()
    await refreshGlossaryPaths()
    showToast(`已删除：${pathRel}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onMove({ fromPath, toParentPath, toIndex }) {
  if (!fromPath) return
  busy.value = true
  try {
    const data = await api.moveTreeEntry(fromPath, toParentPath, toIndex)
    let prefer = activePath.value
    if (prefer === fromPath || prefer.startsWith(`${fromPath}/`)) {
      prefer = data.path + prefer.slice(fromPath.length)
    }
    await refreshTree(prefer)
    await refreshGlossaryPaths()
  } catch (err) {
    showToast(err.message, 'error')
    await refreshTree(activePath.value)
  } finally {
    busy.value = false
  }
}

function onSelectFile({ path }) {
  // 选区气泡点击期间禁止切文件，否则会 loadFile 冲掉刚打上的备注
  if (isUiGestureLocked()) return
  activePath.value = path
  if (isMobile.value) sidebarOpen.value = false
}

let stopOpenFile = null
let stopOpenRight = null
let stopCloseRight = null
let stopModules = null
let stopWinFocus = null

watch(isMobile, (mobile) => {
  if (!mobile) sidebarOpen.value = false
})

onMounted(async () => {
  activeModuleId.value = resolveModuleId(appConfig.value.rightPanelActiveModuleId)

  stopModules = onRightPanelModulesChanged(() => {
    refreshBookmarks()
    if (!rightOpen.value) return
    const next = resolveModuleId(activeModuleId.value)
    if (next !== activeModuleId.value || next !== mountedModuleId) {
      void activateModule(next, { persist: next !== appConfig.value.rightPanelActiveModuleId })
    }
  })

  stopOpenFile = onOpenFileRequest(({ path }) => {
    onSelectFile({ path })
  })
  stopOpenRight = onOpenRightPanelRequest(async ({ moduleId, onReady }) => {
    const wasOpen = rightOpen.value
    rightOpen.value = true
    // 扩展请求打开：切换模块但不写 app-config，避免 Vite 监听到文件变更整页刷新
    if (!wasOpen || moduleId) {
      await activateModule(moduleId || activeModuleId.value, { persist: false })
    }
    await nextTick()
    const host =
      opsPanelRef.value?.getHost?.() || getRightPanelHost()
    if (host && onReady) onReady(host)
  })
  stopCloseRight = onCloseRightPanelRequest(() => {
    closeRightPanelSilent()
  })

  const onWinFocus = () => {
    // 在资源管理器里直接增删 md 后，回前台补一次树
    void refreshTree(activePath.value).catch(() => {})
  }
  window.addEventListener('focus', onWinFocus)
  stopWinFocus = () => window.removeEventListener('focus', onWinFocus)

  try {
    await refreshTree()
  } catch (err) {
    showToast(err.message || '无法连接文档服务，请先运行 npm run dev', 'error')
  }
})

onUnmounted(() => {
  stopOpenFile?.()
  stopOpenFile = null
  stopOpenRight?.()
  stopOpenRight = null
  stopCloseRight?.()
  stopCloseRight = null
  stopModules?.()
  stopModules = null
  stopWinFocus?.()
  stopWinFocus = null
  unmountActiveModule()
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" :class="{ 'cursor-progress': busy }">
    <div ref="layoutEl" class="flex min-h-0 flex-1">
      <div
        v-if="showLeftPane"
        class="flex min-h-0 shrink-0 flex-col overflow-hidden"
        :style="{ width: `${leftWidth}px` }"
      >
        <FileSidebar
          class="h-full !w-full !border-r-0"
          :tree="tree"
          :active-path="activePath"
          @select="onSelectFile"
          @add-root-folder="onAddRootFolder"
          @add-folder="onAddFolder"
          @remove-folder="onRemoveFolder"
          @rename-folder="onRenameFolder"
          @add-file="onAddFile"
          @remove-file="onRemoveFile"
          @rename-file="onRenameFile"
          @move="onMove"
        />
      </div>

      <PaneSplitter
        v-if="showLeftSplitter"
        @dragstart="onLeftDragStart"
        @drag="onLeftDrag"
      />

      <MarkdownEditor
        class="min-w-0 flex-1"
        :path="activePath"
        :sidebar-open="sidebarShown"
        @toggle-sidebar="toggleSidebar"
      />

      <PaneSplitter
        v-if="showRightSplitter"
        @dragstart="onRightDragStart"
        @drag="onRightDrag"
      />

      <OpsSidePanel
        v-if="!isMobile"
        ref="opsPanelRef"
        :open="rightOpen"
        :width="rightWidth"
        :bookmarks="visibleBookmarks"
        :active-module-id="activeModuleId"
        @toggle="toggleRightPanel"
        @select-module="onSelectModule"
      />
    </div>

    <el-drawer
      v-model="sidebarOpen"
      title="文件"
      direction="ltr"
      size="80%"
      class="file-drawer"
      append-to-body
    >
      <FileSidebar
        :tree="tree"
        :active-path="activePath"
        @select="onSelectFile"
        @add-root-folder="onAddRootFolder"
        @add-folder="onAddFolder"
        @remove-folder="onRemoveFolder"
        @rename-folder="onRenameFolder"
        @add-file="onAddFile"
        @remove-file="onRemoveFile"
        @rename-file="onRenameFile"
        @move="onMove"
      />
    </el-drawer>
  </div>
</template>
