/**
 * 将词条定义节点的描述内容序列化为 Markdown（含已确认 term[标题]）。
 * 供弹窗预览使用，避免 store 滞后或纯文本丢失标题标记。
 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TERM_NODE_NAME, TERM_REF_NODE_NAME } from './constants'
import { formatTermRef } from './syntax'

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

/** 从 ::: term 定义节点序列化描述 Markdown */
export function serializeTermDescriptionFromNode(termNode: ProseMirrorNode): string {
  if (termNode.type.name !== TERM_NODE_NAME) return ''
  return serializeBlocks(termNode)
    .join('\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\n+$/g, '')
}

/** 在文档中查找指定标题的词条定义节点 */
export function findTermNodeInDoc(
  doc: ProseMirrorNode,
  title: string,
): ProseMirrorNode | null {
  const key = String(title ?? '').trim()
  if (!key) return null
  let found: ProseMirrorNode | null = null
  doc.descendants((node) => {
    if (node.type.name !== TERM_NODE_NAME) return
    if (String(node.attrs.title ?? '').trim() !== key) return
    found = node
    return false
  })
  return found
}
