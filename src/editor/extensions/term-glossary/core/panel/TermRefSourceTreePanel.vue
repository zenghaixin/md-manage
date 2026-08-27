<script setup>
import { reactive, watch } from 'vue'
import TermRefSourceTreeNode from './TermRefSourceTreeNode.vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
})

const emit = defineEmits(['select'])

const expanded = reactive({})

watch(
  () => props.modelValue,
  (path) => {
    if (!path) return
    const parts = String(path).split('/')
    let acc = '词条'
    expanded['词条'] = true
    for (let i = 1; i < parts.length - 1; i += 1) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i]
      expanded[acc] = true
    }
  },
  { immediate: true },
)

function toggleFolder(path) {
  expanded[path] = !expanded[path]
}

function onSelect(path) {
  emit('select', path)
}
</script>

<template>
  <div class="ext-term-ref-tree-panel">
    <ul class="ext-term-ref-tree-list">
      <TermRefSourceTreeNode
        v-for="node in nodes"
        :key="node.path"
        :node="node"
        :expanded="expanded"
        :active-path="modelValue"
        @toggle="toggleFolder"
        @select="onSelect"
      />
    </ul>
    <p
      v-if="!nodes.length"
      class="ext-term-ref-tree-empty"
    >
      暂无词条文件
    </p>
  </div>
</template>

<style scoped>
.ext-term-ref-tree-panel {
  max-height: 16rem;
  overflow: auto;
}

.ext-term-ref-tree-list {
  list-style: none;
  margin: 0;
  padding: 0.15rem 0;
}

.ext-term-ref-tree-empty {
  margin: 0;
  padding: 0.5rem;
  font-size: 0.75rem;
  color: var(--muted, #5a6b75);
}
</style>
