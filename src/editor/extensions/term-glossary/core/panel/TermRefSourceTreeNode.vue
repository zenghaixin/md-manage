<script setup>
import AppIcon from '../../../../../components/AppIcon.vue'
import TermRefSourceTreeNode from './TermRefSourceTreeNode.vue'

defineProps({
  node: { type: Object, required: true },
  expanded: { type: Object, required: true },
  activePath: { type: String, default: '' },
  depth: { type: Number, default: 0 },
})

const emit = defineEmits(['toggle', 'select'])

function displayName(name) {
  return String(name || '').replace(/\.md$/i, '')
}
</script>

<template>
  <li class="ext-term-ref-tree-item">
    <template v-if="node.type === 'folder'">
      <button
        type="button"
        class="ext-term-ref-tree-folder"
        :style="{ paddingLeft: `${0.25 + depth * 0.55}rem` }"
        @click="emit('toggle', node.path)"
      >
        <AppIcon
          name="chevronRight"
          :size="12"
          class="ext-term-ref-tree-chevron"
          :class="{ 'is-open': expanded[node.path] }"
        />
        <AppIcon name="folder" :size="13" class="ext-term-ref-tree-icon" />
        <span class="ext-term-ref-tree-label">{{ node.name }}</span>
      </button>
      <ul
        v-show="expanded[node.path]"
        class="ext-term-ref-tree-list"
      >
        <TermRefSourceTreeNode
          v-for="child in node.children || []"
          :key="child.path"
          :node="child"
          :expanded="expanded"
          :active-path="activePath"
          :depth="depth + 1"
          @toggle="emit('toggle', $event)"
          @select="emit('select', $event)"
        />
      </ul>
    </template>
    <button
      v-else-if="node.name?.endsWith?.('.md')"
      type="button"
      class="ext-term-ref-tree-file"
      :class="{ 'is-active': activePath === node.path }"
      :style="{ paddingLeft: `${0.55 + depth * 0.55}rem` }"
      :title="node.path"
      @click="emit('select', node.path)"
    >
      <AppIcon name="file" :size="13" class="ext-term-ref-tree-icon" />
      <span class="ext-term-ref-tree-label">{{ displayName(node.name) }}</span>
    </button>
  </li>
</template>

<style scoped>
.ext-term-ref-tree-item {
  list-style: none;
}

.ext-term-ref-tree-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ext-term-ref-tree-folder,
.ext-term-ref-tree-file {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  width: 100%;
  margin: 0;
  padding: 0.2rem 0.35rem 0.2rem 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.6875rem;
  text-align: left;
  cursor: pointer;
}

.ext-term-ref-tree-file:hover,
.ext-term-ref-tree-folder:hover {
  background: color-mix(in srgb, var(--accent, #0d6e6e) 8%, transparent);
}

.ext-term-ref-tree-file.is-active {
  background: color-mix(in srgb, var(--accent, #0d6e6e) 16%, transparent);
  color: var(--accent, #0d6e6e);
  font-weight: 600;
}

.ext-term-ref-tree-chevron {
  flex-shrink: 0;
  color: var(--muted, #5a6b75);
  transition: transform 0.15s ease;
}

.ext-term-ref-tree-chevron.is-open {
  transform: rotate(90deg);
}

.ext-term-ref-tree-icon {
  flex-shrink: 0;
  color: var(--muted, #5a6b75);
}

.ext-term-ref-tree-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
