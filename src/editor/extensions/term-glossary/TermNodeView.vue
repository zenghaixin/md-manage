<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { FLASH_MS, registerTermFlashHandle } from './flashTerm'
import { suppressAutoConfirmForTitle } from './match'
import { commitTermRename } from './renameFlow'
import { sanitizeTermTitle } from './syntax'

const props = defineProps(nodeViewProps)

const titleEl = ref(null)
const editingTitle = ref(false)
const localTitle = ref(String(props.node.attrs.title ?? ''))
let stopFlashRegister = null
let flashAnim = null
/** 开始编辑标题时的原名，用于 blur 后触发全库改名扫描 */
let titleAtEditStart = String(props.node.attrs.title ?? '')
let renaming = false

const descEmpty = computed(() => {
  const node = props.node
  if (!node) return true
  if (node.childCount === 0) return true
  if (node.childCount > 1) return false
  const first = node.firstChild
  return (
    first?.type?.name === 'paragraph' && (first.content?.size ?? 0) === 0
  )
})

const titleEmpty = computed(() => !String(localTitle.value ?? '').trim())

/** 标题或描述空，且当前选区不在本词条内 → 标红提示 */
const isIncomplete = computed(() => {
  if (!titleEmpty.value && !descEmpty.value) return false
  if (props.selected) return false
  try {
    const { from } = props.editor.state.selection
    const $pos = props.editor.state.doc.resolve(from)
    for (let d = $pos.depth; d > 0; d -= 1) {
      if ($pos.node(d) === props.node) return false
    }
  } catch {
    // ignore
  }
  return true
})

const incompleteHint = computed(() => {
  if (titleEmpty.value && descEmpty.value) return '请填写词条标题与描述'
  if (titleEmpty.value) return '请填写词条标题'
  return '请填写词条描述'
})

watch(
  () => props.node.attrs.title,
  (value) => {
    if (editingTitle.value) return
    localTitle.value = String(value ?? '')
  },
)

function onTitleMouseDown(event) {
  event.stopPropagation()
  editingTitle.value = true
}

function onTitleFocus() {
  editingTitle.value = true
  titleAtEditStart = String(props.node.attrs.title ?? localTitle.value ?? '')
}

async function onTitleBlur() {
  editingTitle.value = false
  const next = sanitizeTermTitle(localTitle.value)
  localTitle.value = next
  if (String(props.node.attrs.title ?? '') !== next) {
    props.updateAttributes({ title: next })
  }

  const prev = sanitizeTermTitle(titleAtEditStart)
  if (!prev || !next || prev === next || renaming) return
  renaming = true
  try {
    await commitTermRename({
      oldTitle: prev,
      newTitle: next,
      saveCurrent: true,
      editor: props.editor,
    })
  } catch (err) {
    console.warn('[term-node] rename sync failed:', err)
    // 错误提示由 commitTermRename / renameFlow 弹出
  } finally {
    renaming = false
    titleAtEditStart = next
  }
}

function onTitleInput(event) {
  const value = event.target.value
  localTitle.value = value
  props.updateAttributes({ title: value })
  // 改名输入过程中立刻禁止新名自动确认，避免正文同名被包成 term[]
  const next = sanitizeTermTitle(value)
  const prev = sanitizeTermTitle(titleAtEditStart)
  if (next && prev && next !== prev) {
    suppressAutoConfirmForTitle(next)
  }
}

function focusDescriptionStart() {
  editingTitle.value = false
  titleEl.value?.blur()
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  props.editor
    .chain()
    .focus()
    .command(({ tr, dispatch }) => {
      const $inside = tr.doc.resolve(pos + 1)
      tr.setSelection(TextSelection.near($inside))
      if (dispatch) dispatch(tr.scrollIntoView())
      return true
    })
    .run()
}

function selectWholeTerm(event) {
  if (event.target.closest('.ext-term-title')) return
  if (event.target.closest('.ext-term-desc')) return
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  event.preventDefault()
  props.editor.chain().focus().setNodeSelection(pos).run()
}

function onTitleKeydown(event) {
  if (event.key === 'Enter' || event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    focusDescriptionStart()
    return
  }

  if (event.key === 'Backspace' && !localTitle.value) {
    const el = titleEl.value
    if (el && el.selectionStart === 0 && el.selectionEnd === 0) {
      event.preventDefault()
      event.stopPropagation()
      const pos = props.getPos()
      if (typeof pos === 'number') {
        editingTitle.value = false
        props.editor.chain().focus().setNodeSelection(pos).run()
      }
    }
  }
}

function resolveFlashEl() {
  return (
    titleEl.value?.closest?.('.ext-term-node') ||
    titleEl.value?.closest?.('[data-node-view-wrapper]') ||
    null
  )
}

/**
 * 旧版 #词条：setNodeSelection + scrollIntoView。
 * 动画用 Web Animations，避免改 Vue class 触发 NodeView 重渲染卡死。
 */
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
    getTitle: () => String(props.node.attrs.title ?? localTitle.value ?? ''),
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
    :class="{ 'is-selected': selected, 'is-incomplete': isIncomplete }"
    as="div"
    data-type="term-glossary"
    :data-term-title="localTitle"
    :data-incomplete-hint="isIncomplete ? incompleteHint : undefined"
    @click="selectWholeTerm"
  >
    <input
      ref="titleEl"
      class="ext-term-title"
      type="text"
      :value="localTitle"
      placeholder="词条标题"
      @mousedown="onTitleMouseDown"
      @focus="onTitleFocus"
      @blur="onTitleBlur"
      @input="onTitleInput"
      @keydown="onTitleKeydown"
    >

    <NodeViewContent class="ext-term-desc" as="div" />
  </NodeViewWrapper>
</template>
