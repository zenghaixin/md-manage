<script setup>
/**
 * 词条新建/编辑：挂在可拖拽浮层里。
 * footer：左 = 源码/预览 + 备注；右 = 取消/确认。
 */
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from '../../../../../components/AppIcon.vue'
import DraggableFloat from '../../../../../components/DraggableFloat.vue'
import { nextFloatZIndex } from '../../../../../components/floatZIndex'
import { openTermRemarkFloat } from '../shared/openTermRemarkFloat'
import { lookupLiveTermRemarkId } from '../shared/termRemarkAccess'
import TermEditorPanel from './TermEditorPanel.vue'

const props = defineProps({
  mode: { type: String, default: 'create' },
  initialTitle: { type: String, default: '' },
  initialDescription: { type: String, default: '' },
  initialType: { type: String, default: 'basic' },
  initialAttrs: { type: Object, default: () => ({}) },
  remarkId: { type: String, default: '' },
  floatLeft: { type: Number, default: null },
  floatTop: { type: Number, default: null },
  zIndex: { type: Number, default: 10050 },
  onConfirm: { type: Function, default: null },
  onCancel: { type: Function, default: null },
  onFocus: { type: Function, default: null },
})

const floatRef = ref(null)
const panelRef = ref(null)
const ui = ref({ canSubmit: false, busy: false })
const descIsSource = ref(false)
const liveRemarkId = ref(String(props.remarkId || '').trim())

const floatTitle = computed(() =>
  props.mode === 'edit' ? '编辑词条' : '新建词条',
)

const showRemarkBtn = computed(() => props.mode !== 'create')

const sourceToggleTitle = computed(() =>
  descIsSource.value ? '切换到预览' : '切换到源码',
)

watch(
  () => props.remarkId,
  (id) => {
    const next = String(id || '').trim()
    if (next) liveRemarkId.value = next
  },
)

function onUi(next) {
  ui.value = {
    canSubmit: !!next?.canSubmit,
    busy: !!next?.busy,
  }
}

function toggleDescView() {
  panelRef.value?.toggleDescView?.()
  void nextTick(() => {
    descIsSource.value = !!panelRef.value?.isDescSource?.()
  })
}

function onOpenRemark() {
  const title = String(props.initialTitle || '').trim()
  const rect = floatRef.value?.getBoundingClientRect?.()
  void openTermRemarkFloat({
    title,
    besideRect: rect
      ? {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        }
      : null,
  }).then(() => {
    const next = lookupLiveTermRemarkId(title)
    if (next) liveRemarkId.value = next
  })
}

function flash() {
  floatRef.value?.flash?.()
}

function setZIndex(z) {
  floatRef.value?.setZIndex?.(z)
}

function bringFront() {
  const z = nextFloatZIndex()
  setZIndex(z)
  props.onFocus?.()
  flash()
  return z
}

function getBoundingClientRect() {
  return floatRef.value?.getBoundingClientRect?.() ?? null
}

defineExpose({
  flash,
  setZIndex,
  bringFront,
  getBoundingClientRect,
})
</script>

<template>
  <DraggableFloat
    ref="floatRef"
    :title="floatTitle"
    :width="380"
    :height="560"
    :left="floatLeft"
    :top="floatTop"
    :z-index="zIndex"
    :resizable="true"
    :max-height="720"
    @close="onCancel?.()"
    @focus="onFocus?.()"
  >
    <TermEditorPanel
      ref="panelRef"
      :mode="mode"
      :initial-title="initialTitle"
      :initial-description="initialDescription"
      :initial-type="initialType"
      :initial-attrs="initialAttrs"
      :show-heading="false"
      :show-actions="false"
      :show-desc-toggle="false"
      :on-confirm="onConfirm"
      :on-cancel="onCancel"
      @update:ui="onUi"
    />
    <template #footer>
      <div class="ext-term-editor-float-footer">
        <div class="ext-term-editor-float-tools">
          <button
            type="button"
            class="ext-term-popover-tool"
            :class="{ 'is-active': descIsSource }"
            :title="sourceToggleTitle"
            :aria-label="sourceToggleTitle"
            @click="toggleDescView"
          >
            <AppIcon name="source" :size="14" />
          </button>
          <button
            v-if="showRemarkBtn"
            type="button"
            class="ext-term-popover-tool"
            title="查看备注"
            aria-label="查看备注"
            @click="onOpenRemark"
          >
            <AppIcon name="remark" :size="14" />
          </button>
        </div>
        <div class="ext-term-editor-float-actions">
          <button
            type="button"
            class="ext-term-editor-btn"
            :disabled="ui.busy"
            @click="panelRef?.cancel?.()"
          >
            取消
          </button>
          <button
            type="button"
            class="ext-term-editor-btn is-primary"
            :disabled="!ui.canSubmit"
            @click="panelRef?.confirm?.()"
          >
            确认
          </button>
        </div>
      </div>
    </template>
  </DraggableFloat>
</template>

<style scoped>
.ext-term-editor-float-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
}

.ext-term-editor-float-tools {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.ext-term-popover-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--muted, #6b7c88);
  cursor: pointer;
}

.ext-term-popover-tool:hover,
.ext-term-popover-tool.is-active {
  border-color: var(--border, #c5d0d8);
  color: var(--ink, #1a2830);
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.ext-term-editor-float-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.ext-term-editor-btn {
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.ext-term-editor-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ext-term-editor-btn.is-primary {
  border-color: color-mix(in srgb, var(--accent, #0d6e6e) 55%, var(--border, #c5d0d8));
  background: color-mix(in srgb, var(--accent, #0d6e6e) 16%, transparent);
  color: var(--accent, #0d6e6e);
  font-weight: 600;
}
</style>
