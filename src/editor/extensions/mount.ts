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

/** 磁盘 → 编辑器：依次应用各扩展 transformFromStorage */
export function applyFromStorageTransforms(
  markdown: string,
  path?: string,
): string {
  let md = String(markdown || '')
  for (const ext of getAllExtensions()) {
    if (typeof ext.transformFromStorage === 'function') {
      md = ext.transformFromStorage(md, path)
    }
  }
  return md
}

/** 编辑器 → 磁盘：依次应用各扩展 transformToStorage */
export function applyToStorageTransforms(
  markdown: string,
  path?: string,
): string {
  let md = String(markdown || '')
  for (const ext of getAllExtensions()) {
    if (typeof ext.transformToStorage === 'function') {
      md = ext.transformToStorage(md, path)
    }
  }
  return md
}

/**
 * 从 TipTap 编辑器读取落盘 Markdown（真空行，无 `&nbsp;` 占位）。
 */
export function readEditorMarkdown(
  editor: Editor | null | undefined,
  path?: string,
): string {
  if (!editor || editor.isDestroyed) return ''
  return applyToStorageTransforms(
    toStorageMarkdown(editor.getMarkdown()),
    path,
  )
}
