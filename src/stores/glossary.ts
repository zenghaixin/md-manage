/**
 * 全局词条 Store：读写 API 聚合的 `{ lastUpdated, terms }`（后端镜像到 md/词条/.glossary），并与 Markdown 中的 ::: term 同步。
 * 分类靠「词条」下文件夹；词条对象不再含 type/attrs。
 */
import { defineStore } from 'pinia'
import { api } from '../api'
import { requestOpenFilePath } from '../editor/shellEvents'
import {
  hasPendingManualConfirm,
  normalizeFormerTitles,
  normalizeIgnoreContexts,
  normalizePendingManualConfirm,
  parseTermMarkdown,
  peelRemarkBraceFromDescription,
  sanitizeTermTitle,
  type PendingConflictItem,
} from '../editor/extensions/term-glossary/core/model/syntax'
import { syncSegmenterTitles } from '../editor/extensions/term-glossary/core/match/segmenter'
import { queueTermFlash } from '../editor/extensions/term-glossary/core/shared/flashTerm'

export type { PendingConflictItem }

export interface GlossaryTerm {
  title: string
  description: string
  sourcePath: string
  ignoreContexts: string[]
  /** 曾用名：仅提示，不自动改文案 */
  formerTitles: string[]
  /**
   * 改名后待人工确认的冲突列表（与 rename-sync 结果同结构）。
   * 空数组 = 无待处理，可自动确认；非空则禁止自动包 term[]。
   */
  pendingManualConfirm: PendingConflictItem[]
}

export interface GlossaryFile {
  lastUpdated: string
  terms: Record<string, GlossaryTerm>
}

function normalizeTerm(raw: Partial<GlossaryTerm> & { title?: string }): GlossaryTerm | null {
  const title = sanitizeTermTitle(raw.title)
  if (!title) return null
  return {
    title,
    description: peelRemarkBraceFromDescription(String(raw.description ?? ''))
      .description,
    sourcePath: String(raw.sourcePath ?? ''),
    ignoreContexts: normalizeIgnoreContexts(raw.ignoreContexts),
    formerTitles: normalizeFormerTitles(raw.formerTitles).filter((f) => f !== title),
    pendingManualConfirm: normalizePendingManualConfirm(raw.pendingManualConfirm),
  }
}

function scrubIgnoreContexts(
  terms: Record<string, GlossaryTerm>,
): Record<string, GlossaryTerm> {
  const titles = new Set(Object.keys(terms))
  const next: Record<string, GlossaryTerm> = {}
  for (const [key, term] of Object.entries(terms)) {
    next[key] = {
      ...term,
      // 允许 ignore === 自身标题（点 × 且两侧无邻字时）；剔除指向其它词条标题的脏数据
      ignoreContexts: (term.ignoreContexts || []).filter(
        (c) => c === key || !titles.has(c),
      ),
      formerTitles: (term.formerTitles || []).filter((f) => !titles.has(f) && f !== key),
      pendingManualConfirm: normalizePendingManualConfirm(term.pendingManualConfirm),
    }
  }
  return next
}

function syncSegmenterFromTerms(terms: Record<string, GlossaryTerm>) {
  syncSegmenterTitles(Object.keys(terms))
}

