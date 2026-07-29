<script setup>
/**
 * 词条冲突审查面板（右栏模块内容）
 * 按词条分组卡片：组内工具栏 + 懒加载列表；减少横线干扰。
 */
import { computed, reactive, ref, watch } from 'vue'
import { api } from '../../../../api'
import { useGlossaryStore } from '../../../../stores/glossary'
import { requestOpenFilePath, requestReloadFilePath } from '../../../shellEvents'
import { notifyRightPanelModulesChanged } from '../../../rightPanelRegistry'
import { alertInfo } from '../../../../composables/useDialog'
import { buildShortIgnoreContext } from './segmenter'

/** @typedef {import('./conflictDrawer').ConflictItem} ConflictItem */

const PAGE_SIZE = 10

const props = defineProps({
  /** @type {import('vue').PropType<ConflictItem[]>} */
  initialItems: { type: Array, default: () => [] },
})

const emit = defineEmits(['close'])

const store = useGlossaryStore()
/** @type {import('vue').Ref<ConflictItem[]>} */
const items = ref(props.initialItems.map((i) => ({ ...i })))
const selected = ref(new Set(items.value.map((i) => i.id)))
const mode = ref('list')
/** @type {import('vue').Ref<ConflictItem | null>} */
const pickItem = ref(null)
const pickStart = ref(0)
const pickEnd = ref(0)
const busy = ref(false)

/** 展开中的词条名集合；默认展开第一组，可同时展开多个 */
const expandedTitles = ref(new Set())
/** 每组已展示条数 */
const visibleCount = reactive(/** @type {Record<string, number>} */ ({}))

const groups = computed(() => {
  const map = new Map()
  for (const item of items.value) {
    const title = termTitleOf(item)
    if (!title) continue
    if (!map.has(title)) map.set(title, [])
    map.get(title).push(item)
  }
  return Array.from(map.entries()).map(([title, list], index) => ({
    index: index + 1,
    title,
    items: list,
  }))
})

const selectedCount = computed(() => selected.value.size)
const totalCount = computed(() => items.value.length)

watch(
  groups,
  (gs) => {
    if (!gs.length) {
      expandedTitles.value = new Set()
      return
    }
    const next = new Set(
      [...expandedTitles.value].filter((t) => gs.some((g) => g.title === t)),
    )
    if (!next.size) next.add(gs[0].title)
    expandedTitles.value = next
    for (const g of gs) {
      if (visibleCount[g.title] == null) {
        visibleCount[g.title] = Math.min(PAGE_SIZE, g.items.length)
      } else {
        visibleCount[g.title] = Math.min(
          Math.max(visibleCount[g.title], PAGE_SIZE),
          g.items.length,
        )
      }
    }
  },
  { immediate: true },
)

function termTitleOf(item) {
  return String(item?.termTitle || '').trim() || String(item?.hit || '').trim()
}

function highlightParts(context, hit) {
  const text = String(context || '')
  const needle = String(hit || '')
  const i = text.indexOf(needle)
  if (i < 0) return [{ t: text, mark: false }]
  return [
    { t: text.slice(0, i), mark: false },
    { t: needle, mark: true },
    { t: text.slice(i + needle.length), mark: false },
  ].filter((p) => p.t)
}

function isExpanded(title) {
  return expandedTitles.value.has(title)
}

function toggleExpand(title) {
  const next = new Set(expandedTitles.value)
  if (next.has(title)) next.delete(title)
  else next.add(title)
  expandedTitles.value = next
}

function visibleItemsOf(group) {
  const n = visibleCount[group.title] ?? PAGE_SIZE
  return group.items.slice(0, n)
}

function loadMore(group) {
  const cur = visibleCount[group.title] ?? PAGE_SIZE
  visibleCount[group.title] = Math.min(cur + PAGE_SIZE, group.items.length)
}

function onGroupScroll(group, e) {
  const el = e.target
  if (!el || group.items.length <= (visibleCount[group.title] ?? 0)) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
    loadMore(group)
  }
}

function toggleSelect(id, checked) {
  const next = new Set(selected.value)
  if (checked) next.add(id)
  else next.delete(id)
  selected.value = next
}

function selectedInGroup(group) {
  return group.items.filter((i) => selected.value.has(i.id))
}

function groupSelectState(group) {
  const n = selectedInGroup(group).length
  if (!n) return false
  if (n === group.items.length) return true
  return 'indeterminate'
}

