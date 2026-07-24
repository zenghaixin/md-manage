<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { confirmChoice } from '../../../composables/useDialog'
import { useGlossaryStore } from '../../../stores/glossary'
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
/** 已落库 / 已提交的标题；输入过程只改 localTitle，真正离开词条后再提交 */
let committedTitle = String(props.node.attrs.title ?? '')
let renaming = false
let commitTimer = null
let stopOutsideListen = null
/** 输入法合成中，绝不提交 */
let composing = false

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
  // 正在改标题时不切换样式，避免 NodeView 重绘抢光标
  if (editingTitle.value || composing) return false
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
    const next = String(value ?? '')
    const dirty =
      sanitizeTermTitle(localTitle.value) !== sanitizeTermTitle(committedTitle)
    // 输入中 / 有未提交草稿：不覆盖草稿，也不改 committed 基准
    if (editingTitle.value || composing || dirty) {
      if (sanitizeTermTitle(next) === sanitizeTermTitle(localTitle.value)) {
        committedTitle = next
      }
      return
    }
    committedTitle = next
    localTitle.value = next
    syncTitleDom(next)
  },
)

/** 标题用非受控 input：聚焦时绝不写回 value，避免 IME / 重渲染丢光标 */
function syncTitleDom(value) {
  const el = titleEl.value
  if (!el) return
  if (document.activeElement === el || editingTitle.value || composing) return
  const next = String(value ?? '')
  if (el.value !== next) el.value = next
}

function termRootEl() {
  return (
    titleEl.value?.closest?.('.ext-term-node') ||
    titleEl.value?.closest?.('[data-node-view-wrapper]') ||
    null
  )
}

function isFocusInsideThisTerm() {
  if (composing || editingTitle.value) return true
  if (typeof document === 'undefined') return false
  const active = document.activeElement
  if (active && active === titleEl.value) return true
  const root = termRootEl()
  if (root && active && root.contains(active)) return true
  return false
}

function isSelectionInThisTerm() {
  if (props.selected) return true
  try {
    const { from } = props.editor.state.selection
    const $pos = props.editor.state.doc.resolve(from)
    for (let d = $pos.depth; d > 0; d -= 1) {
      if ($pos.node(d) === props.node) return true
    }
  } catch {
    // ignore
  }
  return false
}

/** 仍在本词条内编辑（含标题 input / 描述 / 选区） */
function isStillEditingThisTerm() {
  return isFocusInsideThisTerm() || isSelectionInThisTerm()
}

function scheduleCommitTitleRename() {
  if (commitTimer) clearTimeout(commitTimer)
  // 稍等焦点落定，再确认已真正离开（避免 IME / 进描述误提交）
  commitTimer = setTimeout(() => {
    commitTimer = null
    void tryCommitTitleRename()
  }, 120)
}

function onTitleMouseDown(event) {
  // 只拦冒泡，不要 preventDefault（否则部分环境会干扰 focus 甚至卡死）
  event.stopPropagation()
  editingTitle.value = true
}

function onTitleFocus() {
  editingTitle.value = true
  committedTitle = String(props.node.attrs.title ?? committedTitle ?? '')
}

function onTitleCompositionStart() {
  composing = true
}

function onTitleCompositionEnd(event) {
  composing = false
  const value = event.target?.value ?? ''
  localTitle.value = value
  const next = sanitizeTermTitle(value)
  const prev = sanitizeTermTitle(committedTitle)
  if (next && prev && next !== prev) {
    suppressAutoConfirmForTitle(next)
  }
}

function onTitleBlur(event) {
  editingTitle.value = false
  // 以 DOM 实值为准（非受控）
  localTitle.value = titleEl.value?.value ?? localTitle.value
  const root = termRootEl()
  const next = event.relatedTarget
  // 焦点仍落在本词条内（例如点进描述）→ 不提交
  if (root && next && root.contains(next)) return
  scheduleCommitTitleRename()
}

/**
 * 仅在「编辑结束且光标/焦点都不在当前词条」时落库标题并写入曾用名。
 * @param {boolean} [force] 明确点到词条外时强制提交
 */
