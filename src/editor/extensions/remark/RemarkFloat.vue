<script setup>
/**
 * 单条备注浮层：查看/编辑描述。
 * 可落当前打开文件，或跨页写回定义所在 sourcePath。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DraggableFloat from '../../../components/DraggableFloat.vue'
import { nextFloatZIndex } from '../../../components/floatZIndex'
import { requestSaveCurrentFile } from '../../shellEvents'
import { saveRemarkDescriptionToPath } from './remotePersist'
import {
  getRemarkDescription,
  onRemarkDescriptionsChange,
  setRemarkDescription,
} from './storage'

const props = defineProps({
  remarkId: { type: String, required: true },
  label: { type: String, default: '' },
  floatLeft: { type: Number, default: null },
  floatTop: { type: Number, default: null },
  zIndex: { type: Number, default: 10050 },
  /** 跨页：备注描述写回该文件；空则写当前打开文件 */
  sourcePath: { type: String, default: '' },
  /** 打开时的初始描述（跨页时优先于当前内存表） */
  initialDescription: { type: String, default: null },
  onClose: { type: Function, default: null },
  onFocus: { type: Function, default: null },
})

const floatRef = ref(null)
const draft = ref(
  props.initialDescription != null
    ? String(props.initialDescription)
    : getRemarkDescription(props.remarkId),
)
const busy = ref(false)
let persistTimer = null
let stopDesc = null

const floatTitle = computed(() => {
  const label = String(props.label || '').trim()
  return label ? `备注 · ${label}` : '备注'
})

const remotePath = computed(() => String(props.sourcePath || '').trim())

function syncDraftFromStore() {
  if (remotePath.value && props.initialDescription != null) {
    // 跨页：以本地 draft / 传入初值为准，不跟当前文件内存表抢
    return
  }
  draft.value = getRemarkDescription(props.remarkId)
}

watch(
  () => props.remarkId,
  () => {
    if (props.initialDescription != null) {
      draft.value = String(props.initialDescription)
    } else {
      draft.value = getRemarkDescription(props.remarkId)
    }
  },
)

async function persistNow() {
  const id = String(props.remarkId || '').trim()
  if (!id) return
  const text = draft.value
  if (remotePath.value) {
    await saveRemarkDescriptionToPath(remotePath.value, id, text)
    return
  }
  setRemarkDescription(id, text)
  await requestSaveCurrentFile()
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    void persistNow().catch((err) => {
      console.warn('[remark-float] persist failed:', err)
    })
  }, 500)
}

function onInput(e) {
  draft.value = e.target?.value ?? ''
  schedulePersist()
}

function close() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  void persistNow().catch(() => {})
  props.onClose?.()
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

function setPosition(left, top) {
  floatRef.value?.setPosition?.(left, top)
}

function getBoundingClientRect() {
  return floatRef.value?.getBoundingClientRect?.() ?? null
}

onMounted(() => {
  if (!remotePath.value) {
    syncDraftFromStore()
    stopDesc = onRemarkDescriptionsChange(syncDraftFromStore)
  }
})

onBeforeUnmount(() => {
  stopDesc?.()
  stopDesc = null
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
    void persistNow().catch(() => {})
  }
})

defineExpose({
  flash,
  setZIndex,
  bringFront,
  setPosition,
  getBoundingClientRect,
  syncDraftFromStore,
})
</script>

<template>
  <DraggableFloat
    ref="floatRef"
    :title="floatTitle"
    :width="360"
    :height="320"
    :left="floatLeft"
    :top="floatTop"
    :z-index="zIndex"
    :resizable="true"
    :max-height="560"
    :min-height="180"
    @close="close"
    @focus="onFocus?.()"
  >
    <div class="remark-float-body">
      <textarea
        class="remark-float-input"
        :value="draft"
        :disabled="busy"
        placeholder="添加备注描述…"
        spellcheck="false"
        @input="onInput"
      />
    </div>
  </DraggableFloat>
</template>

<style scoped>
.remark-float-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0.55rem 0.65rem;
  box-sizing: border-box;
}

.remark-float-input {
  flex: 1 1 auto;
  min-height: 140px;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: var(--surface, #f4f7f9);
  color: var(--ink, #1a2830);
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1.5;
  resize: none;
}
</style>
