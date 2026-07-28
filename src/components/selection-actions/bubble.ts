/**
 * 选区动作气泡。
 *
 * 必须在 mousedown 同步执行动作，并锁住切文件：
 * pointer 捕获挡不住后续 mouseup/click，它们仍可能打到左侧文件树，
 * 触发 loadFile，把刚写上的备注冲掉（表现为「刷新/跳转且备注没了」）。
 */
import { beginUiGestureLock } from '../../editor/shellEvents'
import type { SelectionAction } from './types'
import { ensureSelectionActionStyles } from './styles'

const ROOT_CLASS = 'ext-selection-bubble'

export class SelectionActionBubble {
  private el: HTMLDivElement | null = null
  private picking = false
  private unlockDoc: (() => void) | null = null

  hide() {
    this.unlockDoc?.()
    this.unlockDoc = null
    this.el?.remove()
    this.el = null
  }

  show(
    anchorRect: DOMRect,
    actions: SelectionAction[],
    onPick: (action: SelectionAction) => void,
  ) {
    if (this.picking) return
    this.hide()
    ensureSelectionActionStyles()
    if (!actions.length) return

    const root = document.createElement('div')
    root.className = ROOT_CLASS
    root.setAttribute('role', 'menu')
    root.setAttribute('data-selection-bubble', '1')

    for (const action of actions) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ext-selection-bubble-item'
      btn.textContent = action.label

      btn.addEventListener('mousedown', (e) => {
        // 同步跑完动作；绝不能等 pointerup/click（那时文件树可能已收到事件）
        e.preventDefault()
        e.stopPropagation()
        ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
        if (this.picking) return
        this.picking = true

        beginUiGestureLock(500)
        this.installDocLock()
        // 兜底：即使 hide 没跑到，也务必卸掉整页事件锁，避免侧栏像「点不了/没文件」
        const failsafe = window.setTimeout(() => {
          this.hide()
          this.picking = false
        }, 400)

        try {
          onPick(action)
        } catch (err) {
          console.warn('[selection-actions] pick failed:', err)
        }

        window.setTimeout(() => {
          window.clearTimeout(failsafe)
          this.hide()
          this.picking = false
        }, 120)
      })

      // 吞掉后续事件，双保险
      for (const type of ['pointerup', 'mouseup', 'click'] as const) {
        btn.addEventListener(type, (e) => {
          e.preventDefault()
          e.stopPropagation()
        })
      }

      root.appendChild(btn)
    }

    document.body.appendChild(root)
    this.el = root

    const w = root.offsetWidth || 120
    const h = root.offsetHeight || 36
    let left = anchorRect.left + (anchorRect.width - w) / 2
    let top = anchorRect.bottom + 6
    if (left < 8) left = 8
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8
    if (top + h > window.innerHeight - 8) top = anchorRect.top - h - 6
    if (top < 8) top = 8
    root.style.left = `${Math.round(left)}px`
    root.style.top = `${Math.round(top)}px`
  }

  /** 捕获阶段吃掉整页剩余 mouse 事件，防止落到文件树 */
  private installDocLock() {
    this.unlockDoc?.()
    const eat = (e: Event) => {
      const t = e.target
      if (
        t instanceof Element &&
        t.closest?.('[data-selection-bubble="1"]')
      ) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
    }
    const types = [
      'pointerup',
      'mouseup',
      'click',
      'auxclick',
      'pointerdown',
      'mousedown',
    ] as const
    for (const type of types) {
      document.addEventListener(type, eat, true)
    }
    this.unlockDoc = () => {
      for (const type of types) {
        document.removeEventListener(type, eat, true)
      }
      this.unlockDoc = null
    }
  }

  contains(target: EventTarget | null): boolean {
    if (!this.el || !target || !(target instanceof Node)) return false
    return this.el.contains(target)
  }

  destroy() {
    this.picking = false
    this.hide()
  }
}