async function tryCommitTitleRename(force = false) {
  if (renaming || composing) return
  if (!force && isStillEditingThisTerm()) return

  // 以标题框 DOM 为准
  if (titleEl.value) localTitle.value = titleEl.value.value

  const next = sanitizeTermTitle(localTitle.value)
  localTitle.value = next
  syncTitleDom(next)
  const prev = sanitizeTermTitle(committedTitle)
  if (!next) {
    if (String(props.node.attrs.title ?? '') !== next) {
      props.updateAttributes({ title: next })
    }
    return
  }
  if (!prev || prev === next) {
    if (String(props.node.attrs.title ?? '') !== next) {
      props.updateAttributes({ title: next })
    }
    committedTitle = next
    return
  }

  // 新标题撞到其他词条的曾用名
  try {
    const store = useGlossaryStore()
    let ownerOfFormer = null
    for (const [title, term] of Object.entries(store.terms)) {
      if (title === prev) continue
      if ((term.formerTitles || []).includes(next)) {
        ownerOfFormer = title
        break
      }
    }
    if (ownerOfFormer) {
      const choice = await confirmChoice(
        `「${next}」是词条「${ownerOfFormer}」的曾用名，请选择：`,
        '曾用名冲突',
        {
          confirmText: '打开已有词条',
          cancelText: '作为新词条',
          type: 'warning',
        },
      )
      if (choice === 'close') {
        localTitle.value = prev
        props.updateAttributes({ title: prev })
        committedTitle = prev
        return
      }
      if (choice === 'confirm') {
        localTitle.value = prev
        props.updateAttributes({ title: prev })
        committedTitle = prev
        store.requestOpenSource(
          store.getTerm(ownerOfFormer)?.sourcePath || '',
          ownerOfFormer,
        )
        return
      }
      const stripped = store.stripFormerTitle(next)
      await store.persistTerms(stripped)
    }
  } catch (err) {
    console.warn('[term-node] former-title check failed:', err)
  }

  props.updateAttributes({ title: next })
  renaming = true
  try {
    await commitTermRename({
      oldTitle: prev,
      newTitle: next,
      saveCurrent: true,
      editor: props.editor,
    })
    committedTitle = next
  } catch (err) {
    console.warn('[term-node] rename sync failed:', err)
  } finally {
    renaming = false
  }
}

function onTitleInput(event) {
  // 合成过程中不改 Vue 状态，避免受控回写打断 IME
  if (composing) return
  const value = event.target.value
  localTitle.value = value
  const next = sanitizeTermTitle(value)
  const prev = sanitizeTermTitle(committedTitle)
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
  return termRootEl()
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
  syncTitleDom(localTitle.value)
  stopFlashRegister = registerTermFlashHandle({
    getTitle: () => String(props.node.attrs.title ?? localTitle.value ?? ''),
    flash: triggerFlash,
  })
  // 选区离开本词条后再提交；不在这里强制提交，避免和标题 focus 互抢
  const onMaybeCommit = () => scheduleCommitTitleRename()
  props.editor.on('selectionUpdate', onMaybeCommit)
  props.editor.on('blur', onMaybeCommit)
  stopOutsideListen = () => {
    props.editor.off('selectionUpdate', onMaybeCommit)
    props.editor.off('blur', onMaybeCommit)
  }
})

onUnmounted(() => {
  if (commitTimer) {
    clearTimeout(commitTimer)
    commitTimer = null
  }
  stopOutsideListen?.()
  stopOutsideListen = null
  if (props.editor?.isDestroyed) {
    void tryCommitTitleRename(true)
  }
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
    :data-term-title="node.attrs.title"
    :data-incomplete-hint="isIncomplete ? incompleteHint : undefined"
    @click="selectWholeTerm"
  >
    <input
      ref="titleEl"
      class="ext-term-title"
      type="text"
      placeholder="词条标题"
      @mousedown="onTitleMouseDown"
      @focus="onTitleFocus"
      @blur="onTitleBlur"
      @compositionstart="onTitleCompositionStart"
      @compositionend="onTitleCompositionEnd"
      @input="onTitleInput"
      @keydown="onTitleKeydown"
    >

    <NodeViewContent class="ext-term-desc" as="div" />
  </NodeViewWrapper>
</template>
