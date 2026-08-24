/**
 * 编辑器快捷键气泡宿主：只接收展示内容与回调。
 * 1–9 选主项；Esc（及可选 Enter）走 esc；可选底部 secondary；可选点外侧关闭。
 */
import { KEY_PICKER_CLASS } from './constants'
import { ensureKeyPickerStyles } from './styles'

export type KeyPickerAnchor =
  | HTMLElement
  | { left: number; top: number; bottom: number; right: number }

export type KeyPickerSecondary = {
  key: string
  label: string
  onSelect: () => void
}

export type KeyPickerItem = {
  label: string
  value?: string
  /** 是否包「」；titles 快捷写法默认为 true */
  quoted?: boolean
}

export type KeyPickerShowOptions = {
  anchor: KeyPickerAnchor
  /** 顶部说明；空则不渲染 */
  label?: string
  /** 与 items 同时传时以 items 为准 */
  titles?: string[]
  items?: KeyPickerItem[]
  onPick: (value: string) => void
  secondary?: KeyPickerSecondary[]
  esc?: {
    label?: string
    onSelect?: () => void
  }
  promptKey?: string
  onDismiss?: () => void
  dismissOnOutside?: boolean
  enterAsEsc?: boolean
  /** 可选标记来源扩展，便于调试 */
  sourceId?: string
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function positionPicker(el: HTMLElement, anchor: KeyPickerAnchor) {
  const rect =
    anchor instanceof HTMLElement
      ? anchor.getBoundingClientRect()
      : {
          left: anchor.left,
          right: anchor.right,
          top: anchor.top,
          bottom: anchor.bottom,
        }
  const pad = 6
  let left = rect.left
  let top = rect.bottom + pad
  requestAnimationFrame(() => {
    const w = el.offsetWidth
    const h = el.offsetHeight
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8
    if (left < 8) left = 8
    if (top + h > window.innerHeight - 8) top = rect.top - h - pad
    if (top < 8) top = 8
    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
  })
}

export class KeyPicker {
  private el: HTMLDivElement | null = null
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null
  private onPointerDown: ((e: PointerEvent) => void) | null = null
  private bindTimer: ReturnType<typeof setTimeout> | null = null
  private promptKey = ''
  private sourceId = ''

  get isOpen() {
    return !!this.el
  }

  get currentKey() {
    return this.promptKey
  }

  /** 最近一次 show 传入的 sourceId（用于按来源关闭） */
  get currentSourceId() {
    return this.sourceId
  }

  hide() {
    if (this.bindTimer != null) {
      clearTimeout(this.bindTimer)
      this.bindTimer = null
    }
    if (this.onKeyDown) {
      document.removeEventListener('keydown', this.onKeyDown, true)
      this.onKeyDown = null
    }
    if (this.onPointerDown) {
      document.removeEventListener('pointerdown', this.onPointerDown, true)
      this.onPointerDown = null
    }
    this.el?.remove()
    this.el = null
    this.promptKey = ''
    this.sourceId = ''
  }

  show(opts: KeyPickerShowOptions) {
    this.hide()
    ensureKeyPickerStyles()

    const items: KeyPickerItem[] = opts.items?.length
      ? opts.items
      : (opts.titles || []).filter(Boolean).map((title) => ({
          label: title,
          value: title,
          quoted: true,
        }))
    if (!items.length) return

    this.promptKey = opts.promptKey || ''
    this.sourceId = String(opts.sourceId ?? '').trim()
    const el = document.createElement('div')
    el.className = KEY_PICKER_CLASS
    if (this.sourceId) el.setAttribute('data-source', this.sourceId)

    const heading = String(opts.label ?? '').trim()
    if (heading) {
      const label = document.createElement('div')
      label.className = `${KEY_PICKER_CLASS}-label`
      label.textContent = heading
      el.appendChild(label)
    }

    const pickRuns: Array<() => void> = []
    const listEl = document.createElement('div')
    listEl.className = `${KEY_PICKER_CLASS}-list`
    items.forEach((item, i) => {
      const idx = i + 1
      const value = item.value ?? item.label
      const text =
        item.quoted === true ? `「${escapeHtml(item.label)}」` : escapeHtml(item.label)
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `${KEY_PICKER_CLASS}-item`
      btn.innerHTML = `<span class="${KEY_PICKER_CLASS}-hotkey">${idx}:</span><span>${text}</span>`
      const pick = () => {
        this.hide()
        opts.onPick(value)
      }
      pickRuns.push(pick)
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        pick()
      })
      listEl.appendChild(btn)
    })
    el.appendChild(listEl)

    const runEsc = () => {
      this.hide()
      if (opts.esc?.onSelect) opts.esc.onSelect()
      else opts.onDismiss?.()
    }

    const secondaryRuns = new Map<string, () => void>()
    const foot = document.createElement('div')
    foot.className = `${KEY_PICKER_CLASS}-foot`
    for (const item of opts.secondary || []) {
      const run = () => {
        this.hide()
        item.onSelect()
      }
      secondaryRuns.set(item.key, run)
      if (item.key === '-') secondaryRuns.set('_', run)
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `${KEY_PICKER_CLASS}-item is-muted`
      btn.innerHTML = `<span class="${KEY_PICKER_CLASS}-hotkey">${escapeHtml(item.key)}:</span><span>${escapeHtml(item.label)}</span>`
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        run()
      })
      foot.appendChild(btn)
    }

    const escLabel = String(opts.esc?.label ?? '取消').trim() || '取消'
    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = `${KEY_PICKER_CLASS}-item is-muted`
    cancelBtn.innerHTML = `<span class="${KEY_PICKER_CLASS}-hotkey">Esc:</span><span>${escapeHtml(escLabel)}</span>`
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      runEsc()
    })
    foot.appendChild(cancelBtn)
    el.appendChild(foot)

    document.body.appendChild(el)
    this.el = el
    positionPicker(el, opts.anchor)
    this.bindKeys(pickRuns, secondaryRuns, runEsc, !!opts.enterAsEsc)

    if (opts.dismissOnOutside) {
      this.onPointerDown = (e: PointerEvent) => {
        const t = e.target as Node | null
        if (t && el.contains(t)) return
        this.hide()
        opts.onDismiss?.()
      }
      this.bindTimer = setTimeout(() => {
        this.bindTimer = null
        if (this.onPointerDown) {
          document.addEventListener('pointerdown', this.onPointerDown, true)
        }
      }, 0)
    }
  }

  private bindKeys(
    pickRuns: Array<() => void>,
    secondaryRuns: Map<string, () => void>,
    runEsc: () => void,
    enterAsEsc: boolean,
  ) {
    this.onKeyDown = (e: KeyboardEvent) => {
      if (!this.el) return
      if (e.isComposing) return
      if (e.key === 'Escape' || (enterAsEsc && e.key === 'Enter')) {
        e.preventDefault()
        e.stopPropagation()
        runEsc()
        return
      }
      const secondary = secondaryRuns.get(e.key)
      if (secondary) {
        e.preventDefault()
        e.stopPropagation()
        secondary()
        return
      }
      if (e.key >= '1' && e.key <= '9') {
        const i = Number(e.key) - 1
        if (i >= 0 && i < pickRuns.length) {
          e.preventDefault()
          e.stopPropagation()
          pickRuns[i]()
        }
      }
    }
    document.addEventListener('keydown', this.onKeyDown, true)
  }

  destroy() {
    this.hide()
  }
}
