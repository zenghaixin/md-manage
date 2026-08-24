<script setup>
/**
 * 右侧备注卡片：与正文备注同高对齐，碰撞下推；悬停高亮正文。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  getActiveRemarkId,
  getRemarkEditorView,
  onRemarkUiChange,
  setRemarkHoverId,
} from './bridge'
import { getBlockRemarkTarget, getNodeBlockRemarkId } from './blockTargets'
import { REMARK_NODE_NAME } from './constants'
import {
  getRemarkDescription,
  onRemarkDescriptionsChange,
  setRemarkDescription,
} from './storage'
import { removeRemarkById } from './apply'
import { requestSaveCurrentFile } from '../../shellEvents'

const CARD_GAP = 8
const CARD_MIN_H = 72

/** @type {import('vue').Ref<Array<{ id: string, text: string, top: number, pos: number }>>} */
const rawItems = ref([])
/** 碰撞下推后的 top */
const layoutTops = ref(/** @type {Record<string, number>} */ ({}))
const hoverId = ref('')
/** 光标所在备注文案对应的卡片 */
const activeId = ref('')
const draftMap = ref(/** @type {Record<string, string>} */ ({}))

let remarkPersistTimer = null

function scheduleRemarkPersist() {
  if (remarkPersistTimer) clearTimeout(remarkPersistTimer)
  remarkPersistTimer = setTimeout(() => {
    remarkPersistTimer = null
    void requestSaveCurrentFile().catch((err) => {
      console.warn('[remark] persist description failed:', err)
    })
  }, 600)
}

const items = computed(() =>
  rawItems.value.map((it) => ({
    ...it,
    top: layoutTops.value[it.id] ?? it.top,
    description: draftMap.value[it.id] ?? getRemarkDescription(it.id),
  })),
)

const canvasHeight = computed(() => {
  if (!items.value.length) return 0
  let max = 0
  for (const it of items.value) {
    max = Math.max(max, it.top + CARD_MIN_H + 24)
  }
  const view = getRemarkEditorView()
  const scrollParent =
    view?.dom?.closest?.('.overflow-auto') || view?.dom?.parentElement
  const scrollH = scrollParent?.scrollHeight || 0
  return Math.max(max, scrollH)
})

function collect() {
  const view = getRemarkEditorView()
  if (!view || view.isDestroyed) {
    rawItems.value = []
    layoutTops.value = {}
    activeId.value = ''
    return
  }
  activeId.value = getActiveRemarkId()
  const scrollParent =
    view.dom.closest('.overflow-auto') || view.dom.parentElement
  const parentRect = scrollParent?.getBoundingClientRect?.()
  const scrollTop = scrollParent?.scrollTop || 0

  /** @type {Array<{ id: string, text: string, top: number, pos: number }>} */
  const list = []
  const seen = new Set()
  view.state.doc.descendants((node, pos) => {
    let id = ''
    let text = ''
    if (node.type.name === REMARK_NODE_NAME) {
      id = String(node.attrs.id || '').trim()
      text = node.textContent || ''
    } else if (getBlockRemarkTarget(node.type.name)) {
      id = getNodeBlockRemarkId(node)
      const title = String(node.attrs.title || '').trim()
      text = title || node.textContent || ''
    } else {
      return
    }
    if (!id || seen.has(id)) return
    seen.add(id)
    const dom = view.nodeDOM(pos)
    let top = 0
    if (dom && parentRect) {
      const rect = /** @type {HTMLElement} */ (dom).getBoundingClientRect?.()
      if (rect) top = rect.top - parentRect.top + scrollTop
    } else {
      try {
        const coords = view.coordsAtPos(pos + 1)
        top = coords.top - (parentRect?.top || 0) + scrollTop
      } catch {
        top = list.length * (CARD_MIN_H + CARD_GAP)
      }
    }
    list.push({
      id,
      text,
      top: Math.max(0, top),
      pos,
    })
  })
  list.sort((a, b) => a.pos - b.pos || a.top - b.top)
  rawItems.value = list

  // 碰撞下推
  const tops = {}
  let cursor = 0
  for (const it of list) {
    const t = Math.max(it.top, cursor)
    tops[it.id] = t
    cursor = t + CARD_MIN_H + CARD_GAP
    if (draftMap.value[it.id] == null) {
      draftMap.value = {
        ...draftMap.value,
        [it.id]: getRemarkDescription(it.id),
      }
    }
  }
  layoutTops.value = tops

  // 编辑器滚动容器可能晚于面板挂载，每次 collect 时校正监听
  const nextEditorScroll =
    view.dom.closest('.overflow-auto') || view.dom.parentElement || null
  if (nextEditorScroll !== editorScrollEl) {
    editorScrollEl?.removeEventListener('scroll', onEditorScroll)
    editorScrollEl = nextEditorScroll
    editorScrollEl?.addEventListener('scroll', onEditorScroll, {
      passive: true,
    })
  }

  // 同步面板滚动
  syncPanelFromEditor()
}

