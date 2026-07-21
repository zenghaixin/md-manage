<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { TextSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { TERM_NODE_NAME } from './constants'
import { findTitlesInText } from './syntax'

const props = defineProps(nodeViewProps)

const titleEl = ref(null)
const editingTitle = ref(false)
const localTitle = ref(String(props.node.attrs.title ?? ''))
/** 驱动关联词条随文档更新重算 */
const docTick = ref(0)

watch(
  () => props.node.attrs.title,
  (value) => {
    if (editingTitle.value) return
    localTitle.value = String(value ?? '')
  },
)

function bumpDoc() {
  docTick.value += 1
}

onMounted(() => {
  props.editor.on('update', bumpDoc)
})

onUnmounted(() => {
  props.editor.off('update', bumpDoc)
})

const relatedTitles = computed(() => {
  docTick.value
  const self = String(props.node.attrs.title ?? '').trim()
  const titles = []
  props.editor.state.doc.descendants((node) => {
    if (node.type.name !== TERM_NODE_NAME) return
    const t = String(node.attrs.title ?? '').trim()
    if (t) titles.push(t)
  })
  return findTitlesInText(props.node.textContent || '', titles, self)
})

function onTitleMouseDown(event) {
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
  if (event.target.closest('.ext-term-related')) return
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

/** 点击关联标签 → 跳转到对应词条定义 */
function onRelatedClick(title, event) {
  event.preventDefault()
  event.stopPropagation()
  let targetPos = null
  props.editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== TERM_NODE_NAME) return
    if (String(node.attrs.title ?? '').trim() === title) {
      targetPos = pos
      return false
    }
  })
  if (targetPos == null) return
  props.editor.chain().focus().setNodeSelection(targetPos).scrollIntoView().run()
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

    <div
      v-if="relatedTitles.length"
      class="ext-term-related"
      contenteditable="false"
    >
      <span class="ext-term-related-label">关联词条：</span>
      <button
        v-for="title in relatedTitles"
        :key="title"
        type="button"
        class="ext-term-related-tag"
        :title="`跳转到词条「${title}」`"
        @click="onRelatedClick(title, $event)"
        @mousedown.prevent
      >
        #{{ title }}
      </button>
    </div>
  </NodeViewWrapper>
</template>
