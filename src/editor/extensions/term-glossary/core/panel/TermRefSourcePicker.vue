<script setup>
import { computed, ref } from 'vue'
import AppIcon from '../../../../../components/AppIcon.vue'
import TermRefSourceTreePanel from './TermRefSourceTreePanel.vue'
import { glossaryEntryLabel } from '../shared/glossaryPaths'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const POPOVER_WIDTH = 280
/** 只允许在按钮下方翻转对齐，禁止翻到左侧/右侧 */
const BOTTOM_FALLBACKS = ['bottom-start', 'bottom-end', 'bottom']

const open = ref(false)
const buttonRef = ref(null)
const placement = ref('bottom-end')
const popperOptions = ref({})

const buttonLabel = computed(() => {
  const path = String(props.modelValue || '').trim()
  if (!path) return '选择文件'
  return glossaryEntryLabel(path) || path.split('/').pop()?.replace(/\.md$/i, '') || path
})

function resolveBoundary(buttonEl) {
  if (!buttonEl) return null
  return (
    buttonEl.closest('.ext-term-editor-panel') ||
    buttonEl.closest('.ext-term-ref-slot-row') ||
    buttonEl.parentElement
  )
}

/**
 * 在容器内估算水平方向能否放下弹窗：
 * - bottom-end：弹窗右缘对齐按钮右缘，向左展开
 * - bottom-start：弹窗左缘对齐按钮左缘，向右展开
 */
function resolvePlacement(buttonEl) {
  const boundary = resolveBoundary(buttonEl)
  if (!buttonEl || !boundary) return 'bottom-end'

  const btn = buttonEl.getBoundingClientRect()
  const box = boundary.getBoundingClientRect()
  const pad = 8

  const roomForEnd = btn.right - box.left - pad
  const roomForStart = box.right - btn.left - pad

  if (roomForEnd >= POPOVER_WIDTH) return 'bottom-end'
  if (roomForStart >= POPOVER_WIDTH) return 'bottom-start'
  return roomForEnd >= roomForStart ? 'bottom-end' : 'bottom-start'
}

function buildPopperOptions(buttonEl) {
  const boundary = resolveBoundary(buttonEl)
  const modifiers = [
    {
      name: 'flip',
      options: {
        fallbackPlacements: BOTTOM_FALLBACKS,
        allowedAutoPlacements: BOTTOM_FALLBACKS,
      },
    },
  ]
  if (boundary) {
    modifiers.push({
      name: 'preventOverflow',
      options: {
        boundary,
        padding: 8,
        altAxis: true,
      },
    })
  }
  return { modifiers }
}

function preparePlacement() {
  const el = buttonRef.value
  placement.value = resolvePlacement(el)
  popperOptions.value = buildPopperOptions(el)
}

function toggleOpen() {
  if (!open.value) preparePlacement()
  open.value = !open.value
}

function onSelect(path) {
  const next = String(path || '').trim()
  if (!next) return
  emit('update:modelValue', next)
  open.value = false
}
</script>

<template>
  <el-popover
    v-model:visible="open"
    :placement="placement"
    :fallback-placements="BOTTOM_FALLBACKS"
    :popper-options="popperOptions"
    :width="POPOVER_WIDTH"
    trigger="manual"
    :teleported="true"
    popper-class="ext-term-ref-source-popover"
  >
    <template #reference>
      <button
        ref="buttonRef"
        type="button"
        class="ext-term-ref-source-btn"
        :title="modelValue || '选择词条来源文件'"
        @click="toggleOpen"
      >
        <AppIcon name="file" :size="13" class="ext-term-ref-source-btn__icon" />
        <span class="ext-term-ref-source-btn__label">{{ buttonLabel }}</span>
        <AppIcon
          name="chevronRight"
          :size="12"
          class="ext-term-ref-source-btn__chevron"
          :class="{ 'is-open': open }"
        />
      </button>
    </template>
    <TermRefSourceTreePanel
      :nodes="nodes"
      :model-value="modelValue"
      @select="onSelect"
    />
  </el-popover>
</template>

<style scoped>
.ext-term-ref-source-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  width: 5.5rem;
  min-width: 5.5rem;
  max-width: 5.5rem;
  box-sizing: border-box;
  margin: 0;
  padding: 0.35rem 0.4rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: var(--surface, #f4f7f9);
  color: inherit;
  font: inherit;
  font-size: 0.6875rem;
  cursor: pointer;
}

.ext-term-ref-source-btn:hover {
  border-color: color-mix(in srgb, var(--accent, #0d6e6e) 45%, var(--border, #c5d0d8));
}

.ext-term-ref-source-btn__icon {
  flex-shrink: 0;
  color: var(--muted, #5a6b75);
}

.ext-term-ref-source-btn__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ext-term-ref-source-btn__chevron {
  flex-shrink: 0;
  color: var(--muted, #5a6b75);
  transform: rotate(90deg);
  transition: transform 0.15s ease;
}

.ext-term-ref-source-btn__chevron.is-open {
  transform: rotate(-90deg);
}
</style>

<style>
.ext-term-ref-source-popover {
  z-index: 20050 !important;
}
</style>
