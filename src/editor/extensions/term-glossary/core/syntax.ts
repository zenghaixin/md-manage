import type { ExtensionNode } from '../../types'
import { TERM_GLOSSARY_ID } from './constants'

/**
 * 落库语法（定义）：
 * ::: term [标题]
 * 描述（可多行）
 * :::
 * 可选整块备注：`::: term [标题] {remark:r_xxx}`
 * 注意：`term` 与 `[标题]` 之间有空格。
 *
 * 落库语法（已确认引用）：
 * term[标题]
 * `term` 与 `[` 之间无空格；引用两侧不加空格。
 */
export const TERM_BLOCK_RE =
  /:::[\t ]*term[\t ]*\[([^\]]*)\](?:[\t ]*\{([^}]*)\})?\s*([\s\S]*?)\s*:::/gi

/** 行内已确认引用：可选两侧空白 + term[标题]（兼容旧落库） */
export const TERM_REF_RE = / ?term\[([^\]]+)\] ?/g

export interface TermGlossaryAttrs {
  title: string
  description: string
  /** 整块备注 id；落库为开场行 `{remark:id}` */
  remarkId?: string
}

/**
 * 标题清洗：去掉 markdown / 自定义语法痕迹，只留可读纯文本。
 * 空结果表示不应进入词库。
 */
export function sanitizeTermTitle(raw: unknown): string {
  let s = String(raw ?? '').replace(/\u00a0/g, ' ').trim()
  if (!s) return ''
  // 去掉常见 markdown 包裹
  s = s.replace(/^#{1,6}\s+/, '')
  s = s.replace(/^\*\*(.+)\*\*$/u, '$1')
  s = s.replace(/^__(.+)__$/u, '$1')
  s = s.replace(/^\*(.+)\*$/u, '$1')
  s = s.replace(/^_(.+)_$/u, '$1')
  s = s.replace(/^`(.+)`$/u, '$1')
  s = s.replace(/^\[(.+)\]$/u, '$1')
  // 误写成 term[x] 时提取内部
  const termRef = /^term\[([^\]]+)\]$/i.exec(s)
  if (termRef) s = termRef[1].trim()
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export function normalizeFormerTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const s = sanitizeTermTitle(item)
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

export function createTermNode(
  title: string,
  description: string,
  range?: { from: number; to: number },
  raw?: string,
): ExtensionNode {
  return {
    type: 'term',
    extensionId: TERM_GLOSSARY_ID,
    attrs: { title, description } satisfies TermGlossaryAttrs,
    content: description,
    range,
    raw,
  }
}

/** 从开场行 `{…}` 内解析 remark id */
export function parseTermRemarkIdFromBrace(inner: string): string {
  const m = /\bremark\s*:\s*([A-Za-z0-9_-]+)/i.exec(String(inner || ''))
  return m?.[1]?.trim() || ''
}

/** 解析落库 Markdown → 内部节点（仅定义块） */
export function parseTermMarkdown(text: string): ExtensionNode[] {
  const nodes: ExtensionNode[] = []
  TERM_BLOCK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TERM_BLOCK_RE.exec(text)) !== null) {
    const title = sanitizeTermTitle(match[1])
    if (!title) continue
    const remarkId = parseTermRemarkIdFromBrace(match[2] || '')
    const description = match[3] ?? ''
    const node = createTermNode(
      title,
      description,
      { from: match.index, to: match.index + match[0].length },
      match[0],
    )
    if (remarkId) node.attrs.remarkId = remarkId
    nodes.push(node)
  }
  return nodes
}

/** 内部节点 → 落库 Markdown */
export function serializeTermMarkdown(node: ExtensionNode): string {
  if (node.extensionId !== TERM_GLOSSARY_ID) {
    throw new Error(
      `[${TERM_GLOSSARY_ID}] cannot serialize node from ${node.extensionId}`,
    )
  }
  const title = String(node.attrs.title ?? '').trim()
  const description = String(node.attrs.description ?? node.content ?? '')
  const remarkId = String(node.attrs.remarkId ?? '').trim()
  return formatTermSource(title, description, remarkId)
}

/** 统一落库：标题与描述之间换行；空描述不插多余空行；可选 `{remark:id}` */
export function formatTermSource(
  title: string,
  description: string,
  remarkId?: string,
): string {
  const desc = String(description ?? '').replace(/\n+$/g, '')
  const id = String(remarkId ?? '').trim()
  const open = id
    ? `::: term [${title}] {remark:${id}}`
    : `::: term [${title}]`
  if (!desc.trim()) return `${open}\n:::`
  return `${open}\n${desc}\n:::`
}

/** 已确认引用落库形态（无两侧空格） */
export function formatTermRef(title: string): string {
  return `term[${sanitizeTermTitle(title) || String(title ?? '').trim()}]`
}

/**
 * 替换文档中指定标题的词条块；若标题变更则写入新标题。
 * 找不到则原样返回。
 */
