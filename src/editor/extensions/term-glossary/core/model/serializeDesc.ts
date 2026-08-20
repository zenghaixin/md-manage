/**
 * 将词条定义节点的描述内容序列化为 Markdown（含已确认 term[标题]）。
 * 供弹窗预览使用，避免 store 滞后或纯文本丢失标题标记。
 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TERM_NODE_NAME, TERM_REF_NODE_NAME } from '../shared/constants'
import { formatTermRef, peelRemarkBraceFromDescription, sanitizeTermTitle } from './syntax'

function serializeInline(node: ProseMirrorNode): string {
  let out = ''
  node.forEach((child) => {
    if (child.type.name === TERM_REF_NODE_NAME) {
      const title = String(child.attrs.title ?? '').trim()
      out += title ? formatTermRef(title) : ''
      return
    }
    if (child.type.name === 'hardBreak') {
      out += '  \n'
      return
    }
    if (child.isText) {
      let text = child.text || ''
      const marks = child.marks.map((m) => m.type.name)
      if (marks.includes('code')) {
        out += `\`${text}\``
        return
      }
      if (marks.includes('bold')) text = `**${text}**`
      if (marks.includes('italic')) text = `*${text}*`
      out += text
      return
    }
    if (child.content.size) {
      out += serializeInline(child)
    }
  })
  return out
}

function serializeBlocks(node: ProseMirrorNode): string[] {
  const blocks: string[] = []
  node.forEach((child) => {
    const name = child.type.name
    if (name === 'heading') {
      const level = Math.min(Math.max(Number(child.attrs.level) || 1, 1), 6)
      blocks.push(`${'#'.repeat(level)} ${serializeInline(child).trim()}`)
      return
    }
    if (name === 'paragraph') {
      blocks.push(serializeInline(child))
      return
    }
    if (name === 'codeBlock') {
      const lang = String(child.attrs.language ?? '')
      blocks.push(`\`\`\`${lang}\n${child.textContent}\n\`\`\``)
      return
    }
    if (name === 'blockquote') {
      const inner = serializeBlocks(child)
        .join('\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
      blocks.push(inner)
      return
    }
    if (name === 'bulletList' || name === 'orderedList') {
      let i = 1
      child.forEach((item) => {
        const prefix = name === 'orderedList' ? `${i}. ` : '- '
        i += 1
        const body = serializeBlocks(item).join('\n')
        const lines = body.split('\n')
        blocks.push(
          lines
            .map((line, idx) => (idx === 0 ? `${prefix}${line}` : `  ${line}`))
            .join('\n'),
        )
      })
      return
    }
    if (name === 'listItem') {
      blocks.push(...serializeBlocks(child))
      return
    }
    if (child.isTextblock) {
      blocks.push(serializeInline(child))
      return
    }
    if (child.content.size) {
      blocks.push(...serializeBlocks(child))
    }
  })
  return blocks
}

/** 原始描述块序列化（可能含误入的 `{remark:id}` 行） */
function serializeTermDescriptionRaw(termNode: ProseMirrorNode): string {
  if (termNode.type.name !== TERM_NODE_NAME) return ''
  return serializeBlocks(termNode)
    .join('\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\n+$/g, '')
}

/** 从 ::: term 定义节点序列化描述 Markdown（已剥离误入的 remark 行） */
export function serializeTermDescriptionFromNode(termNode: ProseMirrorNode): string {
  return peelRemarkBraceFromDescription(serializeTermDescriptionRaw(termNode))
    .description
}

/** 整块备注 id：优先 attrs，否则从误入 body 的 `{remark:id}` 回收 */
export function getTermRemarkIdFromNode(termNode: ProseMirrorNode): string {
  if (termNode.type.name !== TERM_NODE_NAME) return ''
  const attr = String(termNode.attrs.remarkId || '').trim()
  if (attr) return attr
  return peelRemarkBraceFromDescription(serializeTermDescriptionRaw(termNode))
    .remarkId
}

/** 在文档中查找指定标题的词条定义节点 */
export function findTermNodeInDoc(
  doc: ProseMirrorNode,
  title: string,
): ProseMirrorNode | null {
  const hit = findTermPosInDoc(doc, title)
  return hit?.node ?? null
}

/** 在文档中查找指定标题的词条定义位置 */
export function findTermPosInDoc(
  doc: ProseMirrorNode,
  title: string,
): { pos: number; node: ProseMirrorNode } | null {
  const key =
    sanitizeTermTitle(title) || String(title ?? '').trim()
  if (!key) return null
  let found: { pos: number; node: ProseMirrorNode } | null = null
  doc.descendants((node, pos) => {
    if (node.type.name !== TERM_NODE_NAME) return
    const nodeTitle =
      sanitizeTermTitle(node.attrs.title) ||
      String(node.attrs.title ?? '').trim()
    if (nodeTitle !== key) return
    found = { pos, node }
    return false
  })
  return found
}
