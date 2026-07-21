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
