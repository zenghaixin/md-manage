/**
 * 备注扩展与壳层的桥：当前编辑器视图、滚动同步、悬停高亮、UI 刷新。
 */
import type { EditorView } from '@tiptap/pm/view'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { notifyRightPanelModulesChanged } from '../../../editor/rightPanelRegistry'
import { requestOpenRightPanel } from '../../../editor/shellEvents'
import { getNodeBlockRemarkId } from './blockTargets'
import { REMARK_NODE_NAME, REMARK_PANEL_MODULE_ID } from './constants'
import { isRemarkBoundaryExited } from './node'
import { openRemarkFloat } from './remarkFloat'

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

/** 光标所在备注文案的 id；需编辑器聚焦且确实在备注内 / 选中整块备注节点 */
export function getActiveRemarkId(): string {
  const view = getRemarkEditorView()
  if (!view) return ''
  try {
    if (!view.hasFocus()) return ''
  } catch {
    return ''
  }
  if (isRemarkBoundaryExited(view.state)) return ''
  const { selection } = view.state
  if (selection instanceof NodeSelection) {
    const blockId = getNodeBlockRemarkId(selection.node)
    if (blockId) return blockId
  }
  const { $from, empty } = selection
  if (!empty) return ''
  for (let d = $from.depth; d > 0; d -= 1) {
    if ($from.node(d).type.name !== REMARK_NODE_NAME) continue
    return String($from.node(d).attrs.id || '').trim()
  }
  return ''
}

/** 当前编辑器正文是否含备注（行内节点或整块 attrs） */
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
    if (getNodeBlockRemarkId(node)) {
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

export type OpenRemarkOptions = {
  /** 浮层标题旁标签（如词条名） */
  label?: string
  /** 初始位置（与词条预览对齐） */
  place?: { left: number; top: number }
  /**
   * float：预览/编辑浮层入口
   * panel：正文原位置（选区气泡 / 点击备注）→ 右侧栏
   */
  ui?: 'float' | 'panel'
}

/**
 * 按备注 id 选中正文对应位置，并打开备注 UI。
 * @returns 是否在当前编辑器找到了该备注
 */
export function openRemarkById(
  id: string,
  opts: OpenRemarkOptions = {},
): boolean {
  const rid = String(id || '').trim()
  if (!rid) return false

  const view = getRemarkEditorView()
  let found = false

  if (view && !view.isDestroyed) {
    let targetPos: number | null = null
    let block = false
    view.state.doc.descendants((node, pos) => {
      if (targetPos != null) return false
      if (
        node.type.name === REMARK_NODE_NAME &&
        String(node.attrs.id || '').trim() === rid
      ) {
        targetPos = pos
        block = false
        return false
      }
      if (getNodeBlockRemarkId(node) === rid) {
        targetPos = pos
        block = true
        return false
      }
    })

    if (targetPos != null) {
      found = true
      try {
        const tr = view.state.tr
        if (block) {
          tr.setSelection(NodeSelection.create(view.state.doc, targetPos))
        } else {
          const node = view.state.doc.nodeAt(targetPos)
          const inside = targetPos + 1
          const max = node ? targetPos + node.nodeSize - 1 : inside
          tr.setSelection(
            TextSelection.create(view.state.doc, Math.min(inside, max)),
          )
        }
        view.dispatch(tr.scrollIntoView())
        view.focus()
      } catch (err) {
        console.warn('[remark] openRemarkById select failed:', err)
      }
    }
  }

  if (opts.ui === 'panel') {
    requestOpenRightPanel({ moduleId: REMARK_PANEL_MODULE_ID })
  } else {
    openRemarkFloat({
      remarkId: rid,
      label: opts.label,
      place: opts.place,
    })
  }
  notifyRemarkUi()
  return found
}
