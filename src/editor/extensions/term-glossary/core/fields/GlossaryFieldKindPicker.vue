<script setup>
/**
 * 字段类型选择：挂在新增按钮上方的弹出层，展示三种控件预览，点击加入。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TERM_FIELD_KIND_OPTIONS } from './kinds'
import TermFieldMarkdown from './TermFieldMarkdown.vue'
import TermFieldTermRef from './TermFieldTermRef.vue'
import TermFieldText from './TermFieldText.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 词条目录树，供词条引用预览 */
  nodes: { type: Array, default: () => [] },
  /** 触发按钮是否禁用 */
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'select'])

const triggerRef = ref(null)
/** 与触发按钮同宽（px） */
const popperWidth = ref(0)

let resizeObs = null

function syncWidth() {
  const el = triggerRef.value
  if (!el) return
  const w = Math.round(el.getBoundingClientRect().width)
  if (w > 0) popperWidth.value = w
}

const popperStyle = computed(() => {
  const w = popperWidth.value
  if (!w) return { padding: '0.25rem 0' }
  return {
    width: `${w}px`,
    minWidth: `${w}px`,
    maxWidth: `${w}px`,
    padding: '0.25rem 0',
    boxSizing: 'border-box',
  }
})

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    syncWidth()
    void nextTick(() => {
      syncWidth()
      requestAnimationFrame(syncWidth)
    })
  },
)

onMounted(() => {
  syncWidth()
  if (typeof ResizeObserver !== 'undefined' && triggerRef.value) {
    resizeObs = new ResizeObserver(() => syncWidth())
    resizeObs.observe(triggerRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObs?.disconnect()
  resizeObs = null
})

function onPick(kind) {
  emit('select', kind)
  emit('update:modelValue', false)
}
</script>

<template>
  <el-popover
    :visible="modelValue"
    placement="top"
    :width="popperWidth || undefined"
    :popper-style="popperStyle"
    trigger="manual"
    :teleported="true"
    popper-class="glossary-field-kind-popper"
    @update:visible="emit('update:modelValue', $event)"
  >
    <template #reference>
      <div
        ref="triggerRef"
        class="glossary-field-kind-picker__trigger"
      >
        <slot />
      </div>
    </template>
    <div class="glossary-field-kind-picker__list">
      <button
        v-for="opt in TERM_FIELD_KIND_OPTIONS"
        :key="opt.id"
        type="button"
        class="glossary-field-kind-picker__card"
        @click="onPick(opt.id)"
      >
        <div class="glossary-field-kind-picker__card-head">
          <span class="glossary-field-kind-picker__card-title">{{ opt.label }}</span>
          <span class="glossary-field-kind-picker__card-desc">{{ opt.desc }}</span>
        </div>
        <div class="glossary-field-kind-picker__preview">
          <TermFieldText
            v-if="opt.id === 'text'"
            model-value=""
            placeholder="普通文本"
            disabled
          />
          <TermFieldMarkdown
            v-else-if="opt.id === 'markdown'"
            model-value=""
            placeholder="添加备注…"
            :min-height="72"
            disabled
          />
          <TermFieldTermRef
            v-else
            :model-value="[]"
            source-path=""
            :nodes="nodes"
            placeholder="选择词条"
            disabled
            :show-source-picker="true"
          />
        </div>
      </button>
    </div>
  </el-popover>
</template>

<style scoped>
.glossary-field-kind-picker__trigger {
  display: block;
  width: 100%;
}

.glossary-field-kind-picker__list {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  width: 100%;
  box-sizing: border-box;
  max-height: min(70vh, 28rem);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.glossary-field-kind-picker__card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 0.5rem 0.65rem;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}

.glossary-field-kind-picker__card:hover {
  background: var(--surface-hover, #243038);
}

.glossary-field-kind-picker__card-head {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.glossary-field-kind-picker__card-title {
  font-size: 0.8125rem;
  font-weight: 650;
  color: var(--ink, #1a2830);
}

.glossary-field-kind-picker__card-desc {
  font-size: 0.6875rem;
  color: var(--muted, #5a6b75);
}

.glossary-field-kind-picker__preview {
  pointer-events: none;
  width: 100%;
  min-width: 0;
}

.glossary-field-kind-picker__preview :deep(.term-field-text),
.glossary-field-kind-picker__preview :deep(.term-field-markdown),
.glossary-field-kind-picker__preview :deep(.term-field-term-ref),
.glossary-field-kind-picker__preview :deep(.markdown-field) {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
</style>

<style>
.glossary-field-kind-popper.el-popper,
.glossary-field-kind-popper {
  z-index: 20100 !important;
  box-sizing: border-box !important;
  padding: 0.25rem 0 !important;
}

.glossary-field-kind-popper .el-popover__title {
  display: none;
}
</style>
