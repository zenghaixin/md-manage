<script setup>
/**
 * 右侧「词条」面板：按定义文件名分组，tag 展示标题，支持搜索与跳转。
 * 胶囊：短按打开来源；长按拖入正文插入 term[]。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useGlossaryStore } from '../../../../../stores/glossary'
import {
  isGlossaryDefPath,
  normalizeDocPath,
} from '../shared/glossaryPaths'
import {
  beginTermCapsuleDrag,
  dropTermRefAtPoint,
  endTermCapsuleDrag,
  ensureTermCapsuleDragStyles,
  isTermCapsuleDragging,
  moveTermCapsuleGhost,
} from './termCapsuleDrag'

const store = useGlossaryStore()
const { terms } = storeToRefs(store)

const query = ref('')

const LONG_PRESS_MS = 220
const MOVE_TO_DRAG_PX = 6

/** @type {ReturnType<typeof setTimeout> | null} */
let pressTimer = null
/** @type {{ x: number, y: number, title: string, pointerId: number } | null} */
let pressState = null
let suppressClick = false
/** @type {HTMLElement | null} */
let captureEl = null

ensureTermCapsuleDragStyles()

/** sourcePath → 分组标题（.md 文件名去后缀） */
function groupLabelFromPath(sourcePath) {
  const p = normalizeDocPath(sourcePath)
  const base = p.split('/').filter(Boolean).pop() || ''
  return base.replace(/\.md$/i, '') || base
}

const filteredTerms = computed(() => {
  const q = String(query.value || '')
    .trim()
    .toLowerCase()
  const list = []
  for (const term of Object.values(terms.value || {})) {
    const path = normalizeDocPath(term?.sourcePath || '')
    if (!path || !isGlossaryDefPath(path) || !path.endsWith('.md')) continue
    const title = String(term.title || '').trim()
    if (!title) continue
    if (q && !title.toLowerCase().includes(q)) continue
    list.push({
      title,
      sourcePath: path,
      group: groupLabelFromPath(path),
    })
  }
  list.sort((a, b) => {
    const g = a.group.localeCompare(b.group, 'zh')
    if (g !== 0) return g
    return a.title.localeCompare(b.title, 'zh')
  })
  return list
})

/** @type {import('vue').ComputedRef<Array<{ label: string, path: string, terms: Array<{ title: string, sourcePath: string }> }>>} */
const groups = computed(() => {
  /** @type {Map<string, { label: string, path: string, terms: Array<{ title: string, sourcePath: string }> }>} */
  const map = new Map()
  for (const item of filteredTerms.value) {
    let g = map.get(item.sourcePath)
    if (!g) {
      g = { label: item.group, path: item.sourcePath, terms: [] }
      map.set(item.sourcePath, g)
    }
    g.terms.push({ title: item.title, sourcePath: item.sourcePath })
  }
  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'zh'),
  )
})

const totalCount = computed(() => filteredTerms.value.length)

function clearPressTimer() {
  if (pressTimer != null) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}

function unbindDocListeners() {
  document.removeEventListener('pointermove', onDocPointerMove, true)
  document.removeEventListener('pointerup', onDocPointerUp, true)
  document.removeEventListener('pointercancel', onDocPointerCancel, true)
}

function bindDocListeners() {
  document.addEventListener('pointermove', onDocPointerMove, true)
  document.addEventListener('pointerup', onDocPointerUp, true)
  document.addEventListener('pointercancel', onDocPointerCancel, true)
}

function startDrag(title, clientX, clientY) {
  if (isTermCapsuleDragging()) return
  suppressClick = true
  beginTermCapsuleDrag(title, clientX, clientY)
}

function onTagPointerDown(e, term) {
  if (e.button != null && e.button !== 0) return
  const title = String(term?.title || '').trim()
  if (!title) return
  e.preventDefault()
  clearPressTimer()
  pressState = {
    x: e.clientX,
    y: e.clientY,
    title,
    pointerId: e.pointerId,
  }
  captureEl = e.currentTarget
  try {
    captureEl?.setPointerCapture?.(e.pointerId)
  } catch {
    // ignore
  }
  bindDocListeners()
  pressTimer = setTimeout(() => {
    pressTimer = null
    if (!pressState || pressState.title !== title) return
    startDrag(title, pressState.x, pressState.y)
  }, LONG_PRESS_MS)
}

