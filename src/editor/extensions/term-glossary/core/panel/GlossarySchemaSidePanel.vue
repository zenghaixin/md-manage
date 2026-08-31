<script setup>
/**
 * 右侧「通用字段」书签：跟随当前词条入口文件；标题为「武器 · 通用字段设置」。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getActiveDocPath } from '../../../../shellEvents'
import {
  glossaryEntryLabel,
  isGlossaryDefPath,
  normalizeDocPath,
} from '../shared/glossaryPaths'
import GlossarySchemaEditor from './GlossarySchemaEditor.vue'

function resolveGlossaryEntryPath(pathRel) {
  const path = normalizeDocPath(pathRel)
  if (path && isGlossaryDefPath(path) && path.endsWith('.md')) return path
  return ''
}

/** 同步初始化，避免子组件先落到默认入口文件 */
const entryPath = ref(resolveGlossaryEntryPath(getActiveDocPath()))
/** @type {ReturnType<typeof setInterval> | null} */
let activePathTimer = null

const panelTitle = computed(() => {
  const label = glossaryEntryLabel(entryPath.value)
  if (label) return `${label} · 通用字段设置`
  return '通用字段设置'
})

function syncFromActiveDoc() {
  const next = resolveGlossaryEntryPath(getActiveDocPath())
  if (next) entryPath.value = next
}

onMounted(() => {
  syncFromActiveDoc()
  activePathTimer = setInterval(syncFromActiveDoc, 400)
})

onBeforeUnmount(() => {
  if (activePathTimer != null) {
    clearInterval(activePathTimer)
    activePathTimer = null
  }
})
</script>

<template>
  <div class="glossary-schema-side-panel flex h-full min-h-0 flex-col">
    <header class="glossary-schema-side-panel__head shrink-0 px-3 pt-3 pb-2">
      <h2 class="glossary-schema-side-panel__title">
        {{ panelTitle }}
      </h2>
    </header>
    <div class="min-h-0 flex-1 overflow-hidden px-3 pb-3">
      <GlossarySchemaEditor
        :entry-path="entryPath"
        :show-entry-picker="false"
      />
    </div>
  </div>
</template>

<style scoped>
.glossary-schema-side-panel__title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--ink, #1a2830);
}
</style>
