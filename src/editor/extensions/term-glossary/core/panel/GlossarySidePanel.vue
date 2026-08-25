<script setup>
/**
 * 右侧「词条」面板：按定义文件名分组，tag 展示标题，支持搜索与跳转。
 */
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useGlossaryStore } from '../../../../../stores/glossary'
import {
  isGlossaryDefPath,
  normalizeDocPath,
} from '../shared/glossaryPaths'

const store = useGlossaryStore()
const { terms } = storeToRefs(store)

const query = ref('')

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

function onOpenTerm(item) {
  const path = String(item?.sourcePath || '').trim()
  const title = String(item?.title || '').trim()
  if (!path || !title) return
  store.requestOpenSource(path, title)
}
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
            :title="`打开 ${group.label} · ${term.title}`"
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
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.glossary-side-panel__tag:hover {
  background: color-mix(in srgb, var(--accent, #0d6e6e) 18%, transparent);
  border-color: var(--accent, #0d6e6e);
}

.glossary-side-panel__tag:focus-visible {
  outline: 2px solid var(--accent, #0d6e6e);
  outline-offset: 1px;
}
</style>
