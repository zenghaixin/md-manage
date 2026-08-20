/**
 * Markdown 编辑框 lite 扩展：StarterKit + 行首退格取消标题 + Markdown。
 * 不含主文档词条交互 / 备注等全量扩展。
 */
import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { HeadingBackspace } from './headingBackspace'
import { TermRefNode } from './extensions/term-glossary/core/model/termRef'

/** 纯 lite（无词条引用节点） */
export const MARKDOWN_FIELD_LITE_EXTENSIONS: AnyExtension[] = [
  StarterKit,
  HeadingBackspace,
  Markdown,
]

/** lite + 词条引用节点（描述里可显示/编辑 term[]） */
export const MARKDOWN_FIELD_LITE_WITH_TERM_REF: AnyExtension[] = [
  StarterKit,
  HeadingBackspace,
  TermRefNode,
  Markdown,
]

export function getMarkdownFieldLiteExtensions(opts?: {
  termRef?: boolean
}): AnyExtension[] {
  return opts?.termRef
    ? MARKDOWN_FIELD_LITE_WITH_TERM_REF
    : MARKDOWN_FIELD_LITE_EXTENSIONS
}
