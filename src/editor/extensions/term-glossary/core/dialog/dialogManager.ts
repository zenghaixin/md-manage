/**
 * 多词条预览弹窗管理：每个标题一个 TermDialog（Vue + DraggableFloat）。
 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { useGlossaryStore } from '../../../../../stores/glossary'
import { nextFloatZIndex } from '../../../../../components/draggable-float'
import { TERM_POPOVER_CLASS } from '../shared/constants'
import { collectGlossary } from '../match/match'
import { TermDialog } from './dialog'
import { resolveTerm } from './dialogHtml'
import type { OpenSourceFn } from './dialogHtml'

function allTitles(doc?: ProseMirrorNode | null): string[] {
  return Array.from(collectGlossary(doc).keys())
}

export class TermDialogManager {
  private dialogs = new Map<string, TermDialog>()
  private doc: ProseMirrorNode | null = null
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null
  private stopStoreWatch: (() => void) | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {}

  setDoc(doc: ProseMirrorNode | null, docChanged = false) {
    this.doc = doc
    if (docChanged && this.dialogs.size) this.scheduleRefresh()
  }

  private scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      this.refreshOpen()
    }, 200)
  }

  private refreshOpen() {
    if (!this.dialogs.size) return
    const titles = allTitles(this.doc)
    for (const [key, dialog] of [...this.dialogs.entries()]) {
      if (!dialog.isOpen) continue
      const term = resolveTerm(key, this.doc)
      dialog.syncFromResolved(term, titles)
    }
  }

  private ensureStoreWatch() {
    if (this.stopStoreWatch) return
    try {
      const store = useGlossaryStore()
      this.stopStoreWatch = store.$subscribe(() => {
        if (this.dialogs.size) this.scheduleRefresh()
      })
    } catch {
      // Pinia 未就绪时忽略
    }
  }

  private nextZ() {
    return nextFloatZIndex()
  }

  private ensureKeys() {
    if (this.onKeyDown) return
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !this.dialogs.size) return
      let topTitle = ''
      let topZ = -1
      for (const dialog of this.dialogs.values()) {
        const node = document.querySelector(
          `.${TERM_POPOVER_CLASS}[data-term-title="${CSS.escape(dialog.title)}"]`,
        ) as HTMLElement | null
        const z = node ? Number(node.style.zIndex || 0) : 0
        if (z >= topZ) {
          topZ = z
          topTitle = dialog.title
        }
      }
      this.dialogs.get(topTitle)?.hide()
    }
    document.addEventListener('keydown', this.onKeyDown)
  }

  open(
    title: string,
    onOpenSource?: OpenSourceFn,
    anchor?: HTMLElement | null,
  ) {
    const key = String(title ?? '').trim()
    if (!key) return

    const existing = this.dialogs.get(key)
    if (existing?.isOpen) {
      existing.focus()
      existing.flash()
      existing.syncFromResolved(resolveTerm(key, this.doc), allTitles(this.doc))
      return
    }

    this.ensureKeys()
    this.ensureStoreWatch()
    const term = resolveTerm(key, this.doc)
    const titles = allTitles(this.doc)
    const dialog = new TermDialog(
      key,
      (t) => {
        this.dialogs.delete(t)
        if (!this.dialogs.size && this.onKeyDown) {
          document.removeEventListener('keydown', this.onKeyDown)
          this.onKeyDown = null
        }
      },
      () => {},
      () => this.nextZ(),
    )
    this.dialogs.set(key, dialog)
    dialog.show(
      term,
      titles,
      anchor,
      onOpenSource,
      (nestedTitle, nestedAnchor) =>
        this.open(nestedTitle, onOpenSource, nestedAnchor),
    )
  }

  destroy() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    this.stopStoreWatch?.()
    this.stopStoreWatch = null
    for (const dialog of [...this.dialogs.values()]) {
      dialog.destroy()
    }
    this.dialogs.clear()
    if (this.onKeyDown) {
      document.removeEventListener('keydown', this.onKeyDown)
      this.onKeyDown = null
    }
  }
}