function onDocPointerMove(e) {
  if (!pressState || e.pointerId !== pressState.pointerId) return
  if (isTermCapsuleDragging()) {
    e.preventDefault()
    moveTermCapsuleGhost(e.clientX, e.clientY)
    return
  }
  const dx = e.clientX - pressState.x
  const dy = e.clientY - pressState.y
  // 按下后明显移动：立刻进入拖拽，不要取消长按
  if (dx * dx + dy * dy > MOVE_TO_DRAG_PX * MOVE_TO_DRAG_PX) {
    clearPressTimer()
    startDrag(pressState.title, e.clientX, e.clientY)
  }
}

function onDocPointerUp(e) {
  if (!pressState || e.pointerId !== pressState.pointerId) return
  clearPressTimer()
  const wasDragging = isTermCapsuleDragging()
  if (wasDragging) {
    e.preventDefault()
    dropTermRefAtPoint(e.clientX, e.clientY)
    suppressClick = true
  }
  try {
    captureEl?.releasePointerCapture?.(e.pointerId)
  } catch {
    // ignore
  }
  captureEl = null
  pressState = null
  unbindDocListeners()
}

function onDocPointerCancel(e) {
  if (!pressState || e.pointerId !== pressState.pointerId) return
  clearPressTimer()
  endTermCapsuleDrag()
  try {
    captureEl?.releasePointerCapture?.(e.pointerId)
  } catch {
    // ignore
  }
  captureEl = null
  pressState = null
  unbindDocListeners()
}

function onOpenTerm(item) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (isTermCapsuleDragging()) return
  const path = String(item?.sourcePath || '').trim()
  const title = String(item?.title || '').trim()
  if (!path || !title) return
  store.requestOpenSource(path, title)
}

onBeforeUnmount(() => {
  clearPressTimer()
  endTermCapsuleDrag()
  unbindDocListeners()
})
</script>

<template>
  <div class="glossary-side-panel flex h-full min-h-0 flex-col">
    <div class="shrink-0 space-y-2 px-3 pt-3">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="m-0 text-sm font-semibold text-ink">
          词条
        </h2>
        <span class="text-xs text-muted">{{ totalCount }} 个</span>
      </div>
      <input
        v-model="query"
        type="search"
        class="glossary-side-panel__search"
        placeholder="搜索词条标题…"
        spellcheck="false"
        autocomplete="off"
      >
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-3">
      <p
        v-if="!groups.length"
        class="m-0 py-6 text-center text-sm leading-relaxed text-muted"
      >
        {{ query.trim() ? '没有匹配的词条' : '暂无词条定义' }}
      </p>

      <section
        v-for="group in groups"
        :key="group.path"
        class="glossary-side-panel__group mb-4 last:mb-0"
      >
        <h3 class="glossary-side-panel__group-title">
          {{ group.label }}
        </h3>
        <div class="glossary-side-panel__tags">
          <button
            v-for="term in group.terms"
            :key="`${term.sourcePath}:${term.title}`"
            type="button"
            class="glossary-side-panel__tag"
            :title="`短按打开 · 长按拖入正文：${term.title}`"
            @pointerdown="onTagPointerDown($event, term)"
            @click="onOpenTerm(term)"
          >
            {{ term.title }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.glossary-side-panel__search {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: var(--surface, #f4f7f9);
  color: var(--ink, #1a2830);
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1.4;
  outline: none;
}

.glossary-side-panel__search:focus {
  border-color: var(--accent, #0d6e6e);
}

.glossary-side-panel__search::placeholder {
  color: var(--muted, #5a6b75);
}

.glossary-side-panel__hint {
  line-height: 1.35;
  opacity: 0.9;
}

.glossary-side-panel__group-title {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--muted, #5a6b75);
}

.glossary-side-panel__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.glossary-side-panel__tag {
  box-sizing: border-box;
  margin: 0;
  padding: 0.2rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--accent, #0d6e6e) 35%, var(--border, #c5d0d8));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent, #0d6e6e) 10%, transparent);
  color: var(--accent, #0d6e6e);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
  cursor: grab;
  touch-action: none;
  user-select: none;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.glossary-side-panel__tag:hover {
  background: color-mix(in srgb, var(--accent, #0d6e6e) 18%, transparent);
  border-color: var(--accent, #0d6e6e);
}

.glossary-side-panel__tag:active {
  cursor: grabbing;
}

.glossary-side-panel__tag:focus-visible {
  outline: 2px solid var(--accent, #0d6e6e);
  outline-offset: 1px;
}
</style>
