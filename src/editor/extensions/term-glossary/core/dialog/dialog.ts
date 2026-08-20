/**
 * 单个词条预览弹窗：挂载 TermPreviewFloat（基于通用 DraggableFloat）。
 */
import { createApp, type App } from 'vue'
import { getActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import {
  allocateCascadePlace,
  registerCascadeFloat,
  unregisterCascadeFloat,
} from '../../../../../components/floatCascade'
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
  private rootEl: HTMLDivElement | null = null
  private vueApp: App | null = null
  private cascadeId = ''
  private hostRef: {
    flash: () => void
    setZIndex: (z: number) => void
    getBoundingClientRect: () => DOMRect | null
    syncFromResolved: (term: ResolvedTerm, titles?: string[]) => void
  } | null = null
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
    return !!this.vueApp
  }

  flash() {
    this.hostRef?.flash()
  }

  focus() {
    this.currentZ = this.bringFront()
    this.hostRef?.setZIndex(this.currentZ)
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

    const place = allocateCascadePlace({
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
    })

    const root = document.createElement('div')
    root.className = 'ext-term-preview-float-root'
    document.body.appendChild(root)
    this.rootEl = root

    const self = this
    this.vueApp = createApp(TermPreviewFloat, {
      term: { ...term },
      titles: [...titles],
      zIndex: this.currentZ,
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
    })

    const pinia = getActivePinia()
    if (pinia) this.vueApp.use(pinia)
    this.vueApp.use(ElementPlus, { locale: zhCn })

    const instance = this.vueApp.mount(root) as {
      flash?: () => void
      setZIndex?: (z: number) => void
      getBoundingClientRect?: () => DOMRect | null
      syncFromResolved?: (term: ResolvedTerm, titles?: string[]) => void
    }
    this.hostRef = {
      flash: () => instance.flash?.(),
      setZIndex: (z) => instance.setZIndex?.(z),
      getBoundingClientRect: () => instance.getBoundingClientRect?.() ?? null,
      syncFromResolved: (t, ts) => instance.syncFromResolved?.(t, ts),
    }
    registerCascadeFloat(this.cascadeId, () =>
      this.hostRef?.getBoundingClientRect() ?? null,
    )
  }

  syncFromResolved(term: ResolvedTerm, titles?: string[]) {
    if (!this.isOpen) return
    const nextTitle = String(term.title ?? this.title).trim() || this.title
    if (nextTitle !== this.title && this.cascadeId) {
      unregisterCascadeFloat(this.cascadeId)
      this.title = nextTitle
      this.cascadeId = `term-preview:${this.title}`
      registerCascadeFloat(this.cascadeId, () =>
        this.hostRef?.getBoundingClientRect() ?? null,
      )
    } else {
      this.title = nextTitle
    }
    this.hostRef?.syncFromResolved(term, titles)
  }

  hide(notify = true) {
    if (this.cascadeId) {
      unregisterCascadeFloat(this.cascadeId)
      this.cascadeId = ''
    }
    if (this.vueApp) {
      try {
        this.vueApp.unmount()
      } catch {
        // ignore
      }
      this.vueApp = null
    }
    this.hostRef = null
    this.rootEl?.remove()
    this.rootEl = null
    if (notify) this.onRemoved(this.title)
  }

  destroy() {
    this.hide(false)
  }
}
