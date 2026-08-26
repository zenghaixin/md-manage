<script setup>
/**
 * 词条定义块：只读展示；选中后右上角备注 / 编辑 / 删除。
 * 描述里的词条引用可点开预览弹窗。
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { NodeSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import AppIcon from '../../../../../components/AppIcon.vue'
import { applyRemarkToSelection } from '../../../remark/apply'
import { openRemarkById } from '../../../remark/bridge'
import {
  TERM_REF_CANDIDATE_CLASS,
  TERM_REF_CLASS,
  TERM_REF_INVALID_CLASS,
} from '../shared/constants'
import { FLASH_MS, registerTermFlashHandle } from '../shared/flashTerm'
import { offerCreateMissingTerm } from '../dialog/createMissingTerm'
import { openTermPreview } from '../dialog/openPreview'
import { tryHandleTermDashClick } from '../plugins/clickPlugin'
import { openTermEditorEdit } from '../panel/termEditorPanel'
import { confirmDeleteTermDefinition } from './termOps'
import { sanitizeTermTitle } from './syntax'

const props = defineProps(nodeViewProps)

let stopFlashRegister = null
let flashAnim = null

const titleText = computed(
  () =>
    sanitizeTermTitle(props.node.attrs.title) ||
    String(props.node.attrs.title ?? '').trim() ||
    '（未命名）',
)

const hasRemark = computed(
  () => !!String(props.node.attrs.remarkId ?? '').trim(),
)

function termRootEl() {
  const pos = props.getPos()
  if (typeof pos !== 'number') return null
  return props.editor.view.nodeDOM(pos)
}

function selectWholeTerm(event) {
  if (event.target?.closest?.('.ext-term-actions')) return
  // 描述里的灰线候选 / 曾用名：弹出确认，不选中整块
  if (tryHandleTermDashClick(props.editor.view, event)) return
  const ref = event.target?.closest?.(`.${TERM_REF_CLASS}`)
  if (ref && !ref.classList.contains(TERM_REF_CANDIDATE_CLASS)) {
    event.preventDefault()
    event.stopPropagation()
    const nested = (
      ref.getAttribute('data-term-title') ||
      ref.querySelector('.ext-term-ref-text')?.textContent ||
      ref.textContent ||
      ''
    ).trim()
    if (!nested) return
    if (
      ref.classList.contains(TERM_REF_INVALID_CLASS) ||
      ref.classList.contains('ext-term-ref-invalid')
    ) {
      void offerCreateMissingTerm(nested, props.editor.view)
      return
    }
    openTermPreview(nested, ref)
    return
  }
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
  const el = termRootEl()
  const r = el?.getBoundingClientRect?.()
  openTermEditorEdit({
    editor: props.editor,
    nodePos: pos,
    besideRect: r
      ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      : null,
  })
}

function onDelete(event) {
  event.preventDefault()
  event.stopPropagation()
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  void confirmDeleteTermDefinition(props.editor, pos)
}

function onRemark(event) {
  event.preventDefault()
  event.stopPropagation()
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  const view = props.editor.view
  const node = view.state.doc.nodeAt(pos)
  if (!node) return
  let remarkId = String(node.attrs.remarkId || '').trim()
  if (!remarkId) {
    remarkId = String(
      applyRemarkToSelection(view, {
        from: pos,
        to: pos + node.nodeSize,
      }) || '',
    ).trim()
  }
  if (!remarkId) return
  openRemarkById(remarkId, { ui: 'panel', label: titleText.value })
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
        :class="{ 'is-active': hasRemark }"
        title="备注"
        aria-label="备注"
        @click="onRemark"
      >
        <AppIcon name="remark" :size="14" />
      </button>
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
      <div class="ext-term-title">{{ titleText }}</div>
    </div>

    <NodeViewContent
      class="ext-term-desc"
      as="div"
      contenteditable="false"
    />
  </NodeViewWrapper>
</template>
