/**
 * 跳转到来源后定位词条（按标题）。
 *
 * 严禁在 ProseMirror view.update / 事务同步栈里 dispatch selection，
 * 否则会与 plugin update 重入导致卡死。全部改为 setTimeout(0) 异步执行。
 */
import { NodeSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { TERM_NODE_NAME } from './constants'

const FLASH_MS = 1000
const RETRY_DELAYS_MS = [100, 300, 600, 1000, 1800, 2800]

export type TermFlashHandle = {
  getTitle: () => string
  flash: () => void
}

let pendingTitle: string | null = null
let lastView: EditorView | null = null
let busy = false
const handles = new Set<TermFlashHandle>()
const retryTimers: Array<ReturnType<typeof setTimeout>> = []

function clearRetries() {
  for (const t of retryTimers.splice(0)) clearTimeout(t)
}

function matchHandle(termTitle: string): TermFlashHandle | null {
  const key = termTitle.trim()
  if (!key) return null
  for (const h of handles) {
    if (h.getTitle().trim() === key) return h
  }
  return null
}

function selectInView(view: EditorView, termTitle: string): boolean {
  if (view.isDestroyed) return false
  let targetPos: number | null = null
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== TERM_NODE_NAME) return
    if (String(node.attrs.title ?? '').trim() === termTitle) {
      targetPos = pos
      return false
    }
  })
  if (targetPos == null) return false
  try {
    const sel = NodeSelection.create(view.state.doc, targetPos)
    view.dispatch(view.state.tr.setSelection(sel).scrollIntoView())
    return true
  } catch {
    return false
  }
}

/** 仅保存 view，不在 update 栈内尝试 flash */
export function bindTermFlashView(view: EditorView | null): void {
  lastView = view
}

export function registerTermFlashHandle(handle: TermFlashHandle): () => void {
  handles.add(handle)
  if (pendingTitle) scheduleAttempt(0)
  return () => {
    handles.delete(handle)
  }
}

function runAttempt(): boolean {
  const termTitle = pendingTitle
  if (!termTitle || busy) return false

  const handle = matchHandle(termTitle)
  if (handle) {
    pendingTitle = null
    clearRetries()
    busy = true
    setTimeout(() => {
      try {
        handle.flash()
      } finally {
        setTimeout(() => {
          busy = false
        }, FLASH_MS + 50)
      }
    }, 0)
    return true
  }

  if (lastView && !lastView.isDestroyed && selectInView(lastView, termTitle)) {
    pendingTitle = null
    clearRetries()
    return true
  }

  return false
}

function scheduleAttempt(delayMs: number) {
  retryTimers.push(
    setTimeout(() => {
      runAttempt()
    }, delayMs),
  )
}

export function queueTermFlash(termTitle: string): void {
  const key = String(termTitle ?? '').trim()
  if (!key) return
  pendingTitle = key
  clearRetries()
  for (const ms of RETRY_DELAYS_MS) scheduleAttempt(ms)
}

/** @deprecated 保留给旧调用 */
export function tryFlashPendingTerm(): boolean {
  return runAttempt()
}

export { FLASH_MS }