function syncPanelFromEditor() {
  const view = getRemarkEditorView()
  const editorScroll =
    view?.dom?.closest?.('.overflow-auto') || view?.dom?.parentElement
  const panelScroll = panelScrollEl.value
  if (!editorScroll || !panelScroll || syncingScroll) return
  syncingScroll = true
  panelScroll.scrollTop = editorScroll.scrollTop
  requestAnimationFrame(() => {
    syncingScroll = false
  })
}

function syncEditorFromPanel() {
  const view = getRemarkEditorView()
  const editorScroll =
    view?.dom?.closest?.('.overflow-auto') || view?.dom?.parentElement
  const panelScroll = panelScrollEl.value
  if (!editorScroll || !panelScroll || syncingScroll) return
  syncingScroll = true
  editorScroll.scrollTop = panelScroll.scrollTop
  requestAnimationFrame(() => {
    syncingScroll = false
  })
}

const panelScrollEl = ref(null)
/** 防止编辑区 ↔ 面板互相 setScrollTop 形成环 */
let syncingScroll = false
let stopUi = null
let stopDesc = null
let editorScrollEl = null

function onEditorScroll() {
  syncPanelFromEditor()
}

function onPanelScroll() {
  syncEditorFromPanel()
}
function onHover(id) {
  hoverId.value = id
  setRemarkHoverId(id)
}

function onLeave() {
  onHover('')
}

function onDescInput(id, value) {
  draftMap.value = { ...draftMap.value, [id]: value }
  setRemarkDescription(id, value)
  scheduleRemarkPersist()
}

function descParts(text) {
  const raw = String(text || '')
  if (!raw.includes('\n\n---\n\n')) return [raw]
  return raw.split(/\n\n---\n\n/)
}

function onPartInput(id, index, value) {
  const parts = descParts(draftMap.value[id] ?? getRemarkDescription(id))
  parts[index] = value
  onDescInput(id, parts.join('\n\n---\n\n'))
}

function onRemove(id) {
  const view = getRemarkEditorView()
  if (view) removeRemarkById(view, id)
  const next = { ...draftMap.value }
  delete next[id]
  draftMap.value = next
  collect()
  scheduleRemarkPersist()
}

onMounted(() => {
  collect()
  stopUi = onRemarkUiChange(collect)
  stopDesc = onRemarkDescriptionsChange(collect)
  const view = getRemarkEditorView()
  editorScrollEl =
    view?.dom?.closest?.('.overflow-auto') || view?.dom?.parentElement || null
  editorScrollEl?.addEventListener('scroll', onEditorScroll, { passive: true })
})

onUnmounted(() => {
  if (remarkPersistTimer) {
    clearTimeout(remarkPersistTimer)
    remarkPersistTimer = null
    void requestSaveCurrentFile().catch(() => {})
  }
  stopUi?.()
  stopDesc?.()
  editorScrollEl?.removeEventListener('scroll', onEditorScroll)
  panelScrollEl.value?.removeEventListener('scroll', onPanelScroll)
  setRemarkHoverId('')
})

