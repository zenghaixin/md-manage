/**
 * 当前词条扩展所在编辑器视图（避免 renameFlow ↔ highlight 循环依赖）。
 * 弹窗描述编辑器另设 hostTermTitle，避免描述内同名触发确认。
 */
import type { EditorView } from '@tiptap/pm/view'

let activeTermEditorView: EditorView | null = null
/** 词条弹窗 / 描述编辑上下文：排除自身标题，不提示确认 */
let hostTermTitle: string | null = null

export function setActiveTermEditorView(view: EditorView | null): void {
  activeTermEditorView = view
}

export function getActiveTermEditorView(): EditorView | null {
  return activeTermEditorView
}

export function setHostTermTitle(title: string | null): void {
  const t = String(title ?? '').trim()
  hostTermTitle = t || null
}

export function getHostTermTitle(): string | null {
  return hostTermTitle
}