export const useGlossaryStore = defineStore('glossary', {
  state: (): {
    lastUpdated: string
    terms: Record<string, GlossaryTerm>
    loaded: boolean
  } => ({
    lastUpdated: '',
    terms: {},
    loaded: false,
  }),

  getters: {
    titles(state): string[] {
      return Object.keys(state.terms)
    },

    getTerm(state): (title: string) => GlossaryTerm | null {
      return (title: string) => {
        const key = sanitizeTermTitle(title) || String(title ?? '').trim()
        return state.terms[key] ?? null
      }
    },

    descriptionMap(state): Map<string, string> {
      const map = new Map<string, string>()
      for (const [title, term] of Object.entries(state.terms)) {
        map.set(title, term.description || '')
      }
      return map
    },
  },

  actions: {
    applyPayload(data: GlossaryFile | null | undefined) {
      this.lastUpdated = data?.lastUpdated || ''
      const raw = data?.terms && typeof data.terms === 'object' ? data.terms : {}
      const normalized: Record<string, GlossaryTerm> = {}
      for (const [key, term] of Object.entries(raw)) {
        const n = normalizeTerm({ ...term, title: term?.title ?? key })
        if (!n) continue
        normalized[n.title] = n
      }
      this.terms = scrubIgnoreContexts(normalized)
      this.loaded = true
      syncSegmenterFromTerms(this.terms)
    },

    async bootstrap() {
      const data = (await api.syncGlossary()) as GlossaryFile
      this.applyPayload(data)
    },

    async reload() {
      const data = (await api.getGlossary()) as GlossaryFile
      this.applyPayload(data)
    },

    async persistTerms(terms: Record<string, GlossaryTerm>) {
      const cleaned = scrubIgnoreContexts(terms)
      const data = (await api.putGlossary({ terms: cleaned })) as GlossaryFile
      this.applyPayload(data)
    },

    async addIgnoreContext(context: string, termTitles: string[]) {
      const ctx = String(context ?? '').trim()
      if (!ctx || !termTitles.length) return
      const terms: Record<string, GlossaryTerm> = { ...this.terms }
      let changed = false
      for (const title of termTitles) {
        const key = sanitizeTermTitle(title) || String(title ?? '').trim()
        const prev = terms[key]
        if (!prev) continue
        const list = normalizeIgnoreContexts(prev.ignoreContexts)
        if (!list.includes(ctx)) list.push(ctx)
        terms[key] = { ...prev, ignoreContexts: list }
        changed = true
      }
      if (!changed) return
      // 先同步写进内存，避免 400ms 自动确认抢在 API 返回前再次包回 term[]
      this.terms = scrubIgnoreContexts(terms)
      syncSegmenterFromTerms(this.terms)
      await this.persistTerms(this.terms)
    },

    /**
     * 改名：保留原 formerTitles（去掉新名）；仅在承认过旧名时把旧名写入曾用名。
     * pending 先清空，等 rename-sync 扫描结果整表写入。
     * @param recordAsFormer 正文是否已有行内 term[旧名]（确认冲突后的结果）
     */
    prepareRename(
      oldTitle: string,
      newTitle: string,
      description: string,
      sourcePath: string,
      recordAsFormer = false,
    ): Record<string, GlossaryTerm> | null {
      const from = sanitizeTermTitle(oldTitle)
      const to = sanitizeTermTitle(newTitle)
      if (!from || !to) return null
      const terms: Record<string, GlossaryTerm> = { ...this.terms }
      const prev = terms[from]
      const baseFormer = normalizeFormerTitles([
        ...(prev?.formerTitles || []),
      ]).filter((f) => f !== to && f !== from)
      const former = normalizeFormerTitles(
        recordAsFormer ? [...baseFormer, from] : baseFormer,
      ).filter((f) => f !== to)

      if (from !== to) delete terms[from]
      terms[to] = {
        title: to,
        description,
        sourcePath: sourcePath || prev?.sourcePath || '',
        ignoreContexts: normalizeIgnoreContexts(prev?.ignoreContexts),
        formerTitles: former,
        pendingManualConfirm: [],
      }
      return scrubIgnoreContexts(terms)
    },

    /** 删除词条条目（定义块删除时调用） */
    async removeTerm(title: string) {
      const key = sanitizeTermTitle(title) || String(title ?? '').trim()
      if (!key || !this.terms[key]) return
      const terms: Record<string, GlossaryTerm> = { ...this.terms }
      delete terms[key]
      await this.persistTerms(terms)
    },

    /** 冲突处理完毕：清空 pending，恢复自动确认 */
    async clearPendingManualConfirm(title: string) {
      const key = sanitizeTermTitle(title) || String(title ?? '').trim()
      const prev = this.terms[key]
      if (!prev || !hasPendingManualConfirm(prev.pendingManualConfirm)) return
      const terms: Record<string, GlossaryTerm> = {
        ...this.terms,
        [key]: { ...prev, pendingManualConfirm: [] },
      }
      await this.persistTerms(terms)
    },

    /** 用全库扫描结果覆盖写入 pending（改名后调用） */
    async setPendingManualConfirm(
      title: string,
      conflicts: PendingConflictItem[],
    ) {
      const key = sanitizeTermTitle(title) || String(title ?? '').trim()
      const prev = this.terms[key]
      if (!prev) return
      const next = normalizePendingManualConfirm(conflicts)
      const terms: Record<string, GlossaryTerm> = {
        ...this.terms,
        [key]: { ...prev, pendingManualConfirm: next },
      }
      await this.persistTerms(terms)
    },

    /** 新建标题撞曾用名时：从所有词条的 formerTitles 中移除该名 */
    stripFormerTitle(former: string): Record<string, GlossaryTerm> {
      const f = sanitizeTermTitle(former)
      const terms: Record<string, GlossaryTerm> = {}
      for (const [key, term] of Object.entries(this.terms)) {
        terms[key] = {
          ...term,
          formerTitles: (term.formerTitles || []).filter((x) => x !== f),
        }
      }
      return terms
    },

    /**
     * 从指定词条中移除曾用名；不传 titles 则从全部词条移除。
     */
    async removeFormerTitleFrom(
      former: string,
      titles?: string[],
    ): Promise<void> {
      const f = sanitizeTermTitle(former)
      if (!f) return
      const keys = titles?.length
        ? titles.map((t) => sanitizeTermTitle(t)).filter(Boolean)
        : Object.keys(this.terms)
      const keySet = new Set(keys)
      const terms: Record<string, GlossaryTerm> = { ...this.terms }
      let changed = false
      for (const key of keySet) {
        const prev = terms[key]
        if (!prev) continue
        const next = (prev.formerTitles || []).filter((x) => x !== f)
        if (next.length === (prev.formerTitles || []).length) continue
        terms[key] = { ...prev, formerTitles: next }
        changed = true
      }
      if (!changed) return
      await this.persistTerms(terms)
    },

    async syncFileByPath(sourcePath: string, markdown: string) {
      const path = String(sourcePath || '')
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
        .trim()
      if (!path) return
      const { isGlossaryDefPath } = await import(
        '../editor/extensions/term-glossary/core/shared/glossaryPaths'
      )
      const nodes = isGlossaryDefPath(path)
        ? parseTermMarkdown(markdown || '')
        : []
      const fileTerms = nodes
        .map((n) => {
          const peeled = peelRemarkBraceFromDescription(
            String(n.attrs.description ?? n.content ?? ''),
          )
          return {
            title: sanitizeTermTitle(n.attrs.title),
            description: peeled.description.replace(/\u00a0/g, ' ').trim(),
          }
        })
        .filter((t) => t.title)

      const data = (await api.patchGlossaryFile({
        sourcePath: path,
        terms: fileTerms,
      })) as GlossaryFile
      this.applyPayload(data)
    },

    /** @deprecated 使用 syncFileByPath */
    async syncFile(tab: string, file: string, markdown: string) {
      const t = String(tab || '').trim()
      const f = String(file || '').trim()
      const sourcePath = t && f ? `${t}/${f}` : f || t
      await this.syncFileByPath(sourcePath, markdown)
    },

    requestOpenSource(sourcePath: string, focusTerm?: string) {
      if (focusTerm) {
        queueTermFlash(focusTerm)
      }
      requestOpenFilePath(sourcePath)
    },
  },
})
