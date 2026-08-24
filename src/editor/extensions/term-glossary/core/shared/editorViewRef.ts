/**
 * 当前词条扩展所在编辑器视图（避免 renameFlow ↔ highlight 循环依赖）。
 * hostTermTitle 见 `src/editor/hostTermTitle.ts`（编辑器层，供 MarkdownField 写入）。
 */
import type { Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'

export { getHostTermTitle, setHostTermTitle } from '../../../../hostTermTitle'

let activeTermEditorView: EditorView | null = null
let activeTermEditor: Editor | null = null

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
