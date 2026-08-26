/**
 * 预览 / 编辑浮层访问词条整块备注。
 * 定义块入口在右上角「备注」；此处只负责读 id / 必要时补挂 attrs。
 */
import type { EditorView } from '@tiptap/pm/view'
import { applyRemarkToSelection } from '../../../remark/apply'
import {
  getActiveTermEditor,
  getActiveTermEditorView,
} from './editorViewRef'
import {
  findTermPosInDoc,
  getTermRemarkIdFromNode,
} from '../model/serializeDesc'

function liveView(): EditorView | null {
  const editor = getActiveTermEditor()
  if (editor && !editor.isDestroyed) return editor.view
  const view = getActiveTermEditorView()
  if (view && !view.isDestroyed) return view
  return null
}

/** 当前文档是否有该词条定义块（可挂整块备注） */
export function hasLiveTermDefinition(title: string): boolean {
  const view = liveView()
  if (!view) return false
  return !!findTermPosInDoc(view.state.doc, title)
}

/** 只读：从当前文档定义块取 remarkId */
export function lookupLiveTermRemarkId(title: string): string {
  const view = liveView()
  if (!view) return ''
  const hit = findTermPosInDoc(view.state.doc, title)
  if (!hit) return ''
  return getTermRemarkIdFromNode(hit.node)
}

/**
 * 取已有 remarkId；若定义块还没有整块备注则挂上再返回。
 * @returns 备注 id；当前文档无定义块则 ''
 */
export function ensureLiveTermRemarkId(title: string): string {
  const view = liveView()
  if (!view) return ''
  const hit = findTermPosInDoc(view.state.doc, title)
  if (!hit) return ''
  const existing = getTermRemarkIdFromNode(hit.node)
  if (existing) return existing
  const id = applyRemarkToSelection(view, {
    from: hit.pos,
    to: hit.pos + hit.node.nodeSize,
  })
  return String(id || '').trim()
}
