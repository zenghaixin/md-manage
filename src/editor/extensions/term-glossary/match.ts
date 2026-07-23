/**
 * 词条匹配：segmentit 整词自动确认区间、灰线兜底、ignoreContexts。
 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { useGlossaryStore } from '../../../stores/glossary'
import { TERM_NODE_NAME, TERM_REF_NODE_NAME } from './constants'
import {
  findDictionaryHitsInText,
  findSubstringFallbackHits,
  syncSegmenterTitles,
} from './segmenter'
import {
  hasPendingManualConfirm,
  normalizeIgnoreContexts,
  relatedTitlesForMatch,
  sanitizeTermTitle,
} from './syntax'

export interface CandidateMatch {
  from: number
  to: number
  matchTitle: string
  candidates: string[]
  /** segment 整词命中可自动确认；substring 兜底需用户确认 */
  kind: 'segment' | 'fallback'
}

export interface TermRange {
  from: number
  to: number
  title: string
}

function termNodePlainDescription(node: ProseMirrorNode): string {
  return node
    .textBetween(0, node.content.size, '\n', (leaf) =>
      leaf.type.name === 'hardBreak' ? '\n' : '',
    )
    .replace(/\u00a0/g, ' ')
    .trim()
}

/** 仅已落库的全局词表标题（不含编辑中尚未保存的本地定义） */
export function collectStoreTitles(): Set<string> {
  const titles = new Set<string>()
  try {
    const store = useGlossaryStore()
    for (const title of Object.keys(store.terms)) {
      const key = sanitizeTermTitle(title) || title
      if (key) titles.add(key)
    }
  } catch {
    // Pinia 尚未就绪时忽略
  }
  return titles
}

/** 全局 Store + 当前文档本地词条（按标题；本地优先） */
export function collectGlossary(doc?: ProseMirrorNode | null): Map<string, string> {
  const byTitle = new Map<string, string>()

  try {
    const store = useGlossaryStore()
    for (const [title, term] of Object.entries(store.terms)) {
      const key = sanitizeTermTitle(title) || title
      if (!key) continue
      byTitle.set(key, term.description || '')
    }
  } catch {
    // Pinia 尚未就绪时忽略
  }

  if (doc) {
    doc.descendants((node) => {
      if (node.type.name !== TERM_NODE_NAME) return
      const title = sanitizeTermTitle(node.attrs.title)
      if (!title) return
      byTitle.set(title, termNodePlainDescription(node))
    })
  }

  return byTitle
}

export function syncGlossaryToSegmenter(doc?: ProseMirrorNode | null): string[] {
  const titles = Array.from(collectGlossary(doc).keys())
  syncSegmenterTitles(titles)
  return titles
}

export function collectIgnoreMap(): Map<string, string[]> {
  const map = new Map<string, string[]>()
  try {
    const store = useGlossaryStore()
    for (const [title, term] of Object.entries(store.terms)) {
      const key = sanitizeTermTitle(title) || title
      map.set(key, normalizeIgnoreContexts(term.ignoreContexts))
    }
  } catch {
    // ignore
  }
  return map
}

export function collectFormerTitleMap(): Map<string, string> {
  /** formerTitle → currentTitle */
  const map = new Map<string, string>()
  try {
    const store = useGlossaryStore()
    for (const [title, term] of Object.entries(store.terms)) {
      const current = sanitizeTermTitle(title) || title
      for (const former of term.formerTitles || []) {
        const f = sanitizeTermTitle(former)
        if (!f || f === current) continue
        // 若曾用名已是现有词条标题，不作为曾用名提示
        if (store.terms[f]) continue
        if (!map.has(f)) map.set(f, current)
      }
    }
  } catch {
    // ignore
  }
  return map
}

export function collectTermRanges(doc: ProseMirrorNode): TermRange[] {
  const ranges: TermRange[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== TERM_NODE_NAME) return
    ranges.push({
      from: pos,
      to: pos + node.nodeSize,
      title: sanitizeTermTitle(node.attrs.title),
    })
  })
  return ranges
}

export function collectCodeRanges(
  doc: ProseMirrorNode,
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'codeBlock') {
      ranges.push({ from: pos, to: pos + node.nodeSize })
      return false
    }
  })
  return ranges
}

export function collectTermRefRanges(
  doc: ProseMirrorNode,
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  doc.descendants((node, pos) => {
    if (node.type.name === TERM_REF_NODE_NAME) {
      ranges.push({ from: pos, to: pos + node.nodeSize })
    }
  })
  return ranges
}

export function inRange(
  from: number,
  to: number,
  ranges: Array<{ from: number; to: number }>,
): boolean {
  return ranges.some((r) => from >= r.from && to <= r.to)
}

