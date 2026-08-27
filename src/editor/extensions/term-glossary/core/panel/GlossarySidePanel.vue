<script setup>
/**
 * 右侧「词条」Hub：常用词条 / 按入口文件 / 功能 三区；不与「武器、历史」和「关系网」混在同一功能格。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useGlossaryStore } from '../../../../../stores/glossary'
import {
  isGlossaryDefPath,
  normalizeDocPath,
} from '../shared/glossaryPaths'
import {
  clearRecentTerms,
  useRecentTerms,
} from '../shared/termRecent'
import {
  beginTermCapsuleDrag,
  dropTermRefAtPoint,
  endTermCapsuleDrag,
  ensureTermCapsuleDragStyles,
  isTermCapsuleDragging,
  moveTermCapsuleGhost,
} from './termCapsuleDrag'
import { openTermPreview } from '../dialog/openPreview'

const store = useGlossaryStore()
const { terms } = storeToRefs(store)
const recentTerms = useRecentTerms()

/** @typedef {'hub' | 'browse' | 'placeholder'} PanelView */

/** @type {import('vue').Ref<PanelView>} */
const view = ref('hub')
const query = ref('')
/** @type {import('vue').Ref<string>} */
const browseFilterPath = ref('')
/** @type {import('vue').Ref<string>} */
const placeholderTitle = ref('')

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

/** @type {Array<{ id: string, title: string, desc: string }>} */
const PLACEHOLDER_FEATURES = [
  { id: 'graph', title: '关系网', desc: '按引用关系可视化' },
  { id: 'summary', title: '汇总卡片', desc: '按槽位展示关联词条' },
  { id: 'ref-search', title: '引用检索', desc: '谁引用了这条词条' },
]

function groupLabelFromPath(sourcePath) {
  const p = normalizeDocPath(sourcePath)
  const base = p.split('/').filter(Boolean).pop() || ''
  return base.replace(/\.md$/i, '') || base
}

