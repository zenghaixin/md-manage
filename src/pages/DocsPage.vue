<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import FileSidebar from '../components/FileSidebar.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import { api } from '../api'
import { useToast } from '../composables/useToast'
import { useMediaQuery } from '../composables/useMediaQuery'
import { onOpenFileRequest } from '../editor/shellEvents'

const { showToast } = useToast()
const isMobile = useMediaQuery('(max-width: 767px)')

/** @type {import('vue').Ref<{ name: string, files: string[] }[]>} */
const folders = ref([])
const activeTab = ref('')
const activeFile = ref('')
const busy = ref(false)
/** 桌面端侧栏折叠；移动端抽屉 */
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

async function refreshTree(preferTab, preferFile) {
  const { tabs } = await api.getTabs()
  const next = await Promise.all(
    tabs.map(async (name) => {
      const { files } = await api.getFiles(name)
      return { name, files }
    }),
  )
  folders.value = next

  const tabNames = next.map((f) => f.name)
  let tab = preferTab && tabNames.includes(preferTab) ? preferTab : activeTab.value
  if (!tabNames.includes(tab)) tab = tabNames[0] || ''

  const folder = next.find((f) => f.name === tab)
  const files = folder?.files || []
  let file = preferFile && files.includes(preferFile) ? preferFile : activeFile.value
  if (!files.includes(file)) file = files[0] || ''

  activeTab.value = tab
  activeFile.value = file
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

async function onAddFolder() {
  const trimmed = await promptName('新建文件夹')
  if (!trimmed) return

  busy.value = true
  try {
    await api.createTab(trimmed)
    await refreshTree(trimmed, '')
    showToast(`已创建文件夹：md/${trimmed}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onRemoveFolder(tab) {
  try {
    await ElMessageBox.confirm(
      `确定删除文件夹「${tab}」及其下的全部 Markdown 文件？`,
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
    await api.deleteTab(tab)
    if (activeTab.value === tab) {
      activeTab.value = ''
      activeFile.value = ''
    }
    await refreshTree()
    showToast(`已删除：md/${tab}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onAddFile(tab) {
  if (!tab) return
  const trimmed = await promptName('新建文件')
  if (!trimmed) return

  busy.value = true
  try {
    const data = await api.createFile(tab, trimmed)
    await refreshTree(tab, data.name)
    showToast(`已创建：md/${tab}/${data.name}`, 'success')
    if (isMobile.value) sidebarOpen.value = false
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onRenameFile({ tab, file, name }) {
  if (!tab || !file || !name) return

  busy.value = true
  try {
    const data = await api.renameFile(tab, file, name)
    const prefer =
      activeTab.value === tab && activeFile.value === file ? data.name : activeFile.value
    await refreshTree(tab, prefer)
    showToast(`已重命名为：${data.name}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onRemoveFile({ tab, file }) {
  if (!tab || !file) return
  try {
    await ElMessageBox.confirm(`确定删除文件「${file}」？`, '删除文件', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  busy.value = true
  try {
    await api.deleteFile(tab, file)
    if (activeTab.value === tab && activeFile.value === file) {
      activeFile.value = ''
    }
    await refreshTree(tab)
    showToast(`已删除：${file}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

function onSelectFile({ tab, file }) {
  activeTab.value = tab
  activeFile.value = file
  if (isMobile.value) sidebarOpen.value = false
}

let stopOpenFile = null

watch(isMobile, (mobile) => {
  if (!mobile) sidebarOpen.value = false
})

onMounted(async () => {
  stopOpenFile = onOpenFileRequest(({ tab, file }) => {
    onSelectFile({ tab, file })
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
        :folders="folders"
        :active-tab="activeTab"
        :active-file="activeFile"
        @select="onSelectFile"
        @add-folder="onAddFolder"
        @remove-folder="onRemoveFolder"
        @add-file="onAddFile"
        @remove-file="onRemoveFile"
        @rename-file="onRenameFile"
      />

      <MarkdownEditor
        :tab="activeTab"
        :file="activeFile"
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
        :folders="folders"
        :active-tab="activeTab"
        :active-file="activeFile"
        @select="onSelectFile"
        @add-folder="onAddFolder"
        @remove-folder="onRemoveFolder"
        @add-file="onAddFile"
        @remove-file="onRemoveFile"
        @rename-file="onRenameFile"
      />
    </el-drawer>
  </div>
</template>
