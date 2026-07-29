<script setup>
/**
 * 词条定义块：只读展示；选中后右上角编辑 / 删除。
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { NodeSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import AppIcon from '../../../../components/AppIcon.vue'
import { FLASH_MS, registerTermFlashHandle } from './flashTerm'
import { openTermEditorEdit } from './termEditorPanel'
import { confirmDeleteTermDefinition } from './termOps'
import { sanitizeTermTitle } from './syntax'
import { normalizeTermType, termTypeLabel } from './termTypes'
import { useGlossaryStore } from '../../../../stores/glossary'

const props = defineProps(nodeViewProps)

let stopFlashRegister = null
let flashAnim = null

const titleText = computed(
  () =>
    sanitizeTermTitle(props.node.attrs.title) ||
    String(props.node.attrs.title ?? '').trim() ||
    '（未命名）',
)

const termTypeId = computed(() => normalizeTermType(props.node.attrs.termType))
const termTypeText = computed(() => termTypeLabel(termTypeId.value))
const showTypeBadge = computed(() => termTypeId.value !== 'basic')

function termRootEl() {
  const pos = props.getPos()
  if (typeof pos !== 'number') return null
  return props.editor.view.nodeDOM(pos)
}

function selectWholeTerm(event) {
  if (event.target?.closest?.('.ext-term-actions')) return
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  event.preventDefault()
  event.stopPropagation()
  props.editor.chain().focus().setNodeSelection(pos).run()
}

function onEdit(event) {
  event.preventDefault()
  event.stopPropagation()
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  props.editor.chain().focus().setNodeSelection(pos).run()
  openTermEditorEdit({ editor: props.editor, nodePos: pos })
}

function onDelete(event) {
  event.preventDefault()
  event.stopPropagation()
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  void confirmDeleteTermDefinition(props.editor, pos)
}

function resolveFlashEl() {
  return termRootEl()
}

function triggerFlash() {
  const pos = props.getPos()
  if (typeof pos === 'number') {
    const sel = props.editor.state.selection
    const already = sel instanceof NodeSelection && sel.from === pos
    if (!already) {
      props.editor.chain().focus().setNodeSelection(pos).scrollIntoView().run()
    } else {
      props.editor.commands.scrollIntoView()
    }
  }

  const el = resolveFlashEl()
  if (!el || typeof el.animate !== 'function') return
  try {
    flashAnim?.cancel?.()
  } catch {
    // ignore
  }
  flashAnim = el.animate(
    [
      {
        backgroundColor: 'transparent',
        outline: '2px solid transparent',
        outlineOffset: '2px',
      },
      {
        backgroundColor: 'rgba(245, 158, 11, 0.28)',
        outline: '2px solid #f59e0b',
        outlineOffset: '2px',
      },
      {
        backgroundColor: 'rgba(59, 130, 246, 0.26)',
        outline: '2px solid #3b82f6',
        outlineOffset: '2px',
      },
      {
        backgroundColor: 'transparent',
        outline: '2px solid transparent',
        outlineOffset: '2px',
      },
    ],
    { duration: FLASH_MS, easing: 'ease' },
  )
}

onMounted(() => {
  const title = sanitizeTermTitle(props.node.attrs.title)
  if (title) {
    const stored = useGlossaryStore().getTerm(title)
    if (stored) {
      const nextType = normalizeTermType(stored.type)
      if (normalizeTermType(props.node.attrs.termType) !== nextType) {
        props.updateAttributes({ termType: nextType })
      }
    }
  }
  stopFlashRegister = registerTermFlashHandle({
    getTitle: () => String(props.node.attrs.title ?? ''),
    flash: triggerFlash,
  })
})

onUnmounted(() => {
  stopFlashRegister?.()
  stopFlashRegister = null
  try {
    flashAnim?.cancel?.()
  } catch {
    // ignore
  }
  flashAnim = null
})
</script>

<template>
  <NodeViewWrapper
    class="ext-term-node"
    :class="{ 'is-selected': selected }"
    as="div"
    data-type="term-glossary"
    :data-term-title="node.attrs.title"
    :data-term-type="termTypeId"
    @click="selectWholeTerm"
  >
    <div
      v-show="selected"
      class="ext-term-actions"
      contenteditable="false"
    >
      <button
        type="button"
        class="ext-term-action-btn"
        title="编辑"
        aria-label="编辑"
        @click="onEdit"
      >
        <AppIcon name="edit" :size="14" />
      </button>
      <button
        type="button"
        class="ext-term-action-btn is-danger"
        title="删除"
        aria-label="删除"
        @click="onDelete"
      >
        <AppIcon name="trash" :size="14" />
      </button>
    </div>

    <div class="ext-term-title-row">
      <span
        v-if="showTypeBadge"
        class="ext-term-type-badge"
        :title="`类型：${termTypeText}`"
      >{{ termTypeText }}</span>
      <div class="ext-term-title">{{ titleText }}</div>
    </div>

    <NodeViewContent
      class="ext-term-desc"
      as="div"
      contenteditable="false"
    />
  </NodeViewWrapper>
</template>
