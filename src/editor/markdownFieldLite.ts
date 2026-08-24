/**
 * Markdown 编辑框 lite 扩展：StarterKit + 行首退格取消标题 + Markdown。
 * 不含主文档词条交互 / 备注等全量扩展。
 * termRef 等 lite 节点由已注册扩展通过 getMarkdownFieldLiteExtensions 贡献。
 */
import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { HeadingBackspace } from './headingBackspace'
import { getAllMarkdownFieldLiteExtensions } from './extensions/registry'

/** 纯 lite（无扩展贡献的额外节点） */
export const MARKDOWN_FIELD_LITE_EXTENSIONS: AnyExtension[] = [
  StarterKit,
  HeadingBackspace,
  Markdown,
]

export function getMarkdownFieldLiteExtensions(opts?: {
  termRef?: boolean
}): AnyExtension[] {
  if (!opts?.termRef) return MARKDOWN_FIELD_LITE_EXTENSIONS

  const contributed = getAllMarkdownFieldLiteExtensions()
  if (!contributed.length) return MARKDOWN_FIELD_LITE_EXTENSIONS

  // StarterKit + HeadingBackspace + 扩展贡献 + Markdown（Markdown 放最后）
  return [StarterKit, HeadingBackspace, ...contributed, Markdown]
}

/** @deprecated 使用 getMarkdownFieldLiteExtensions({ termRef: true }) */
export function getMarkdownFieldLiteWithTermRefExtensions(): AnyExtension[] {
  return getMarkdownFieldLiteExtensions({ termRef: true })
}
