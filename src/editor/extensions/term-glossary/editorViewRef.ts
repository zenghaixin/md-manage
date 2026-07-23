/**
 * 当前词条扩展所在编辑器视图（避免 renameFlow ↔ highlight 循环依赖）。
 */
import type { EditorView } from '@tiptap/pm/view'

let activeTermEditorView: EditorView | null = null

export function setActiveTermEditorView(view: EditorView | null): void {
  activeTermEditorView = view
}

export function getActiveTermEditorView(): EditorView | null {
  return activeTermEditorView
}
