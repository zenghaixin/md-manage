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
import { getHostTermTitle } from './editorViewRef'
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
  // 曾用名一并进分词词典，便于「暴击率」整词切分、最长优先命中
  const formers = Array.from(collectFormerTitleMap().keys())
  syncSegmenterTitles([...titles, ...formers])
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

export function collectFormerTitleMap(): Map<string, string[]> {
  /** formerTitle → 当前标题列表（多词条可共享同一曾用名） */
  const map = new Map<string, string[]>()
  try {
    const store = useGlossaryStore()
    for (const [title, term] of Object.entries(store.terms)) {
      const current = sanitizeTermTitle(title) || title
      for (const former of term.formerTitles || []) {
        const f = sanitizeTermTitle(former)
        if (!f || f === current) continue
        // 若曾用名已是现有词条标题，不作为曾用名提示
        if (store.terms[f]) continue
        const list = map.get(f) || []
        if (!list.includes(current)) list.push(current)
        map.set(f, list)
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
  if (isDemotedInText(text, matchFrom, matchTo, title)) return true
  // 还有更长标题/曾用名以本词为前缀时，先不自动确认（等用户输完或弹窗选）
  if (isPrefixOfLongerGlossaryKey(title)) return true
  return false
}

/** 是否存在更长的正式标题或曾用名以 shortTitle 为前缀（如 暴击 → 暴击率） */
export function isPrefixOfLongerGlossaryKey(shortTitle: string): boolean {
  const key = sanitizeTermTitle(shortTitle)
  if (!key) return false
  try {
    const store = useGlossaryStore()
    for (const title of Object.keys(store.terms)) {
      const t = sanitizeTermTitle(title)
      if (t && t.length > key.length && t.startsWith(key)) return true
    }
    for (const term of Object.values(store.terms)) {
      for (const former of term.formerTitles || []) {
        const f = sanitizeTermTitle(former)
        if (f && f.length > key.length && f.startsWith(key)) return true
      }
    }
  } catch {
    // ignore
  }
  return false
}

/**
 * 光标前文本块内、到光标为止的纯文本。
 */
function textBeforeCursorInBlock(
  doc: ProseMirrorNode,
  cursor: number,
): { text: string; blockStart: number } | null {
  try {
    const $pos = doc.resolve(cursor)
    if (!$pos.parent.isTextblock) return null
    const blockStart = cursor - $pos.parentOffset
    const text = doc.textBetween(blockStart, cursor, '', '')
    return { text, blockStart }
  } catch {
    return null
  }
}

interface GlossaryMatchKey {
  text: string
  kind: 'former' | 'title'
  currentTitles: string[]
}

function collectGlossaryMatchKeys(): GlossaryMatchKey[] {
  const host = getHostTermTitle()
  const keys: GlossaryMatchKey[] = []
  const formerMap = collectFormerTitleMap()
  for (const [former, currents] of formerMap) {
    if (!former || !currents.length) continue
    // 弹窗描述内：曾用名若等于当前词条标题，不提示
    if (host && former === host) continue
    keys.push({ text: former, kind: 'former', currentTitles: [...currents] })
  }
  for (const title of collectStoreTitles()) {
    if (!title) continue
    // 已是曾用名的不再当正式标题键重复
    if (formerMap.has(title)) continue
    // 弹窗描述内：不把自身标题当确认候选
    if (host && title === host) continue
    keys.push({ text: title, kind: 'title', currentTitles: [title] })
  }
  return keys
}

function longestExactSuffix(
  text: string,
  keys: GlossaryMatchKey[],
): GlossaryMatchKey | null {
  let best: GlossaryMatchKey | null = null
  for (const k of keys) {
    if (!k.text || !text.endsWith(k.text)) continue
    if (!best || k.text.length > best.text.length) best = k
  }
  return best
}

/** 当前串仍是某个词条/曾用名的前缀（还可继续输入更长匹配） */
function isPrefixOfAnyMatchKey(text: string, keys: GlossaryMatchKey[]): boolean {
  if (!text) return false
  return keys.some((k) => k.text.startsWith(text))
}

function hitFromKey(
  blockStart: number,
  matchEnd: number,
  key: GlossaryMatchKey,
  titles: string[],
):
  | { kind: 'former'; hit: FormerHitMatch }
  | { kind: 'candidate'; hit: CandidateMatch }
  | null {
  const matchStart = matchEnd - key.text.length
  if (matchStart < blockStart || matchEnd <= matchStart) return null
  if (key.kind === 'former') {
    return {
      kind: 'former',
      hit: {
        from: matchStart,
        to: matchEnd,
        formerTitle: key.text,
        currentTitles: [...key.currentTitles],
      },
    }
  }
  const host = getHostTermTitle()
  const candidates = relatedTitlesForMatch(key.text, titles).filter(
    (t) => t !== host,
  )
  return {
    kind: 'candidate',
    hit: {
      from: matchStart,
      to: matchEnd,
      matchTitle: key.text,
      candidates: candidates.length ? candidates : [key.text],
      kind: 'fallback',
    },
  }
}

/**
 * 词条描述内出现自身标题：不弹确认（正文 term 节点 / 弹窗描述编辑器）。
 */
function isOwnTitleInOwnDescription(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  matchTitle: string,
): boolean {
  const host = getHostTermTitle()
  if (host && host === matchTitle) return true
  const self = enclosingTerm(from, to, collectTermRanges(doc))
  return !!self && self.title === matchTitle
}

/**
 * 统一确认决策（同一功能的不同分支）：
 * 1. 曾用名 → 弹窗
 * 2. 完全等于现有标题且不可再延长 → 静默 term[]（本函数返回 null，交给 auto-confirm / 分词）
 * 3. 还可延长 / 相关候选 → 延迟弹窗；已最长但被抑制自动确认 → 立刻弹窗
 * 4. 自身描述同名 → 不处理
 */

function canKeyExtend(exact: GlossaryMatchKey, keys: GlossaryMatchKey[]): boolean {
  return keys.some(
    (k) => k.text.length > exact.text.length && k.text.startsWith(exact.text),
  )
}

function isFormerIgnored(
  text: string,
  fromInText: number,
  toInText: number,
  currentTitles: string[],
): boolean {
  const ignoreMap = collectIgnoreMap()
  return currentTitles.some((t) =>
    isIgnoredInText(text, fromInText, toInText, ignoreMap.get(t) || []),
  )
}

function finalizePromptResult(
  doc: ProseMirrorNode,
  result:
    | { kind: 'former'; hit: FormerHitMatch }
    | { kind: 'candidate'; hit: CandidateMatch },
  mode: 'immediate' | 'delayed',
):
  | { kind: 'former'; hit: FormerHitMatch }
  | { kind: 'candidate'; hit: CandidateMatch }
  | null {
  if (result.kind === 'former') {
    return result
  }
  if (
    isOwnTitleInOwnDescription(
      doc,
      result.hit.from,
      result.hit.to,
      result.hit.matchTitle,
    )
  ) {
    return null
  }
  // 立刻：仅抑制自动确认时弹窗；否则静默（分词整词由 auto-confirm 处理，子串走灰线）
  if (mode === 'immediate') {
    if (!isAutoConfirmSuppressed(result.hit.matchTitle)) return null
    return result
  }
  // 延迟（还可延长）：列出相关词条供确认
  return result
}

/**
 * 边输入边校验：刚输入的新字使「最长匹配」无法再延续时立刻处理上一命中。
 * 曾用名 → 弹窗；正式标题 → 交静默确认（抑制时才弹）。
 */
export function findConfirmHitOnMatchBreak(
  doc: ProseMirrorNode,
  cursor: number,
):
  | { kind: 'former'; hit: FormerHitMatch }
  | { kind: 'candidate'; hit: CandidateMatch }
  | null {
  const ctx = textBeforeCursorInBlock(doc, cursor)
  if (!ctx || ctx.text.length < 2) return null

  const keys = collectGlossaryMatchKeys()
  if (!keys.length) return null

  const prev = ctx.text.slice(0, -1)
  const exactPrev = longestExactSuffix(prev, keys)
  if (!exactPrev) return null

  // 新串仍可能是更长词条的前缀 → 继续等
  if (isPrefixOfAnyMatchKey(ctx.text, keys)) return null

  const matchEnd = cursor - 1
  const result = hitFromKey(
    ctx.blockStart,
    matchEnd,
    exactPrev,
    Array.from(collectStoreTitles()),
  )
  if (!result) return null

  if (result.kind === 'former') {
    if (
      isFormerIgnored(
        ctx.text.slice(0, -1),
        result.hit.from - ctx.blockStart,
        result.hit.to - ctx.blockStart,
        result.hit.currentTitles,
      )
    ) {
      return null
    }
    return result
  }

  return finalizePromptResult(doc, result, 'immediate')
}

/**
 * 立刻：最长完整匹配且无法再延长。
 * 曾用名 → 弹窗；正式标题可静默则不弹。
 */
export function findConfirmHitOnMaximalMatch(
  doc: ProseMirrorNode,
  cursor: number,
):
  | { kind: 'former'; hit: FormerHitMatch }
  | { kind: 'candidate'; hit: CandidateMatch }
  | null {
  const ctx = textBeforeCursorInBlock(doc, cursor)
  if (!ctx || !ctx.text) return null

  const keys = collectGlossaryMatchKeys()
  if (!keys.length) return null

  const exact = longestExactSuffix(ctx.text, keys)
  if (!exact) return null

  // 还能拼成更长键（如 暴击 → 暴击率）→ 走延迟
  if (canKeyExtend(exact, keys)) return null

  const result = hitFromKey(
    ctx.blockStart,
    cursor,
    exact,
    Array.from(collectStoreTitles()),
  )
  if (!result) return null

  if (result.kind === 'former') {
    if (
      isFormerIgnored(
        ctx.text,
        result.hit.from - ctx.blockStart,
        result.hit.to - ctx.blockStart,
        result.hit.currentTitles,
      )
    ) {
      return null
    }
    return result
  }

  return finalizePromptResult(doc, result, 'immediate')
}

/**
 * 延迟：已完整命中但仍可延长（暴击 → 暴击率 / 暴击概率）时，停顿后弹相关确认。
 */
export function findConfirmHitOnExtendableIdle(
  doc: ProseMirrorNode,
  cursor: number,
):
  | { kind: 'former'; hit: FormerHitMatch }
  | { kind: 'candidate'; hit: CandidateMatch }
  | null {
  const ctx = textBeforeCursorInBlock(doc, cursor)
  if (!ctx || !ctx.text) return null

  const keys = collectGlossaryMatchKeys()
  if (!keys.length) return null

  const exact = longestExactSuffix(ctx.text, keys)
  if (!exact) return null
  if (!canKeyExtend(exact, keys)) return null

  const result = hitFromKey(
    ctx.blockStart,
    cursor,
    exact,
    Array.from(collectStoreTitles()),
  )
  if (!result) return null

  if (result.kind === 'former') {
    if (
      isFormerIgnored(
        ctx.text,
        result.hit.from - ctx.blockStart,
        result.hit.to - ctx.blockStart,
        result.hit.currentTitles,
      )
    ) {
      return null
    }
    return result
  }

  return finalizePromptResult(doc, result, 'delayed')
}

/**
 * 停手补扫：先立刻最长，再可延长延迟命中。
 */
export function findConfirmHitAtIdle(
  doc: ProseMirrorNode,
  cursor: number,
):
  | { kind: 'former'; hit: FormerHitMatch }
  | { kind: 'candidate'; hit: CandidateMatch }
  | null {
  return (
    findConfirmHitOnMaximalMatch(doc, cursor) ||
    findConfirmHitOnExtendableIdle(doc, cursor)
  )
}

/**
 * @deprecated 保留给点击装饰等路径
 */
export function findQuickConfirmNearCursor(
  doc: ProseMirrorNode,
  cursor: number,
):
  | { kind: 'former'; hit: FormerHitMatch }
  | { kind: 'candidate'; hit: CandidateMatch }
  | null {
  return (
    findConfirmHitOnMatchBreak(doc, cursor) ||
    findConfirmHitAtIdle(doc, cursor)
  )
}

export interface FormerHitMatch {
  from: number
  to: number
  formerTitle: string
  /** 可能对应的当前词条标题（可多个） */
  currentTitles: string[]
}

export interface TextScanResult {
  /** 可自动写成 term[] */
  autoConfirm: CandidateMatch[]
  /** 灰线兜底，需用户确认 */
  fallback: CandidateMatch[]
  /** 命中曾用名，仅提示 */
  formerHits: FormerHitMatch[]
}

/**
 * 扫描文档：曾用名提示 → 整词自动确认 → 子串灰线兜底。
 * 曾用名优先占位，避免「暴击率」被正式词「暴击」抢先包成 term[]。
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
  /** 词条弹窗描述编辑：排除自身标题（无外层 term 节点时 enclosingTerm 无效） */
  const hostTitle = getHostTermTitle()

  const autoConfirm: CandidateMatch[] = []
  const fallback: CandidateMatch[] = []
  const formerHits: FormerHitMatch[] = []
  const taken: Array<{ from: number; to: number }> = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    if (node.marks.some((m) => m.type.name === 'code')) return

    const textFrom = pos
    if (inRange(textFrom, textFrom + node.nodeSize, codeRanges)) return

    const selfTerm = enclosingTerm(textFrom, textFrom + 1, termRanges)
    const text = node.text
    const localTaken: Array<{ from: number; to: number }> = []

    // 1) 曾用名优先于正式词条：先占位，避免「暴击率」被拆成 term[暴击]
    const formerTitles = Array.from(formerMap.keys())
    if (formerTitles.length) {
      const formerSeg = findDictionaryHitsInText(text, formerTitles)
      for (const hit of formerSeg) {
        const currents = formerMap.get(hit.title) || []
        if (!currents.length) continue
        // 任一当前词条的 ignore 覆盖此处则不提示
        const ignored = currents.some((t) =>
          isIgnoredInText(text, hit.from, hit.to, ignoreMap.get(t) || []),
        )
        if (ignored) continue
        const from = textFrom + hit.from
        const to = textFrom + hit.to
        if (overlaps(from, to, taken) || overlaps(from, to, refRanges)) continue
        taken.push({ from, to })
        localTaken.push({ from: hit.from, to: hit.to })
        formerHits.push({
          from,
          to,
          formerTitle: hit.title,
          currentTitles: [...currents],
        })
      }
    }

    // 2) 正式词条整词：自动确认 / 灰线
    const segmentHits = findDictionaryHitsInText(text, titles)
    for (const hit of segmentHits) {
      if (selfTerm && selfTerm.title === hit.title) continue
      if (hostTitle && hostTitle === hit.title) continue
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
        const candidates = relatedTitlesForMatch(hit.title, titles).filter(
          (t) => t !== hostTitle,
        )
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

    // 3) 子串灰线兜底
    const fb = findSubstringFallbackHits(text, titles, localTaken)
    for (const hit of fb) {
      if (selfTerm && selfTerm.title === hit.title) continue
      if (hostTitle && hostTitle === hit.title) continue
      const ignores = ignoreMap.get(hit.title) || []
      if (isIgnoredInText(text, hit.from, hit.to, ignores)) continue
      const from = textFrom + hit.from
      const to = textFrom + hit.to
      if (overlaps(from, to, taken) || overlaps(from, to, refRanges)) continue
      // 若该子串其实已被更长整词覆盖则跳过
      taken.push({ from, to })
      const candidates = relatedTitlesForMatch(hit.title, titles).filter(
        (t) => t !== hostTitle,
      )
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

/** 曾用名提示命中（装饰用） */
export function findFormerHits(doc: ProseMirrorNode): FormerHitMatch[] {
  return scanTermMatches(doc).formerHits
}
