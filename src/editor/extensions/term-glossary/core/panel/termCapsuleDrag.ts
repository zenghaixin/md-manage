/**
 * 右侧词条胶囊 → 正文：长按拖拽状态（非 HTML5 DataTransfer，避免与点击跳转冲突）。
 */
import type { EditorView } from '@tiptap/pm/view'
import { getActiveTermEditor } from '../shared/editorViewRef'
import { replaceRangeWithTermRef } from '../match/convert'
import { sanitizeTermTitle } from '../model/syntax'

export const TERM_CAPSULE_DRAG_MIME = 'application/x-md-manage-term'

let activeTitle = ''
let ghostEl: HTMLDivElement | null = null

export function isTermCapsuleDragging(): boolean {
  return !!activeTitle
}

export function getTermCapsuleDragTitle(): string {
  return activeTitle
}

function ensureGhost(title: string) {
  if (ghostEl) return ghostEl
  const el = document.createElement('div')
  el.className = 'glossary-term-drag-ghost'
  el.textContent = title
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  ghostEl = el
  return el
}

export function beginTermCapsuleDrag(title: string, clientX: number, clientY: number) {
  const t = sanitizeTermTitle(title)
  if (!t) return
  activeTitle = t
  document.body.classList.add('is-term-capsule-dragging')
  const el = ensureGhost(t)
  el.textContent = t
  moveTermCapsuleGhost(clientX, clientY)
}

export function moveTermCapsuleGhost(clientX: number, clientY: number) {
  if (!ghostEl) return
  ghostEl.style.left = `${Math.round(clientX + 12)}px`
  ghostEl.style.top = `${Math.round(clientY + 12)}px`
}

export function endTermCapsuleDrag() {
  activeTitle = ''
  document.body.classList.remove('is-term-capsule-dragging')
  ghostEl?.remove()
  ghostEl = null
}

/** 在编辑器坐标处插入 termRef；成功返回 true */
export function dropTermRefAtPoint(
  clientX: number,
  clientY: number,
  title?: string,
): boolean {
  const t = sanitizeTermTitle(title || activeTitle)
  endTermCapsuleDrag()
  if (!t) return false

  const editor = getActiveTermEditor()
  if (!editor || editor.isDestroyed) return false
  const view = editor.view as EditorView
  const el = document.elementFromPoint(clientX, clientY)
  if (!el || !view.dom.contains(el)) return false
  if (el.closest?.('.ext-term-title')) return false

  let coords: { pos: number; inside: number } | null = null
  try {
    coords = view.posAtCoords({ left: clientX, top: clientY })
  } catch {
    return false
  }
  if (!coords) return false
  const pos = coords.pos
  try {
    const tr = view.state.tr
    if (!replaceRangeWithTermRef(tr, view.state.schema, pos, pos, t)) {
      return false
    }
    view.dispatch(tr)
    view.focus()
    return true
  } catch {
    return false
  }
}

const STYLE_ATTR = 'data-term-capsule-drag-style'

export function ensureTermCapsuleDragStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[${STYLE_ATTR}]`)) return
  const el = document.createElement('style')
  el.setAttribute(STYLE_ATTR, '1')
  el.textContent = `
.glossary-term-drag-ghost {
  position: fixed;
  z-index: 10040;
  pointer-events: none;
  padding: 0.2rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--accent, #0d6e6e) 45%, var(--border, #c5d0d8));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent, #0d6e6e) 16%, var(--surface, #f4f7f9));
  color: var(--accent, #0d6e6e);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
  box-shadow: 0 8px 20px rgba(26, 40, 48, 0.18);
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
body.is-term-capsule-dragging {
  cursor: grabbing;
}
body.is-term-capsule-dragging .ProseMirror {
  cursor: copy;
}
`
  document.head.appendChild(el)
}