watch(panelScrollEl, (el, prev) => {
  prev?.removeEventListener('scroll', onPanelScroll)
  el?.addEventListener('scroll', onPanelScroll, { passive: true })
  syncPanelFromEditor()
})
</script>

<template>
  <div
    ref="panelScrollEl"
    class="remark-panel h-full min-h-0 overflow-auto px-2 py-2"
  >
    <p v-if="!items.length" class="m-0 px-1 py-3 text-sm text-muted">
      当前页面暂无备注。选中正文后可在气泡中选择「备注」。
    </p>
    <div
      v-else
      class="remark-canvas relative"
      :style="{ height: `${canvasHeight}px` }"
    >
      <article
        v-for="item in items"
        :key="item.id"
        class="remark-card"
        :class="{
          'is-hover': hoverId === item.id,
          'is-active': activeId === item.id,
        }"
        :style="{ top: `${item.top}px` }"
        @mouseenter="onHover(item.id)"
        @mouseleave="onLeave"
      >
        <button
          type="button"
          class="remark-card-del"
          title="删除备注"
          @click="onRemove(item.id)"
        >
          ×
        </button>
        <div
          v-if="descParts(item.description).length > 1"
          class="remark-card-parts"
        >
          <template
            v-for="(part, idx) in descParts(item.description)"
            :key="idx"
          >
            <hr v-if="idx > 0" class="remark-card-hr" />
            <textarea
              class="remark-card-desc"
              rows="2"
              placeholder="添加备注描述…"
              :value="part"
              @input="onPartInput(item.id, idx, $event.target.value)"
            />
          </template>
        </div>
        <textarea
          v-else
          class="remark-card-desc"
          rows="3"
          placeholder="添加备注描述…"
          :value="item.description"
          @input="onDescInput(item.id, $event.target.value)"
        />
      </article>
    </div>
  </div>
</template>

<style scoped>
.remark-panel {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge 旧版 */
}

.remark-panel::-webkit-scrollbar {
  display: none; /* Chrome / Safari */
  width: 0;
  height: 0;
}

.remark-canvas {
  min-height: 100%;
}

/* 无底色：只靠与正文对齐的位置关系区分 */
.remark-card {
  position: absolute;
  left: 0;
  right: 0;
  box-sizing: border-box;
  min-height: 72px;
  padding: 0 0.15rem 0.25rem 0.55rem;
  border: none;
  border-left: 2px solid color-mix(in srgb, #ca8a04 45%, var(--border, #c5d0d8));
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.remark-card.is-hover {
  border-left-color: #a16207;
}

/* 光标在对应备注文案内：卡片边框高亮 */
.remark-card.is-active {
  border-left-color: #a16207;
  border-left-width: 3px;
  box-shadow: 0 0 0 1px color-mix(in srgb, #ca8a04 50%, transparent);
  border-radius: 2px;
}

.remark-card-del {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 1;
  width: 1.25rem;
  height: 1.25rem;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted, #5a6b75);
  cursor: pointer;
  line-height: 1;
  opacity: 0;
}

.remark-card:hover .remark-card-del,
.remark-card.is-hover .remark-card-del {
  opacity: 1;
}

.remark-card-del:hover {
  color: #dc2626;
}

.remark-card-desc {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0.2rem 1.4rem 0.2rem 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1.45;
  resize: vertical;
}

.remark-card-desc:focus {
  outline: none;
}

.remark-card-desc::placeholder {
  color: var(--muted, #5a6b75);
  opacity: 0.75;
}

.remark-card-parts {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.remark-card-hr {
  margin: 0.15rem 0;
  border: none;
  border-top: 1px dashed color-mix(in srgb, var(--border, #c5d0d8) 80%, transparent);
}
</style>
