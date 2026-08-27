<script setup>
/**
 * 词条定义块：只读展示；选中后右上角备注 / 编辑 / 删除。
 * 描述区与预览弹窗共用 renderDescriptionHtml（非 TipTap 子文档渲染）。
 */
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { NodeSelection } from '@tiptap/pm/state'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import AppIcon from '../../../../../components/AppIcon.vue'
import { getKeyPicker } from '../../../../../components/key-picker'
import { useGlossaryStore } from '../../../../../stores/glossary'
import { applyRemarkToSelection } from '../../../remark/apply'
import { openRemarkById } from '../../../remark/bridge'
import { requestSaveCurrentFile } from '../../../../shellEvents'
import {
  TERM_REF_CANDIDATE_CLASS,
  TERM_REF_CLASS,
  TERM_REF_INVALID_CLASS,
} from '../shared/constants'
import { FLASH_MS, registerTermFlashHandle } from '../shared/flashTerm'
import { collectGlossary } from '../match/match'
import { offerCreateMissingTerm } from '../dialog/createMissingTerm'
import { renderDescriptionHtml } from '../dialog/dialogHtml'
import { openTermPreview } from '../dialog/openPreview'
import { openTermEditorEdit } from '../panel/termEditorPanel'
import { confirmDeleteTermDefinition, replaceTermDefinition } from './termOps'
import { serializeTermDescriptionFromNode } from './serializeDesc'
import { confirmTitleInMarkdown, sanitizeTermTitle } from './syntax'
import { ensureTermGlossaryStyles } from '../shared/styles'

/** 定义块内候选气泡来源（卸载时仅关此来源） */
const TERM_NODE_PICKER_SOURCE = 'term-node-view'

const props = defineProps(nodeViewProps)

let stopFlashRegister = null
let flashAnim = null
let stopStoreWatch = null

const descHost = ref(null)

const titleText = computed(
  () =>
    sanitizeTermTitle(props.node.attrs.title) ||
    String(props.node.attrs.title ?? '').trim() ||
    '（未命名）',
)

const hasRemark = computed(
  () => !!String(props.node.attrs.remarkId ?? '').trim(),
)

function glossaryTitles() {
  try {
    return Array.from(collectGlossary(props.editor.state.doc).keys())
  } catch {
    return []
  }
}

function termRootEl() {
  const pos = props.getPos()
  if (typeof pos !== 'number') return null
  return props.editor.view.nodeDOM(pos)
}

function renderDesc() {
  const host = descHost.value
  if (!host) return
  host.replaceChildren()
  const desc = renderDescriptionHtml(
    serializeTermDescriptionFromNode(props.node),
    glossaryTitles(),
    titleText.value,
  )
  host.appendChild(desc)
}

function confirmCandidate(matchTitle, confirmTitle) {
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  const node = props.editor.state.doc.nodeAt(pos)
  if (!node) return
  const currentDesc = serializeTermDescriptionFromNode(node)
  const nextDescription = confirmTitleInMarkdown(
    currentDesc,
    matchTitle,
    confirmTitle,
  )
  if (nextDescription === currentDesc) return
  replaceTermDefinition(props.editor, {
    pos,
    title: titleText.value,
    description: nextDescription,
  })
  requestSaveCurrentFile()
  renderDesc()
}

function onDescClick(e) {
  const target = e.target
  const host = descHost.value
  if (!host) return

  const candidate = target?.closest?.(`.${TERM_REF_CANDIDATE_CLASS}`)
  if (candidate && host.contains(candidate)) {
    e.preventDefault()
    e.stopPropagation()
    const matchTitle =
      candidate.getAttribute('data-term-title') || candidate.textContent || ''
    const raw =
      candidate.getAttribute('data-term-candidates') || matchTitle
    const candidates = raw
      .split('\u0001')
      .map((s) => s.trim())
      .filter(Boolean)
    getKeyPicker().show({
      anchor: candidate,
      titles: candidates,
      sourceId: TERM_NODE_PICKER_SOURCE,
      selectMode: 'tab',
      passive: true,
      onPick: (picked) => {
        confirmCandidate(matchTitle.trim(), picked)
      },
    })
    return
  }

  const refEl = target?.closest?.(`.${TERM_REF_CLASS}`)
  if (!refEl || !host.contains(refEl)) return
  e.preventDefault()
  e.stopPropagation()
  const nested = (
    refEl.getAttribute('data-term-title') ||
    refEl.textContent ||
    ''
  ).trim()
  if (!nested) return
  if (
    refEl.classList.contains(TERM_REF_INVALID_CLASS) ||
    refEl.classList.contains('ext-term-ref-invalid')
  ) {
    void offerCreateMissingTerm(nested, props.editor.view)
    return
  }
  openTermPreview(nested, refEl)
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
  const root = termRootEl()
  const containerR = root?.getBoundingClientRect?.()
  const btn = event.currentTarget
  const btnR = btn?.getBoundingClientRect?.()
  openTermEditorEdit({
    editor: props.editor,
    nodePos: pos,
    besideRect: btnR
      ? {
          left: btnR.left,
          right: btnR.right,
          top: btnR.top,
          bottom: btnR.bottom,
        }
      : null,
    containerRect: containerR
      ? {
          left: containerR.left,
          right: containerR.right,
          top: containerR.top,
          bottom: containerR.bottom,
        }
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

watch(
  () => [
    serializeTermDescriptionFromNode(props.node),
    titleText.value,
    props.node.attrs.remarkId,
  ],
  () => {
    renderDesc()
  },
)

onMounted(() => {
  ensureTermGlossaryStyles()
  renderDesc()
  stopFlashRegister = registerTermFlashHandle({
    getTitle: () => String(props.node.attrs.title ?? ''),
    flash: triggerFlash,
  })
  try {
    stopStoreWatch = useGlossaryStore().$subscribe(() => {
      renderDesc()
    })
  } catch {
    // Pinia 未就绪
  }
})

onBeforeUnmount(() => {
  stopFlashRegister?.()
  stopFlashRegister = null
  stopStoreWatch?.()
  stopStoreWatch = null
  const picker = getKeyPicker()
  if (picker.isOpen && picker.currentSourceId === TERM_NODE_PICKER_SOURCE) {
    picker.hide()
  }
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
    <div class="ext-term-title-row">
      <div class="ext-term-title">{{ titleText }}</div>
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
    </div>

    <div
      ref="descHost"
      class="ext-term-desc"
      contenteditable="false"
      @click="onDescClick"
    />
  </NodeViewWrapper>
</template>