function toggleGroupSelect(group, checked) {
  const next = new Set(selected.value)
  for (const item of group.items) {
    if (checked) next.add(item.id)
    else next.delete(item.id)
  }
  selected.value = next
}

function selectedItems() {
  return items.value.filter((i) => selected.value.has(i.id))
}

function openPick(item) {
  pickItem.value = item
  const hitAt = item.context.indexOf(item.hit)
  if (hitAt >= 0) {
    pickStart.value = hitAt
    pickEnd.value = hitAt + item.hit.length
  } else {
    pickStart.value = 0
    pickEnd.value = item.context.length
  }
  mode.value = 'pick'
}

function backToList() {
  mode.value = 'list'
  pickItem.value = null
}

function togglePickChar(index) {
  if (!pickItem.value) return
  const hitAt = pickItem.value.context.indexOf(pickItem.value.hit)
  const hitEnd = hitAt + pickItem.value.hit.length
  let start = pickStart.value
  let end = pickEnd.value
  if (index < start) start = index
  else if (index >= end) end = index + 1
  else if (index - start < end - index) start = index
  else end = index + 1
  if (hitAt >= 0) {
    start = Math.min(start, hitAt)
    end = Math.max(end, hitEnd)
  }
  pickStart.value = start
  pickEnd.value = end
}

/** 以词表 pending 为准重建列表（避免本地乐观更新与落库不一致） */
function syncItemsFromStore() {
  const next = []
  for (const term of Object.values(store.terms)) {
    const title = String(term?.title || '').trim()
    const pending = Array.isArray(term?.pendingManualConfirm)
      ? term.pendingManualConfirm
      : []
    for (const p of pending) {
      if (!p?.id) continue
      next.push({ ...p, termTitle: title })
    }
  }
  items.value = next
  selected.value = new Set(next.map((i) => i.id))
  notifyRightPanelModulesChanged()
}

function buildIgnores(list) {
  return list.map((i) => {
    const localFrom = i.context.indexOf(i.hit)
    const short =
      localFrom >= 0
        ? buildShortIgnoreContext(
            i.context,
            localFrom,
            localFrom + i.hit.length,
          )
        : ''
    const ctx = String(i.context || '').trim() || short || i.hit
    return {
      id: i.id,
      sourcePath: i.sourcePath,
      from: i.from,
      to: i.to,
      context: ctx,
      termTitle: termTitleOf(i),
    }
  })
}

async function applyConfirmList(list) {
  if (!list.length || busy.value) return
  busy.value = true
  try {
    const data = await api.applyGlossaryConflicts({
      newTitle: termTitleOf(list[0]),
      confirms: list.map((i) => ({
        id: i.id,
        sourcePath: i.sourcePath,
        from: i.from,
        to: i.to,
        title: termTitleOf(i),
        hit: i.hit || termTitleOf(i),
      })),
      ignores: [],
      resolvedIds: list.map((i) => i.id),
    })
    store.applyPayload(data)
    for (const path of new Set(list.map((i) => i.sourcePath))) {
      requestReloadFilePath(path)
    }
    syncItemsFromStore()
  } finally {
    busy.value = false
  }
}

async function applyIgnoreList(list) {
  if (!list.length || busy.value) return
  busy.value = true
  try {
    const ignores = buildIgnores(list)
    const data = await api.applyGlossaryConflicts({
      newTitle: termTitleOf(list[0]),
      confirms: [],
      ignores,
      resolvedIds: list.map((i) => i.id),
    })
    store.applyPayload(data)
    syncItemsFromStore()
  } finally {
    busy.value = false
  }
}

function applyConfirmSelected() {
  // 底栏「一键」按当前列表全部处理，避免勾选状态不同步只打到第一组
  return applyConfirmList(items.value.slice())
}

function applyConfirmGroup(group) {
  return applyConfirmList(selectedInGroup(group))
}

function applyIgnoreGroup(group) {
  return applyIgnoreList(selectedInGroup(group))
}

async function ignoreAllAndClose() {
  const list = items.value.slice()
  if (list.length) await applyIgnoreList(list)
  emit('close')
}

async function applyPickIgnore() {
  if (!pickItem.value || busy.value) return
  const ctx = pickItem.value.context
    .slice(pickStart.value, pickEnd.value)
    .trim()
  if (!ctx || !ctx.includes(pickItem.value.hit)) {
    await alertInfo('选区必须覆盖冲突词', '提示')
    return
  }
  busy.value = true
  try {
    const termTitle = termTitleOf(pickItem.value)
    const data = await api.applyGlossaryConflicts({
      newTitle: termTitle,
      confirms: [],
      ignores: [
        {
          id: pickItem.value.id,
          sourcePath: pickItem.value.sourcePath,
          from: pickItem.value.from,
          to: pickItem.value.to,
          context: ctx,
          termTitle,
        },
      ],
      resolvedIds: [pickItem.value.id],
    })
    store.applyPayload(data)
    const id = pickItem.value.id
    backToList()
    syncItemsFromStore()
  } finally {
    busy.value = false
  }
}

