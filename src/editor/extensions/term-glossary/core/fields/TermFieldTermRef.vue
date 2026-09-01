<script setup>
/**
 * 词条引用字段：左侧多选下拉 + 右侧数据源文件选择（弹层树）。
 * 选项随 sourcePath 自动加载。
 */
import { ref, watch } from 'vue'
import { useGlossaryStore } from '../../../../../stores/glossary'
import { normalizeDocPath } from '../shared/glossaryPaths'
import { fetchTermTitlesForSource } from '../shared/termRefSlots'
import TermRefSourcePicker from '../panel/TermRefSourcePicker.vue'

const props = defineProps({
  /** 已选词条标题列表 */
  modelValue: { type: Array, default: () => [] },
  /** 数据源入口文件 path */
  sourcePath: { type: String, default: '' },
  /** 词条目录树（供右侧弹层） */
  nodes: { type: Array, default: () => [] },
  /** 左侧短标签（如引用槽名称） */
  label: { type: String, default: '' },
  labelDeleted: { type: Boolean, default: false },
  placeholder: { type: String, default: '选择词条' },
  disabled: { type: Boolean, default: false },
  /** 是否显示右侧数据源选择 */
  showSourcePicker: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'update:sourcePath'])

const store = useGlossaryStore()
const options = ref([])
const loading = ref(false)

async function reloadOptions(pathRel) {
  const path = normalizeDocPath(pathRel)
  if (!path) {
    options.value = []
    return
  }
  loading.value = true
  try {
    options.value = await fetchTermTitlesForSource(path, store.terms)
  } catch (err) {
    console.warn('[term-field-term-ref] load options failed:', err)
    options.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => props.sourcePath,
  (path) => {
    void reloadOptions(path)
  },
  { immediate: true },
)

function onValues(next) {
  const list = Array.isArray(next)
    ? next.map((s) => String(s ?? '').trim()).filter(Boolean)
    : []
  emit('update:modelValue', list)
}

function onSource(path) {
  emit('update:sourcePath', normalizeDocPath(path))
}
</script>

<template>
  <div
    class="term-field-term-ref"
    :class="{
      'has-label': !!label,
      'has-picker': showSourcePicker,
    }"
  >
    <span
      v-if="label"
      class="term-field-term-ref__label"
      :class="{ 'is-deleted': labelDeleted }"
    >{{ label }}</span>
    <el-select
      :model-value="modelValue"
      class="term-field-term-ref__select"
      multiple
      collapse-tags
      collapse-tags-tooltip
      filterable
      clearable
      teleported
      popper-class="ext-term-ref-select-popper"
      :disabled="disabled"
      :loading="loading"
      :placeholder="disabled ? placeholder : loading ? '加载中…' : placeholder"
      @update:model-value="onValues"
    >
      <el-option
        v-for="opt in options"
        :key="opt"
        :label="opt"
        :value="opt"
      />
    </el-select>
    <TermRefSourcePicker
      v-if="showSourcePicker"
      :model-value="sourcePath"
      :nodes="nodes"
      @update:model-value="onSource"
    />
  </div>
</template>

<style scoped>
.term-field-term-ref {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
  gap: 0.35rem 0.45rem;
  width: 100%;
  min-width: 0;
}

.term-field-term-ref.has-picker {
  grid-template-columns: minmax(0, 1fr) 7.25rem;
}

.term-field-term-ref.has-label {
  grid-template-columns: auto minmax(0, 1fr);
}

.term-field-term-ref.has-label.has-picker {
  grid-template-columns: auto minmax(0, 1fr) 7.25rem;
}

.term-field-term-ref.has-picker :deep(.ext-term-ref-source-picker),
.term-field-term-ref.has-picker :deep(.ext-term-ref-source-picker .el-tooltip__trigger) {
  width: 7.25rem;
  min-width: 7.25rem;
  max-width: 7.25rem;
  height: 100%;
  box-sizing: border-box;
}

.term-field-term-ref.has-picker :deep(.ext-term-ref-source-btn) {
  height: 100%;
}

.term-field-term-ref__label {
  font-size: 0.75rem;
  color: var(--muted, #5a6b75);
  padding-top: 0.35rem;
  align-self: start;
}

.term-field-term-ref__label.is-deleted {
  color: #c45656;
}

.term-field-term-ref__select {
  width: 100%;
  min-width: 0;
}
</style>