export function overlaps(
  from: number,
  to: number,
  ranges: Array<{ from: number; to: number }>,
): boolean {
  return ranges.some((r) => from < r.to && to > r.from)
}

export function enclosingTerm(
  from: number,
  to: number,
  termRanges: TermRange[],
): TermRange | undefined {
  return termRanges.find((r) => from >= r.from && to <= r.to)
}

export function isIgnoredInText(
  text: string,
  matchFrom: number,
  matchTo: number,
  ignoreContexts: string[],
): boolean {
  for (const ctx of ignoreContexts) {
    if (!ctx) continue
    let from = 0
    while (from <= text.length) {
      const idx = text.indexOf(ctx, from)
      if (idx < 0) break
      const ctxTo = idx + ctx.length
      if (matchFrom >= idx && matchTo <= ctxTo) return true
      from = idx + 1
    }
  }
  return false
}

/**
 * 取消确认时写入的短上下文：同块内左右各最多 2 字 + 标题。
 * （不能用 resolve(pos).nodeAfter：那是 atom 自身，右侧会永远为空）
 */
export function buildShortIgnoreContext(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  title: string,
): string {
  const plain = String(title ?? '').trim()
  if (!plain) return ''
  try {
    const $from = doc.resolve(from)
    const $to = doc.resolve(to)
    const blockStart = $from.start()
    const blockEnd = $to.end()
    const leftFrom = Math.max(blockStart, from - 2)
    const rightTo = Math.min(blockEnd, to + 2)
    const left = doc.textBetween(leftFrom, from, '')
    const right = doc.textBetween(to, rightTo, '')
    return `${left}${plain}${right}`.trim() || plain
  } catch {
    return plain
  }
}

/**
 * 点 × 取消确认后的会话态降级：阻止自动确认，但仍走灰线未确认逻辑。
 * （不要写 ignoreContexts——那是「不是词条」才会清掉灰线）
 */
const demotedAutoContexts = new Map<string, string[]>()

/**
 * 改名后的新标题：禁止 segmentit 自动包成 term[]，必须经冲突抽屉 / 灰线确认。
 * 否则「气→能量」会把正文里所有「能量」立刻自动确认。
 */
const renameSuppressAutoTitles = new Set<string>()

export function suppressAutoConfirmForTitle(title: string): void {
  const key = sanitizeTermTitle(title) || String(title ?? '').trim()
  if (key) renameSuppressAutoTitles.add(key)
}

export function clearAutoConfirmSuppress(title?: string): void {
  if (!title) {
    renameSuppressAutoTitles.clear()
    return
  }
  const key = sanitizeTermTitle(title) || String(title ?? '').trim()
  if (key) renameSuppressAutoTitles.delete(key)
}

export function isAutoConfirmSuppressed(title: string): boolean {
  const key = sanitizeTermTitle(title) || String(title ?? '').trim()
  if (!key) return false
  if (renameSuppressAutoTitles.has(key)) return true
  // 持久化标记：刷新后仍禁止自动确认
  try {
    const term = useGlossaryStore().getTerm(key)
    if (hasPendingManualConfirm(term?.pendingManualConfirm)) return true
  } catch {
    // ignore
  }
  return false
}

export function demoteTermToCandidate(title: string, context: string): void {
  const key = sanitizeTermTitle(title) || String(title ?? '').trim()
  const ctx = String(context ?? '').trim() || key
  if (!key || !ctx) return
  const list = demotedAutoContexts.get(key) || []
  if (!list.includes(ctx)) list.push(ctx)
  demotedAutoContexts.set(key, list)
}

export function clearDemotedTermContext(title: string, context?: string): void {
  const key = sanitizeTermTitle(title) || String(title ?? '').trim()
  if (!key) return
  if (!context) {
    demotedAutoContexts.delete(key)
    return
  }
  const ctx = String(context).trim()
  const list = (demotedAutoContexts.get(key) || []).filter((c) => c !== ctx)
  if (list.length) demotedAutoContexts.set(key, list)
  else demotedAutoContexts.delete(key)
}

function isDemotedInText(
  text: string,
  matchFrom: number,
  matchTo: number,
  title: string,
): boolean {
  const key = sanitizeTermTitle(title) || String(title ?? '').trim()
  const list = demotedAutoContexts.get(key) || []
  if (!list.length) return false
  return isIgnoredInText(text, matchFrom, matchTo, list)
}

function shouldSkipAutoConfirm(
  text: string,
  matchFrom: number,
  matchTo: number,
  title: string,
): boolean {
  if (isAutoConfirmSuppressed(title)) return true
  return isDemotedInText(text, matchFrom, matchTo, title)
}

