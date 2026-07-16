<script setup>
import { ref, watch, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Folder } from '@element-plus/icons-vue'
import TabBar from '../components/TabBar.vue'
import FileSidebar from '../components/FileSidebar.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import { api } from '../api'
import { useToast } from '../composables/useToast'
import { useMediaQuery } from '../composables/useMediaQuery'

const { showToast } = useToast()
const isMobile = useMediaQuery('(max-width: 767px)')

const tabs = ref([])
const activeTab = ref('')
const files = ref([])
const activeFile = ref('')
const busy = ref(false)
const sidebarOpen = ref(false)

async function refreshTabs(prefer) {
  const data = await api.getTabs()
  tabs.value = data.tabs
  if (prefer && tabs.value.includes(prefer)) {
    activeTab.value = prefer
  } else if (!tabs.value.includes(activeTab.value)) {
    activeTab.value = tabs.value[0] || ''
  }
}

async function refreshFiles(prefer) {
  if (!activeTab.value) {
    files.value = []
    activeFile.value = ''
    return
  }
  const data = await api.getFiles(activeTab.value)
  files.value = data.files
  if (prefer && files.value.includes(prefer)) {
    activeFile.value = prefer
  } else if (!files.value.includes(activeFile.value)) {
    activeFile.value = files.value[0] || ''
  }
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

async function onAddTab() {
  const trimmed = await promptName('新建标签')
  if (!trimmed) return

  busy.value = true
  try {
    await api.createTab(trimmed)
    await refreshTabs(trimmed)
    showToast(`已创建标签文件夹：md/${trimmed}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onRemoveTab(tab) {
  try {
    await ElMessageBox.confirm(
      `确定删除标签「${tab}」及其文件夹下的全部 Markdown 文件？`,
      '删除标签',
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
    await refreshTabs()
    showToast(`已删除：md/${tab}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onAddFile() {
  if (!activeTab.value) return
  const trimmed = await promptName('新建文件')
  if (!trimmed) return

  busy.value = true
  try {
    const data = await api.createFile(activeTab.value, trimmed)
    await refreshFiles(data.name)
    showToast(`已创建：md/${activeTab.value}/${data.name}`, 'success')
    if (isMobile.value) sidebarOpen.value = false
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onRenameFile({ file, name }) {
  if (!activeTab.value || !file || !name) return

  busy.value = true
  try {
    const data = await api.renameFile(activeTab.value, file, name)
    const prefer = activeFile.value === file ? data.name : activeFile.value
    await refreshFiles(prefer)
    showToast(`已重命名为：${data.name}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

async function onRemoveFile(file) {
  if (!activeTab.value) return
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
    await api.deleteFile(activeTab.value, file)
    if (activeFile.value === file) activeFile.value = ''
    await refreshFiles()
    showToast(`已删除：${file}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    busy.value = false
  }
}

function onSelectFile(file) {
  activeFile.value = file
  if (isMobile.value) sidebarOpen.value = false
}

watch(activeTab, () => {
  refreshFiles().catch((err) => showToast(err.message, 'error'))
})

watch(isMobile, (mobile) => {
  if (!mobile) sidebarOpen.value = false
})

onMounted(async () => {
  try {
    await refreshTabs()
    await refreshFiles()
  } catch (err) {
    showToast(err.message || '无法连接文档服务，请先运行 npm run dev', 'error')
  }
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" :class="{ 'cursor-progress': busy }">
    <div class="flex min-h-10 shrink-0 items-stretch border-b border-border bg-surface">
      <el-button
        v-if="tabs.length"
        class="!m-0 !h-auto !rounded-none border-0 border-r border-border px-3 md:!hidden"
        :icon="Folder"
        text
        title="文件列表"
        aria-label="打开文件列表"
        @click="sidebarOpen = true"
      />
      <TabBar
        class="min-w-0 flex-1"
        :tabs="tabs"
        :active-tab="activeTab"
        @select="activeTab = $event"
        @add="onAddTab"
        @remove="onRemoveTab"
      />
    </div>

    <div class="flex min-h-0 flex-1">
      <FileSidebar
        v-if="tabs.length && !isMobile"
        :files="files"
        :active-file="activeFile"
        :tab-name="activeTab"
        @select="onSelectFile"
        @add="onAddFile"
        @rename="onRenameFile"
        @remove="onRemoveFile"
      />

      <MarkdownEditor :tab="activeTab" :file="activeFile" />
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
        v-if="tabs.length"
        :files="files"
        :active-file="activeFile"
        :tab-name="activeTab"
        @select="onSelectFile"
        @add="onAddFile"
        @rename="onRenameFile"
        @remove="onRemoveFile"
      />
    </el-drawer>
  </div>
</template>
