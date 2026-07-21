<script setup>
import { ref, watch } from 'vue'
import { TextSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const titleEl = ref(null)
const editingTitle = ref(false)
const localTitle = ref(String(props.node.attrs.title ?? ''))

watch(
  () => props.node.attrs.title,
  (value) => {
    // 正在输入时不要回写，否则光标会被冲掉
    if (editingTitle.value) return
    localTitle.value = String(value ?? '')
  },
)

function onTitleMouseDown(event) {
  // 阻止冒泡即可；不要 preventDefault，否则点选不到正确光标位置
  event.stopPropagation()
  editingTitle.value = true
}

function onTitleFocus() {
  editingTitle.value = true
}

function onTitleBlur() {
  editingTitle.value = false
  const next = localTitle.value
  if (String(props.node.attrs.title ?? '') !== next) {
    props.updateAttributes({ title: next })
  }
}

function onTitleInput(event) {
  const value = event.target.value
  localTitle.value = value
  props.updateAttributes({ title: value })
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
</script>

<template>
  <NodeViewWrapper
    class="ext-term-node"
    :class="{ 'is-selected': selected }"
    as="div"
    data-type="term-glossary"
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