export interface TextScanResult {
  /** 可自动写成 term[] */
  autoConfirm: CandidateMatch[]
  /** 灰线兜底，需用户确认 */
  fallback: CandidateMatch[]
  /** 命中曾用名，仅提示 */
  formerHits: Array<{
    from: number
    to: number
    formerTitle: string
    currentTitle: string
  }>
}

/**
 * 扫描文档：整词自动确认 + 子串灰线兜底 + 曾用名提示。
 */
export function scanTermMatches(doc: ProseMirrorNode): TextScanResult {
  const titles = syncGlossaryToSegmenter(doc)
  /** 自动确认只用已落库标题，避免改定义标题时正文立刻被包成 term[] */
  const storeTitles = collectStoreTitles()
  const ignoreMap = collectIgnoreMap()
  const formerMap = collectFormerTitleMap()
  const termRanges = collectTermRanges(doc)
  const codeRanges = collectCodeRanges(doc)
  const refRanges = collectTermRefRanges(doc)

  const autoConfirm: CandidateMatch[] = []
  const fallback: CandidateMatch[] = []
  const formerHits: TextScanResult['formerHits'] = []
  const taken: Array<{ from: number; to: number }> = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    if (node.marks.some((m) => m.type.name === 'code')) return

    const textFrom = pos
    if (inRange(textFrom, textFrom + node.nodeSize, codeRanges)) return

    const selfTerm = enclosingTerm(textFrom, textFrom + 1, termRanges)
    const text = node.text
    const localTaken: Array<{ from: number; to: number }> = []

    const segmentHits = findDictionaryHitsInText(text, titles)
    for (const hit of segmentHits) {
      if (selfTerm && selfTerm.title === hit.title) continue
      const ignores = ignoreMap.get(hit.title) || []
      if (isIgnoredInText(text, hit.from, hit.to, ignores)) continue
      const from = textFrom + hit.from
      const to = textFrom + hit.to
      if (overlaps(from, to, taken) || overlaps(from, to, refRanges)) continue
      taken.push({ from, to })
      localTaken.push({ from: hit.from, to: hit.to })
      // 仅本地定义标题 / 改名待确认 / 点 × 降级 → 灰线，不自动确认
      const onlyLocalTitle = !storeTitles.has(hit.title)
      if (
        onlyLocalTitle ||
        shouldSkipAutoConfirm(text, hit.from, hit.to, hit.title)
      ) {
        const candidates = relatedTitlesForMatch(hit.title, titles)
        fallback.push({
          from,
          to,
          matchTitle: hit.title,
          candidates: candidates.length ? candidates : [hit.title],
          kind: 'fallback',
        })
        continue
      }
      autoConfirm.push({
        from,
        to,
        matchTitle: hit.title,
        candidates: [hit.title],
        kind: 'segment',
      })
    }

    // 曾用名（不在当前 titles 中）
    const formerTitles = Array.from(formerMap.keys())
    if (formerTitles.length) {
      const formerSeg = findDictionaryHitsInText(text, formerTitles)
      for (const hit of formerSeg) {
        const current = formerMap.get(hit.title)
        if (!current) continue
        const from = textFrom + hit.from
        const to = textFrom + hit.to
        if (overlaps(from, to, taken) || overlaps(from, to, refRanges)) continue
        formerHits.push({
          from,
          to,
          formerTitle: hit.title,
          currentTitle: current,
        })
      }
    }

    const fb = findSubstringFallbackHits(text, titles, localTaken)
    for (const hit of fb) {
      if (selfTerm && selfTerm.title === hit.title) continue
      const ignores = ignoreMap.get(hit.title) || []
      if (isIgnoredInText(text, hit.from, hit.to, ignores)) continue
      const from = textFrom + hit.from
      const to = textFrom + hit.to
      if (overlaps(from, to, taken) || overlaps(from, to, refRanges)) continue
      // 若该子串其实已被更长整词覆盖则跳过
      taken.push({ from, to })
      const candidates = relatedTitlesForMatch(hit.title, titles)
      fallback.push({
        from,
        to,
        matchTitle: hit.title,
        candidates: candidates.length ? candidates : [hit.title],
        kind: 'fallback',
      })
    }
  })

  return {
    autoConfirm: autoConfirm.sort((a, b) => a.from - b.from),
    fallback: fallback.sort((a, b) => a.from - b.from),
    formerHits: formerHits.sort((a, b) => a.from - b.from),
  }
}

/** 仅灰线兜底（装饰用） */
export function findCandidateMatches(doc: ProseMirrorNode): CandidateMatch[] {
  return scanTermMatches(doc).fallback
}