defineExpose({
  getItems: () => items.value.map((i) => ({ ...i })),
})
</script>

<template>
  <div class="ext-term-conflict-panel flex h-full min-h-0 flex-col">
    <div class="conflict-body min-h-0 flex-1 overflow-auto px-2.5 py-2.5">
      <template v-if="mode === 'list'">
        <p v-if="!groups.length" class="m-0 px-1 py-3 text-sm text-muted">
          当前没有待处理的词条冲突。
        </p>

        <div v-else class="conflict-groups">
          <section
            v-for="group in groups"
            :key="group.title"
            class="term-card"
            :class="{ 'is-open': isExpanded(group.title) }"
          >
            <button
              type="button"
              class="term-card-head"
              @click="toggleExpand(group.title)"
            >
              <span class="term-card-chevron" aria-hidden="true">
                {{ isExpanded(group.title) ? '▾' : '▸' }}
              </span>
              <span class="term-card-title">
                词条 {{ group.index }}：{{ group.title }}
              </span>
              <span class="term-card-count">{{ group.items.length }} 处匹配</span>
            </button>

            <div v-show="isExpanded(group.title)" class="term-card-body">
              <div class="term-toolbar">
                <el-checkbox
                  :model-value="groupSelectState(group) === true"
                  :indeterminate="groupSelectState(group) === 'indeterminate'"
                  @change="(v) => toggleGroupSelect(group, !!v)"
                >
                  本词条全选
                </el-checkbox>
                <div class="term-toolbar-actions">
                  <el-button
                    text
                    size="small"
                    :disabled="!selectedInGroup(group).length"
                    :loading="busy"
                    @click="applyIgnoreGroup(group)"
                  >
                    批量忽略
                  </el-button>
                  <el-button
                    text
                    type="primary"
                    size="small"
                    :disabled="!selectedInGroup(group).length"
                    :loading="busy"
                    @click="applyConfirmGroup(group)"
                  >
                    确认为词条 ({{ selectedInGroup(group).length }})
                  </el-button>
                </div>
              </div>

              <div
                class="term-list"
                @scroll="(e) => onGroupScroll(group, e)"
              >
                <div
                  v-for="(item, idx) in visibleItemsOf(group)"
                  :key="item.id"
                  class="conflict-row"
                >
                  <el-checkbox
                    :model-value="selected.has(item.id)"
                    @change="(v) => toggleSelect(item.id, !!v)"
                  />
                  <div class="conflict-row-main">
                    <span class="conflict-index">{{ idx + 1 }}.</span>
                    <span class="conflict-context">
                      <template
                        v-for="(part, pIdx) in highlightParts(item.context, item.hit)"
                        :key="pIdx"
                      >
                        <mark v-if="part.mark">{{ part.t }}</mark>
                        <template v-else>{{ part.t }}</template>
                      </template>
                    </span>
                    <button
                      type="button"
                      class="conflict-path"
                      :title="item.sourcePath"
                      @click="requestOpenFilePath(item.sourcePath)"
                    >
                      ({{ item.sourcePath }})
                    </button>
                  </div>
                  <el-button text size="small" class="conflict-pick" @click="openPick(item)">
                    选字忽略
                  </el-button>
                </div>

                <button
                  v-if="(visibleCount[group.title] || 0) < group.items.length"
                  type="button"
                  class="load-more"
                  @click="loadMore(group)"
                >
                  已加载 {{ visibleCount[group.title] }}/{{ group.items.length }} 条，点击或向下滑动加载更多
                </button>
              </div>
            </div>
          </section>
        </div>
      </template>

      <div v-else-if="pickItem" class="pick-panel px-1">
        <p class="mb-2 mt-0 text-sm text-muted">
          点选连续字符作为忽略上下文（须覆盖冲突词）
        </p>
        <div class="pick-chars">
          <button
            v-for="(ch, i) in [...pickItem.context]"
            :key="i"
            type="button"
            class="pick-char"
            :class="{ 'is-selected': i >= pickStart && i < pickEnd }"
            @click="togglePickChar(i)"
          >
            {{ ch }}
          </button>
        </div>
        <div class="mt-3 flex gap-2">
          <el-button text type="primary" size="small" :loading="busy" @click="applyPickIgnore">
            确认忽略
          </el-button>
          <el-button text size="small" @click="backToList">返回列表</el-button>
        </div>
      </div>
    </div>

    <div
      v-if="mode === 'list'"
      class="conflict-footer"
    >
      <el-button
        text
        type="primary"
        size="small"
        :disabled="!totalCount"
        :loading="busy"
        @click="applyConfirmSelected"
      >
        一键确认全部 ({{ totalCount }})
      </el-button>
      <el-button
        text
        size="small"
        :loading="busy"
        @click="ignoreAllAndClose"
      >
        {{ totalCount ? '全部忽略/完成' : '完成' }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.conflict-groups {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.term-card {
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 0.55rem;
  background: color-mix(in srgb, var(--surface, #f4f7f9) 70%, transparent);
  overflow: hidden;
}

.term-card.is-open {
  background: var(--surface, #f4f7f9);
}

.term-card-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  margin: 0;
  padding: 0.65rem 0.75rem;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.term-card-head:hover {
  background: color-mix(in srgb, var(--surface-hover, #e8eef2) 55%, transparent);
}

.term-card-chevron {
  flex-shrink: 0;
  width: 1.15rem;
  color: var(--muted, #5a6b75);
  font-size: 1.05rem;
  line-height: 1;
}

.term-card-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.term-card-count {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--muted, #5a6b75);
}

.term-card-body {
  border-top: 1px solid var(--border, #c5d0d8);
}

.term-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
  padding: 0.55rem 0.75rem;
  background: color-mix(in srgb, var(--surface-hover, #e8eef2) 40%, transparent);
}

.term-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
}

.term-toolbar-actions :deep(.el-button) {
  margin: 0;
  padding: 0.2rem 0.35rem;
}

.conflict-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
  padding: 0.65rem 0.75rem;
  border-top: 1px solid var(--border, #c5d0d8);
  flex-shrink: 0;
}

.conflict-footer :deep(.el-button) {
  margin: 0;
  padding: 0.2rem 0.35rem;
}

.term-list {
  max-height: 500px;
  overflow: auto;
  padding: 0.15rem 0 0.35rem;
}

.conflict-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.45rem;
  align-items: center;
  padding: 0.45rem 0.75rem;
}

.conflict-row + .conflict-row {
  border-top: 1px dashed color-mix(in srgb, var(--border, #c5d0d8) 55%, transparent);
}

.conflict-row-main {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 0.25rem;
  font-size: 0.875rem;
  line-height: 1.4;
}

.conflict-index {
  flex-shrink: 0;
  color: var(--muted, #5a6b75);
  font-variant-numeric: tabular-nums;
}

.conflict-context {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conflict-context mark {
  background: color-mix(in srgb, #f59e0b 35%, transparent);
  color: inherit;
  padding: 0 0.1em;
  border-radius: 2px;
}

.conflict-path {
  flex-shrink: 0;
  max-width: 42%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: none;
  background: transparent;
  color: var(--accent, #0d9488);
  font: inherit;
  font-size: 0.8125rem;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.conflict-path:hover {
  color: color-mix(in srgb, var(--accent, #0d9488) 75%, #fff);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.conflict-pick {
  flex-shrink: 0;
}

.load-more {
  display: block;
  width: calc(100% - 1.5rem);
  margin: 0.25rem 0.75rem 0.45rem;
  padding: 0.4rem 0.5rem;
  border: 1px dashed color-mix(in srgb, var(--border, #c5d0d8) 80%, transparent);
  border-radius: 0.4rem;
  background: transparent;
  color: var(--muted, #5a6b75);
  font-size: 0.75rem;
  cursor: pointer;
}

.load-more:hover {
  color: var(--ink, #1a2830);
  border-color: var(--border, #c5d0d8);
  background: color-mix(in srgb, var(--surface-hover, #e8eef2) 50%, transparent);
}

.pick-chars {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
}

.pick-char {
  min-width: 1.5rem;
  height: 1.75rem;
  margin: 0;
  padding: 0 0.25rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 4px;
  background: var(--surface, #f4f7f9);
  color: inherit;
  cursor: pointer;
}

.pick-char.is-selected {
  border-color: var(--accent, #2563eb);
  background: var(--accent-soft, #dbeafe);
  color: var(--accent, #2563eb);
}
</style>
