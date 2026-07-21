import type { ExtensionNode } from '../types'
import { TERM_GLOSSARY_ID } from './constants'

/**
 * 落库语法：
 * ::: term [标题]
 * 描述（可多行）
 * :::
 * 标题与结尾 `:::` 之间的全部内容均为描述。
 */
export const TERM_BLOCK_RE =
  /:::[\t ]*term[\t ]*\[([^\]]*)\]\s*([\s\S]*?)\s*:::/gi

export interface TermGlossaryAttrs {
  title: string
  description: string
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

/** 解析落库 Markdown → 内部节点 */
export function parseTermMarkdown(text: string): ExtensionNode[] {
  const nodes: ExtensionNode[] = []
  TERM_BLOCK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TERM_BLOCK_RE.exec(text)) !== null) {
    nodes.push(
      createTermNode(
        match[1].trim(),
        match[2],
        { from: match.index, to: match.index + match[0].length },
        match[0],
      ),
    )
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
  return formatTermSource(title, description)
}

/** 统一落库：标题与描述之间换行；空描述不插多余空行 */
export function formatTermSource(title: string, description: string): string {
  const desc = String(description ?? '').replace(/\n+$/g, '')
  if (!desc.trim()) return `::: term [${title}]\n:::`
  return `::: term [${title}]\n${desc}\n:::`
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 英文/数字词条用词边界，避免 HP 命中 PHP；中文等直接子串匹配 */
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

