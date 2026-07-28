/**
 * 备注扩展与壳层的桥：当前编辑器视图、滚动同步、悬停高亮、UI 刷新。
 */
import type { EditorView } from '@tiptap/pm/view'
import { notifyRightPanelModulesChanged } from '../../../editor/rightPanelRegistry'
import { REMARK_NODE_NAME } from './constants'
import { isRemarkBoundaryExited } from './node'

let activeView: EditorView | null = null
const uiListeners = new Set<() => void>()
let uiTimer: ReturnType<typeof setTimeout> | null = null

let hoverRemarkId = ''
const hoverListeners = new Set<() => void>()

/** 上次同步给右栏的「是否有备注」，避免无变化时刷书签 */
let lastHasRemarks: boolean | null = null

export function setRemarkEditorView(view: EditorView | null) {
  if (activeView === view) return
  activeView = view
  lastHasRemarks = null
  notifyRemarkUi()
  syncRemarkPanelVisibility()
}

export function getRemarkEditorView(): EditorView | null {
  return activeView && !activeView.isDestroyed ? activeView : null
}

/** 光标所在备注文案的 id；需编辑器聚焦且确实在备注内 */
export function getActiveRemarkId(): string {
  const view = getRemarkEditorView()
  if (!view) return ''
  try {
    if (!view.hasFocus()) return ''
  } catch {
    return ''
  }
  if (isRemarkBoundaryExited(view.state)) return ''
  const { $from, empty } = view.state.selection
  if (!empty) return ''
  for (let d = $from.depth; d > 0; d -= 1) {
    if ($from.node(d).type.name !== REMARK_NODE_NAME) continue
    return String($from.node(d).attrs.id || '').trim()
  }
  return ''
}

/** 当前编辑器正文是否含备注节点 */
export function hasRemarksInEditor(): boolean {
  const view = getRemarkEditorView()
  if (!view) return false
  let found = false
  view.state.doc.descendants((node) => {
    if (found) return false
    if (node.type.name === REMARK_NODE_NAME) {
      found = true
      return false
    }
  })
  return found
}

/** 有备注才显示右侧「备注」书签；状态变化时通知壳层 */
export function syncRemarkPanelVisibility() {
  const has = hasRemarksInEditor()
  if (lastHasRemarks === has) return
  lastHasRemarks = has
  notifyRightPanelModulesChanged()
}

export function getRemarkHoverId(): string {
  return hoverRemarkId
}

/** 右侧卡片悬停：只改状态 + 通知 decoration 刷新，禁止直接改编辑器 DOM */
export function setRemarkHoverId(id: string) {
  const next = String(id || '').trim()
  if (hoverRemarkId === next) return
  hoverRemarkId = next
  for (const fn of Array.from(hoverListeners)) {
    try {
      fn()
    } catch (err) {
      console.warn('[remark] hover listener failed:', err)
    }
  }
}

export function onRemarkHoverChange(fn: () => void): () => void {
  hoverListeners.add(fn)
  return () => hoverListeners.delete(fn)
}

export function onRemarkUiChange(fn: () => void): () => void {
  uiListeners.add(fn)
  return () => uiListeners.delete(fn)
}

/** 合并同一帧内多次刷新，避免 update 循环卡死 */
export function notifyRemarkUi() {
  if (uiTimer != null) return
  uiTimer = setTimeout(() => {
    uiTimer = null
    for (const fn of Array.from(uiListeners)) {
      try {
        fn()
      } catch (err) {
        console.warn('[remark] ui listener failed:', err)
      }
    }
  }, 32)
}
