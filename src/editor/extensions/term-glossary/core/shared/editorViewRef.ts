/**
 * 当前词条扩展所在编辑器视图（避免 renameFlow ↔ highlight 循环依赖）。
 * 弹窗描述编辑器另设 hostTermTitle，避免描述内同名触发确认。
 */
import type { Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'

let activeTermEditorView: EditorView | null = null
let activeTermEditor: Editor | null = null
/** 词条弹窗 / 描述编辑上下文：排除自身标题，不提示确认 */
let hostTermTitle: string | null = null

export function setActiveTermEditorView(view: EditorView | null): void {
  activeTermEditorView = view
}

export function getActiveTermEditorView(): EditorView | null {
  return activeTermEditorView
}

export function setActiveTermEditor(editor: Editor | null): void {
  activeTermEditor = editor && !editor.isDestroyed ? editor : null
  if (activeTermEditor) activeTermEditorView = activeTermEditor.view
}

export function getActiveTermEditor(): Editor | null {
  if (activeTermEditor && !activeTermEditor.isDestroyed) return activeTermEditor
  return null
}

export function setHostTermTitle(title: string | null): void {
  const t = String(title ?? '').trim()
  hostTermTitle = t || null
}

export function getHostTermTitle(): string | null {
  return hostTermTitle
}