const allTermsList = computed(() => {
  const list = []
  for (const term of Object.values(terms.value || {})) {
    const path = normalizeDocPath(term?.sourcePath || '')
    if (!path || !isGlossaryDefPath(path) || !path.endsWith('.md')) continue
    const title = String(term.title || '').trim()
    if (!title) continue
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

const filteredTerms = computed(() => {
  const q = String(query.value || '').trim().toLowerCase()
  let list = allTermsList.value
  const filterPath = normalizeDocPath(browseFilterPath.value)
  if (filterPath) {
    list = list.filter((t) => t.sourcePath === filterPath)
  }
  if (!q) return list
  return list.filter((t) => t.title.toLowerCase().includes(q))
})

const groups = computed(() => {
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

const recentEntries = computed(() => {
  const validTitles = new Set(Object.keys(terms.value || {}))
  return recentTerms.value
    .filter((item) => validTitles.has(item.title))
    .map((item) => ({
      title: item.title,
      sourcePath: item.sourcePath,
      group: groupLabelFromPath(item.sourcePath),
      useCount: item.useCount,
    }))
})

/** 常用区展示：有记录用最近，否则先展示库内前几条占位 */
const frequentDisplayTerms = computed(() => {
  if (recentEntries.value.length) return recentEntries.value
  return allTermsList.value.slice(0, 6).map((item) => ({
    title: item.title,
    sourcePath: item.sourcePath,
    group: item.group,
  }))
})

const toolTiles = computed(() => [
  {
    id: 'browse-all',
    title: '全库预览',
    meta: `${totalCount.value} 条`,
    soon: false,
    onClick: () => goBrowse(''),
  },
  ...PLACEHOLDER_FEATURES.map((feat) => ({
    id: feat.id,
    title: feat.title,
    meta: '即将推出',
    soon: true,
    onClick: () => goPlaceholder(feat.title),
  })),
])

const totalCount = computed(() => allTermsList.value.length)

const browsePageTitle = computed(() => {
  if (browseFilterPath.value) {
    return groupLabelFromPath(browseFilterPath.value)
  }
  return '全库预览'
})

const breadcrumbItems = computed(() => {
  /** @type {Array<{ label: string, action: () => void }>} */
  const items = [{ label: '词条', action: goHub }]
  if (view.value === 'browse') {
    items.push({
      label: browsePageTitle.value,
      action: () => goBrowse(browseFilterPath.value),
    })
  } else if (view.value === 'placeholder' && placeholderTitle.value) {
    items.push({ label: placeholderTitle.value, action: () => {} })
  }
  return items
})

function goHub() {
  view.value = 'hub'
  browseFilterPath.value = ''
  placeholderTitle.value = ''
  query.value = ''
}

function goBrowse(sourcePath = '') {
  view.value = 'browse'
  browseFilterPath.value = normalizeDocPath(sourcePath)
  placeholderTitle.value = ''
  query.value = ''
}

function goPlaceholder(title) {
  view.value = 'placeholder'
  placeholderTitle.value = String(title || '').trim()
  browseFilterPath.value = ''
  query.value = ''
}

function onBreadcrumbClick(index) {
  const item = breadcrumbItems.value[index]
  if (!item?.action) return
  if (index === breadcrumbItems.value.length - 1) return
  item.action()
}

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

/** 常用词条：短按打开预览弹窗，不跳转源文件 */
function onOpenFrequentTerm(item, event) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (isTermCapsuleDragging()) return
  const title = String(item?.title || '').trim()
  if (!title) return
  const anchor =
    event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  openTermPreview(title, anchor)
}

onBeforeUnmount(() => {
  clearPressTimer()
  endTermCapsuleDrag()
  unbindDocListeners()
})
</script>

<template>
  <div class="glossary-side-panel flex h-full min-h-0 flex-col">
    <header class="glossary-side-panel__head shrink-0 px-3 pt-3">
      <nav
        class="glossary-side-panel__breadcrumb"
        aria-label="词条导航"
      >
        <template
          v-for="(crumb, index) in breadcrumbItems"
          :key="`${crumb.label}:${index}`"
        >
          <span
            v-if="index > 0"
            class="glossary-side-panel__breadcrumb-sep"
            aria-hidden="true"
          >›</span>
          <button
            type="button"
            class="glossary-side-panel__breadcrumb-item"
            :class="{ 'is-current': index === breadcrumbItems.length - 1 }"
            :disabled="index === breadcrumbItems.length - 1"
            @click="onBreadcrumbClick(index)"
          >
            {{ crumb.label }}
          </button>
        </template>
      </nav>
    </header>

    <!-- Hub：常用模块 + 功能 -->
    <div
      v-if="view === 'hub'"
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2"
    >
      <!-- 常用词条：标题 + 胶囊，无容器框 -->
      <section class="glossary-hub__section glossary-hub__section--frequent">
        <div class="glossary-hub__section-head">
          <h3 class="glossary-hub__section-title">常用词条</h3>
          <button
            v-if="recentEntries.length"
            type="button"
            class="glossary-hub__section-action"
            @click="clearRecentTerms"
          >
            清空
          </button>
        </div>
        <div class="glossary-side-panel__tags">
          <button
            v-for="term in frequentDisplayTerms"
            :key="`frequent:${term.sourcePath}:${term.title}`"
            type="button"
            class="glossary-side-panel__tag"
            :title="`${term.group} · 短按预览 · 长按拖入正文`"
            @pointerdown="onTagPointerDown($event, term)"
            @click="onOpenFrequentTerm(term, $event)"
          >
            {{ term.title }}
          </button>
        </div>
      </section>

      <!-- 功能 -->
      <section class="glossary-hub__section glossary-hub__section--tools">
        <h3 class="glossary-hub__section-title">功能</h3>
        <div class="glossary-hub__file-grid">
          <button
            v-for="tool in toolTiles"
            :key="tool.id"
            type="button"
            class="glossary-hub__file-tile"
            :class="{ 'is-soon': tool.soon }"
            @click="tool.onClick()"
          >
            <span class="glossary-hub__file-name">{{ tool.title }}</span>
            <span class="glossary-hub__file-meta">{{ tool.meta }}</span>
          </button>
        </div>
      </section>
    </div>

    <!-- 浏览子页 -->
    <template v-else-if="view === 'browse'">
      <div class="shrink-0 px-3 pb-2 pt-1">
        <input
          v-model="query"
          type="search"
          class="glossary-side-panel__search"
          placeholder="搜索词条标题…"
          spellcheck="false"
          autocomplete="off"
        >
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
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
    </template>

    <!-- 功能占位页 -->
    <div
      v-else
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 pb-8 text-center"
    >
      <p class="m-0 text-sm font-semibold text-ink">
        {{ placeholderTitle || '功能开发中' }}
      </p>
      <p class="m-0 max-w-xs text-xs leading-relaxed text-muted">
        此功能尚未实现。点击面包屑中的「词条」返回。
      </p>
      <button
        type="button"
        class="glossary-hub__back-btn"
        @click="goHub"
      >
        返回词条入口
      </button>
    </div>
  </div>
</template>

<style scoped>
.glossary-side-panel__head {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.glossary-side-panel__breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem 0.25rem;
  margin: 0;
  padding: 0;
}

.glossary-side-panel__breadcrumb-sep {
  color: var(--muted, #5a6b75);
  font-size: 0.75rem;
  user-select: none;
}

.glossary-side-panel__breadcrumb-item {
  margin: 0;
  padding: 0.1rem 0.15rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--accent, #0d6e6e);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.35;
  cursor: pointer;
}

.glossary-side-panel__breadcrumb-item:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent, #0d6e6e) 10%, transparent);
}

.glossary-side-panel__breadcrumb-item.is-current,
.glossary-side-panel__breadcrumb-item:disabled {
  color: var(--ink, #1a2830);
  cursor: default;
}

.glossary-side-panel__subtitle {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted, #5a6b75);
}

.glossary-hub__section {
  margin-bottom: 1.1rem;
}

.glossary-hub__section:last-child {
  margin-bottom: 0;
}

.glossary-hub__section--frequent,
.glossary-hub__section--tools {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.glossary-hub__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.glossary-hub__section-title {
  margin: 0;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted, #5a6b75);
}

.glossary-hub__section-action {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--muted, #5a6b75);
  font: inherit;
  font-size: 0.6875rem;
  cursor: pointer;
}

.glossary-hub__section-action:hover {
  color: var(--accent, #0d6e6e);
}

.glossary-hub__file-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.glossary-hub__file-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  min-height: 4.5rem;
  margin: 0;
  padding: 0.55rem 0.6rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 8px;
  background: var(--surface, #f4f7f9);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.glossary-hub__file-tile:hover {
  border-color: color-mix(in srgb, var(--accent, #0d6e6e) 40%, var(--border, #c5d0d8));
  background: color-mix(in srgb, var(--accent, #0d6e6e) 5%, var(--surface, #f4f7f9));
}

.glossary-hub__file-tile.is-soon {
  opacity: 0.72;
}

.glossary-hub__file-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ink, #1a2830);
}

.glossary-hub__file-meta {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--accent, #0d6e6e);
}

.glossary-hub__back-btn {
  margin-top: 0.5rem;
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.glossary-hub__back-btn:hover {
  border-color: color-mix(in srgb, var(--accent, #0d6e6e) 45%, var(--border, #c5d0d8));
  color: var(--accent, #0d6e6e);
}

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
