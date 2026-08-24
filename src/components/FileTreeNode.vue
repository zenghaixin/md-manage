<script setup>
import AppIcon from './AppIcon.vue'
import FileTreeNode from './FileTreeNode.vue'

const props = defineProps({
  node: { type: Object, required: true },
  index: { type: Number, required: true },
  parentPath: { type: String, default: '' },
  api: { type: Object, required: true },
})

function hintClass() {
  const h = props.api.dropHint
  if (!h || h.mode === 'into') return ''
  if (h.parentPath !== props.parentPath) return ''
  if (h.index === props.index && h.mode === 'before') return 'drop-before'
  if (h.index === props.index + 1 && h.mode === 'after') return 'drop-after'
  return ''
}

function intoClass() {
  const h = props.api.dropHint
  if (props.node.type === 'folder' && h?.mode === 'into' && h.parentPath === props.node.path) {
    return 'drop-into'
  }
  return ''
}
</script>

<template>
  <div class="mb-0.5">
    <!-- 文件夹 -->
    <template v-if="node.type === 'folder'">
      <div
        class="group relative flex min-h-9 w-full items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors"
        :class="[
          hintClass(),
          intoClass(),
          node.system
            ? 'font-medium text-accent hover:bg-accent-soft/60'
            : 'text-ink hover:bg-surface-hover',
        ]"
        :draggable="!node.system"
        @dragstart="!node.system && api.onDragStart($event, node)"
        @dragend="api.onDragEnd"
        @dragover="api.onDragOverRow($event, { parentPath, index, node, intoFolder: !api.expanded[node.path] })"
        @drop="api.onDropRow"
      >
        <template v-if="api.renamingKey === node.path && !node.system">
          <AppIcon name="folder" :size="16" class="text-accent" />
          <div
            class="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-accent bg-accent-soft py-0.5 pl-1.5 pr-1.5"
            @mousedown.stop
          >
            <input
              :ref="api.setRenameInput"
              :value="api.renameDraft"
              class="min-w-0 flex-1 border-none bg-transparent text-base text-ink outline-none md:text-sm"
              spellcheck="false"
              @input="api.renameDraft = $event.target.value"
              @keydown="api.onRenameKeydown($event, node)"
              @blur="api.commitRename(node)"
            >
          </div>
        </template>
        <template v-else>
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border-0 bg-transparent p-0 text-left text-inherit outline-none"
            @click="api.toggleFolder(node.path)"
            @dragover="api.onDragOverRow($event, { parentPath, index, node, intoFolder: true })"
            @drop="api.onDropRow"
          >
            <AppIcon
              name="chevronRight"
              :size="14"
              class="text-muted transition-transform"
              :class="api.expanded[node.path] ? 'rotate-90' : ''"
            />
            <AppIcon
              :name="api.expanded[node.path] ? 'folderOpen' : 'folder'"
              :size="16"
              class="text-accent"
            />
            <span class="min-w-0 flex-1 truncate font-medium select-none">{{ node.name }}</span>
            <span
              v-if="node.system"
              class="shrink-0 rounded px-1 text-[10px] font-normal text-accent/80"
            >系统</span>
          </button>
          <AppIcon
            v-if="!node.system"
            name="edit"
            :size="14"
            class="w-5 shrink-0 cursor-pointer text-muted opacity-70 transition-opacity md:w-4 md:opacity-0 md:group-hover:opacity-70 hover:!text-accent hover:!opacity-100"
            title="重命名文件夹"
            @click.stop="api.startRename(node.path, node.name)"
          />
          <AppIcon
            name="folderPlus"
            :size="14"
            class="w-5 shrink-0 cursor-pointer text-muted opacity-70 transition-opacity md:w-4 md:opacity-0 md:group-hover:opacity-70 hover:!text-accent hover:!opacity-100"
            title="新建子文件夹"
            @click.stop="api.emitAddFolder(node.path)"
          />
          <AppIcon
            name="filePlus"
            :size="14"
            class="w-5 shrink-0 cursor-pointer text-muted opacity-70 transition-opacity md:w-4 md:opacity-0 md:group-hover:opacity-70 hover:!text-accent hover:!opacity-100"
            title="新建文件"
            @click.stop="api.emitAddFile(node.path)"
          />
          <AppIcon
            v-if="!node.system"
            name="close"
            :size="14"
            class="w-5 shrink-0 cursor-pointer text-muted opacity-70 transition-opacity md:w-4 md:opacity-0 md:group-hover:opacity-60 hover:!text-danger hover:!opacity-100"
            title="删除文件夹"
            @click.stop="api.emitRemoveFolder(node.path)"
          />
        </template>
      </div>

      <ul
        v-if="api.expanded[node.path]"
        class="m-0 ml-[1.125rem] list-none border-l border-border pl-3"
        @dragover.prevent="api.onDragOverRow($event, { parentPath: node.path, index: (node.children || []).length })"
        @drop="api.onDropRow"
      >
        <li v-for="(child, i) in node.children || []" :key="child.path">
          <FileTreeNode
            :node="child"
            :index="i"
            :parent-path="node.path"
            :api="api"
          />
        </li>
      </ul>
    </template>

    <!-- 文件 -->
    <template v-else>
      <div
        v-if="api.renamingKey === node.path"
        class="flex items-center gap-1 rounded-md border border-accent bg-accent-soft py-1 pl-2 pr-2"
      >
        <input
          :ref="api.setRenameInput"
          :value="api.renameDraft"
          class="min-w-0 flex-1 border-none bg-transparent text-base text-ink outline-none md:text-sm"
          spellcheck="false"
          @input="api.renameDraft = $event.target.value"
          @keydown="api.onRenameKeydown($event, node)"
          @blur="api.commitRename(node)"
        >
        <span class="text-xs text-accent/70">.md</span>
      </div>
      <div
        v-else
        class="group/file relative flex min-h-8 w-full cursor-pointer items-center gap-1.5 rounded-md py-1.5 pl-2 pr-2 text-left text-sm transition-colors md:py-1"
        :class="[
          node.path === api.activePath()
            ? 'bg-accent-soft font-medium text-accent'
            : 'text-ink hover:bg-surface-hover',
          hintClass(),
        ]"
        draggable="true"
        title="双击或长按重命名"
        @click="($event) => ($event.detail > 1 ? null : api.emitSelect(node.path))"
        @dblclick.prevent="api.startRename(node.path, api.displayName(node.name))"
        @dragstart="api.onDragStart($event, node)"
        @dragend="api.onDragEnd"
        @dragover.prevent="api.onDragOverRow($event, { parentPath, index })"
        @drop="api.onDropRow"
        @touchstart.passive="api.onTouchStart(node)"
        @touchend="api.onTouchEnd"
        @touchmove="api.onTouchEnd"
        @touchcancel="api.onTouchEnd"
      >
        <AppIcon name="file" :size="14" class="opacity-70" />
        <span class="min-w-0 flex-1 truncate select-none">{{ api.displayName(node.name) }}</span>
        <span
          class="text-xs select-none"
          :class="node.path === api.activePath() ? 'text-accent/70' : 'text-muted'"
        >.md</span>
        <AppIcon
          name="close"
          :size="14"
          class="w-5 shrink-0 text-muted opacity-70 transition-opacity md:w-4 md:opacity-0 md:group-hover/file:opacity-60 hover:!text-danger hover:!opacity-100"
          title="删除文件"
          @click.stop="api.emitRemoveFile(node.path)"
        />
      </div>
    </template>
  </div>
</template>