export function replaceTermBlock(
  markdown: string,
  oldTitle: string,
  newTitle: string,
  newDescription: string,
): string {
  const target = String(oldTitle ?? '').trim()
  if (!target) return markdown
  const re = new RegExp(TERM_BLOCK_RE.source, 'gi')
  let found = false
  const next = markdown.replace(
    re,
    (full, title: string, braceInner: string) => {
      if (String(title).trim() !== target) return full
      found = true
      const remarkId = parseTermRemarkIdFromBrace(braceInner || '')
      return formatTermSource(newTitle, newDescription, remarkId)
    },
  )
  return found ? next : markdown
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 英文/数字词条用词边界，避免 HP 命中 PHP；中文等直接子串匹配（灰线兜底用） */
export function titlePattern(title: string): RegExp {
  const escaped = escapeRegExp(title)
  if (/^[A-Za-z0-9_]+$/.test(title)) {
    return new RegExp(`\\b${escaped}\\b`, 'g')
  }
  return new RegExp(escaped, 'g')
}

/**
 * 在文本中查找命中的词条标题（长词优先、不重叠）。
 * @param excludeTitle 排除自身标题（词条描述内不关联自己）
 */
export function findTitlesInText(
  text: string,
  titles: string[],
  excludeTitle?: string,
): string[] {
  if (!text || !titles.length) return []
  const sorted = [...titles]
    .filter((t) => t && t !== excludeTitle)
    .sort((a, b) => b.length - a.length)
  const taken: Array<{ from: number; to: number }> = []
  const found: string[] = []

  for (const title of sorted) {
    const re = titlePattern(title)
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const from = m.index
      const to = from + m[0].length
      if (taken.some((r) => from < r.to && to > r.from)) continue
      taken.push({ from, to })
      if (!found.includes(title)) found.push(title)
      break
    }
  }
  return found
}

/**
 * 候选列表：所有标题包含最长命中 S 的词条。
 * 唯一时仅一项；多项（如 气/魔气/真气）供用户选择。
 */
export function relatedTitlesForMatch(matchTitle: string, allTitles: string[]): string[] {
  const s = String(matchTitle ?? '').trim()
  if (!s) return []
  return allTitles
    .filter((t) => t.includes(s))
    .sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh'))
}

/**
 * 选中文案中包含的词条标题（用于「不是词条」写入 ignoreContexts）。
 */
export function titlesContainedInText(text: string, allTitles: string[]): string[] {
  const value = String(text ?? '')
  if (!value || !allTitles.length) return []
  return allTitles
    .filter((t) => t && value.includes(t))
    .sort((a, b) => b.length - a.length)
}

/** 规范化 ignoreContexts */
export function normalizeIgnoreContexts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const s = String(item ?? '').trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

/** 改名冲突待处理项（与冲突抽屉 / rename-sync 结构一致） */
export interface PendingConflictItem {
  id: string
  sourcePath: string
  kind: string
  hit: string
  context: string
  from: number
  to: number
}

/**
 * 规范化 pendingManualConfirm。
 * 旧版 boolean true/false → []（无缓存冲突则恢复自动确认）。
 */
export function normalizePendingManualConfirm(
  value: unknown,
): PendingConflictItem[] {
  if (!Array.isArray(value)) return []
  const out: PendingConflictItem[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const id = String(item.id ?? '').trim()
    const sourcePath = String(item.sourcePath ?? '').trim()
    const hit = String(item.hit ?? '').trim()
    if (!id || !sourcePath || !hit || seen.has(id)) continue
    const from = Number(item.from)
    const to = Number(item.to)
    seen.add(id)
    out.push({
      id,
      sourcePath,
      kind: String(item.kind ?? '').trim() || 'new-title',
      hit,
      context: String(item.context ?? '').trim() || hit,
      from: Number.isFinite(from) ? from : 0,
      to: Number.isFinite(to) ? to : 0,
    })
  }
  return out
}

export function hasPendingManualConfirm(value: unknown): boolean {
  return normalizePendingManualConfirm(value).length > 0
}

const TERM_REF_PLACEHOLDER = (i: number) => `§§TERMREF${i}§§`

/** 渲染 Markdown 前保护 term[标题]，避免被 GFM 当成链接引用 */
export function protectTermRefs(markdown: string): {
  text: string
  titles: string[]
} {
  const titles: string[] = []
  const text = String(markdown ?? '').replace(/ ?term\[([^\]]+)\] ?/g, (_full, title: string) => {
    const t = String(title ?? '').trim()
    const i = titles.length
    titles.push(t)
    return TERM_REF_PLACEHOLDER(i)
  })
  return { text, titles }
}

export function restoreTermRefPlaceholders(
  html: string,
  titles: string[],
): string {
  return String(html ?? '').replace(/§§TERMREF(\d+)§§/g, (_full, idx: string) => {
    const title = titles[Number(idx)] || ''
    return title ? `term[${title}]` : ''
  })
}

/**
 * 在描述 Markdown 中把第一处裸命中 matchTitle 确认为 term[confirmTitle]。
 * 已有 term[...] 不会被改动。
 */
export function confirmTitleInMarkdown(
  markdown: string,
  matchTitle: string,
  confirmTitle: string,
): string {
  const match = String(matchTitle ?? '').trim()
  const confirm = String(confirmTitle ?? '').trim()
  if (!match || !confirm) return markdown

  const { text: protectedMd, titles: refs } = protectTermRefs(markdown)
  const re = titlePattern(match)
  re.lastIndex = 0
  const hit = re.exec(protectedMd)
  if (!hit) {
    return restoreTermRefPlaceholders(protectedMd, refs)
  }

  const before = protectedMd.slice(0, hit.index)
  const after = protectedMd.slice(hit.index + hit[0].length)
  const next = `${before}${formatTermRef(confirm)}${after}`
  return restoreTermRefPlaceholders(next, refs)
}
