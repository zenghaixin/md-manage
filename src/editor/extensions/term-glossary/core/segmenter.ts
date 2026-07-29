/**
 * segmentit 封装：全量默认词典 + glossary 标题自定义词库。
 */
// segmentit 为 CJS，Vite/Node 下用 default 互通
import segmentitPkg from 'segmentit'
import { sanitizeTermTitle } from './syntax'

type SegmentitModule = {
  Segment: new () => SegmentInstance
  useDefault: (s: SegmentInstance) => SegmentInstance
}

const { Segment, useDefault } = segmentitPkg as unknown as SegmentitModule

interface SegmentToken {
  w: string
  p?: number
}

interface SegmentInstance {
  loadDict: (dict: string | string[]) => SegmentInstance
  doSegment: (text: string) => SegmentToken[]
  DICT?: Record<string, unknown>
}

export interface SegmentSpan {
  /** 在原文中的起点 */
  from: number
  to: number
  text: string
}

const CUSTOM_POS = '0x1000'
const CUSTOM_FREQ = '999999'

let instance: SegmentInstance | null = null
let loadedTitlesKey = ''

function ensureInstance(): SegmentInstance {
  if (!instance) {
    instance = useDefault(new Segment())
  }
  return instance
}

/** 生成 segmentit 词典行：词|词性|词频 */
export function titlesToDictLines(titles: string[]): string {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const raw of titles) {
    const t = sanitizeTermTitle(raw)
    if (!t || seen.has(t)) continue
    seen.add(t)
    // 避免把词典格式分隔符写进词面
    if (t.includes('|') || t.includes('\n')) continue
    lines.push(`${t}|${CUSTOM_POS}|${CUSTOM_FREQ}`)
  }
  return lines.join('\n')
}

/**
 * 用当前词条标题重建自定义词库（覆盖式追加高词频条目）。
 * segmentit 的 TABLE 是合并写入，重复 load 同词会覆盖属性。
 */
export function syncSegmenterTitles(titles: string[]): void {
  const unique = [
    ...new Set(titles.map(sanitizeTermTitle).filter(Boolean)),
  ].sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh'))
  const key = unique.join('\u0001')
  if (key === loadedTitlesKey && instance) return

  const seg = ensureInstance()
  const dict = titlesToDictLines(unique)
  if (dict) seg.loadDict(dict)
  loadedTitlesKey = key
}

/** 对文本分词，返回带原文偏移的片段 */
export function segmentText(text: string): SegmentSpan[] {
  if (!text) return []
  const seg = ensureInstance()
  const tokens = seg.doSegment(text) || []
  const spans: SegmentSpan[] = []
  let cursor = 0

  for (const token of tokens) {
    const w = String(token?.w ?? '')
    if (!w) continue
    let idx = text.indexOf(w, cursor)
    if (idx < 0) {
      // 容错：偶发对不齐时跳过
      continue
    }
    spans.push({ from: idx, to: idx + w.length, text: w })
    cursor = idx + w.length
  }
  return spans
}

/**
 * 在分词结果上找词表整词命中（长词优先、不重叠）。
 * 用「分词边界 + 最长标题优先」扫描，避免「暴击率」被先切成「暴击」而丢掉「率」。
 */
export function findDictionaryHitsInText(
  text: string,
  titles: string[],
): Array<{ from: number; to: number; title: string }> {
  if (!text || !titles.length) return []
  const sorted = [
    ...new Set(titles.map(sanitizeTermTitle).filter(Boolean)),
  ].sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh'))

  const spans = segmentText(text)
  const boundaries = new Set<number>([0, text.length])
  for (const span of spans) {
    boundaries.add(span.from)
    boundaries.add(span.to)
  }

  const taken: Array<{ from: number; to: number }> = []
  const hits: Array<{ from: number; to: number; title: string }> = []
  const overlaps = (from: number, to: number) =>
    taken.some((r) => from < r.to && to > r.from)

  // 无分词结果时退回纯子串最长优先（仍不重叠）
  const requireBoundary = spans.length > 0

  for (const title of sorted) {
    let from = 0
    while (from <= text.length) {
      const idx = text.indexOf(title, from)
      if (idx < 0) break
      const to = idx + title.length
      from = idx + 1
      if (requireBoundary && (!boundaries.has(idx) || !boundaries.has(to))) {
        continue
      }
      if (overlaps(idx, to)) continue
      taken.push({ from: idx, to })
      hits.push({ from: idx, to, title })
    }
  }

  return hits.sort((a, b) => a.from - b.from)
}

/**
 * 分词切不出整词，但子串命中词条 → 灰线兜底候选。
 */
export function findSubstringFallbackHits(
  text: string,
  titles: string[],
  excludeRanges: Array<{ from: number; to: number }>,
): Array<{ from: number; to: number; title: string }> {
  if (!text || !titles.length) return []
  const sorted = [...titles].sort((a, b) => b.length - a.length)
  const taken = [...excludeRanges]
  const hits: Array<{ from: number; to: number; title: string }> = []
  const overlaps = (from: number, to: number) =>
    taken.some((r) => from < r.to && to > r.from)

  for (const title of sorted) {
    if (!title) continue
    let from = 0
    while (from <= text.length) {
      const idx = text.indexOf(title, from)
      if (idx < 0) break
      const to = idx + title.length
      from = idx + 1
      if (overlaps(idx, to)) continue
      taken.push({ from: idx, to })
      hits.push({ from: idx, to, title })
    }
  }
  return hits.sort((a, b) => a.from - b.from)
}

/** 根据命中位置生成短 ignore 上下文（前一词 + 本词 + 后一词） */
export function buildShortIgnoreContext(
  text: string,
  matchFrom: number,
  matchTo: number,
): string {
  const spans = segmentText(text)
  if (!spans.length) {
    return text.slice(
      Math.max(0, matchFrom - 2),
      Math.min(text.length, matchTo + 2),
    )
  }
  let i = spans.findIndex((s) => s.from <= matchFrom && s.to >= matchTo)
  if (i < 0) {
    i = spans.findIndex((s) => s.from <= matchFrom && matchFrom < s.to)
  }
  if (i < 0) return text.slice(matchFrom, matchTo)

  const from = spans[Math.max(0, i - 1)].from
  const to = spans[Math.min(spans.length - 1, i + 1)].to
  const ctx = text.slice(from, to).trim()
  return ctx || text.slice(matchFrom, matchTo)
}
