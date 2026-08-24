/**
 * 单个词条预览弹窗：挂载 TermPreviewFloat（基于通用 DraggableFloat）。
 */
import {
  closeFloatHost,
  openFloatHost,
  type FloatHostMount,
} from '../../../../../components/draggable-float'
import { ensureTermGlossaryStyles } from '../shared/styles'
import type {
  OpenSourceFn,
  OpenTermFn,
  ResolvedTerm,
} from './dialogHtml'
import TermPreviewFloat from './TermPreviewFloat.vue'

const PREVIEW_W = 400
const PREVIEW_H = 220

export class TermDialog {
  title: string
  private onRemoved: (title: string) => void
  private bringFront: () => number
  private floatMount: FloatHostMount | null = null
  private cascadeId = ''
  private currentZ = 10000

  constructor(
    title: string,
    onRemoved: (title: string) => void,
    _onRetitle: (oldTitle: string, newTitle: string) => void,
    bringFront: () => number,
    _innerEditorExtensions?: unknown,
  ) {
    this.title = title
    this.onRemoved = onRemoved
    this.bringFront = bringFront
  }

  get isOpen() {
    return !!this.floatMount
  }

  flash() {
    this.floatMount?.host.flash?.()
  }

  focus() {
    this.currentZ = this.bringFront()
    this.floatMount?.host.setZIndex?.(this.currentZ)
  }

  show(
    term: ResolvedTerm,
    titles: string[],
    anchor: HTMLElement | null | undefined,
    onOpenSource: OpenSourceFn | undefined,
    onOpenTerm: OpenTermFn,
  ) {
    this.hide(false)
    ensureTermGlossaryStyles()

    this.title = term.title
    this.currentZ = this.bringFront()
    this.cascadeId = `term-preview:${this.title}`

    const anchorRect =
      anchor && document.body.contains(anchor)
        ? anchor.getBoundingClientRect()
        : null

    const self = this
    this.floatMount = openFloatHost({
      cascadeId: this.cascadeId,
      width: PREVIEW_W,
      height: PREVIEW_H,
      anchorRect: anchorRect
        ? {
            left: anchorRect.left,
            right: anchorRect.right,
            top: anchorRect.top,
            bottom: anchorRect.bottom,
          }
        : null,
      rootClassName: 'ext-term-preview-float-root',
      component: TermPreviewFloat,
      zIndex: this.currentZ,
      props: ({ place }) => ({
        term: { ...term },
        titles: [...titles],
        zIndex: self.currentZ,
        floatLeft: place.left,
        floatTop: place.top,
        onOpenSource,
        onOpenTerm,
        onClose: () => {
          self.hide(true)
        },
        onFocus: () => {
          self.focus()
        },
      }),
    })
  }

  syncFromResolved(term: ResolvedTerm, titles?: string[]) {
    if (!this.isOpen || !this.floatMount) return
    const nextTitle = String(term.title ?? this.title).trim() || this.title
    if (nextTitle !== this.title && this.cascadeId) {
      this.title = nextTitle
      this.cascadeId = `term-preview:${this.title}`
      this.floatMount.setCascadeId(this.cascadeId)
    } else {
      this.title = nextTitle
    }
    this.floatMount.host.syncFromResolved?.(term, titles)
  }

  hide(notify = true) {
    closeFloatHost(this.floatMount)
    this.floatMount = null
    this.cascadeId = ''
    if (notify) this.onRemoved(this.title)
  }

  destroy() {
    this.hide(false)
  }
}
