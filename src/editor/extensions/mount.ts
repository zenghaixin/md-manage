/**
 * 将已注册扩展的 TipTap 节点收集起来，供编辑器实例使用。
 */
import type { AnyExtension, Editor } from '@tiptap/core'
import { toStorageMarkdown } from '../blankLines'
import { getAllExtensions } from './registry'

/** 收集所有扩展贡献的 TipTap Extensions */
export function getAllTiptapExtensions(): AnyExtension[] {
  return getAllExtensions().flatMap((ext) => ext.getTiptapExtensions())
}

/**
 * 从 TipTap 编辑器读取落盘 Markdown（真空行，无 `&nbsp;` 占位）。
 */
export function readEditorMarkdown(editor: Editor | null | undefined): string {
  if (!editor || editor.isDestroyed) return ''
  return toStorageMarkdown(editor.getMarkdown())
}
