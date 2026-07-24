<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import FileSidebar from '../components/FileSidebar.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import { api } from '../api'
import { useToast } from '../composables/useToast'
import { useMediaQuery } from '../composables/useMediaQuery'
import { onOpenFileRequest } from '../editor/shellEvents'
import { useGlossaryStore } from '../stores/glossary'

const { showToast } = useToast()
const isMobile = useMediaQuery('(max-width: 767px)')

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

const sidebarShown = computed(() =>
  isMobile.value ? sidebarOpen.value : sidebarVisible.value,
)

function toggleSidebar() {
  if (isMobile.value) {
    sidebarOpen.value = !sidebarOpen.value
  } else {
    sidebarVisible.value = !sidebarVisible.value
  }
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
  activePath.value = path
  if (isMobile.value) sidebarOpen.value = false
}

let stopOpenFile = null

watch(isMobile, (mobile) => {
  if (!mobile) sidebarOpen.value = false
})

onMounted(async () => {
  stopOpenFile = onOpenFileRequest(({ path }) => {
    onSelectFile({ path })
  })
  try {
    await refreshTree()
  } catch (err) {
    showToast(err.message || '无法连接文档服务，请先运行 npm run dev', 'error')
  }
})

onUnmounted(() => {
  stopOpenFile?.()
  stopOpenFile = null
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" :class="{ 'cursor-progress': busy }">
    <div class="flex min-h-0 flex-1">
      <FileSidebar
        v-if="!isMobile && sidebarVisible"
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

      <MarkdownEditor
        :path="activePath"
        :sidebar-open="sidebarShown"
        @toggle-sidebar="toggleSidebar"
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
