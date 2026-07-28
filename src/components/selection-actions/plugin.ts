/**
 * 选区动作 TipTap 插件：mouseup 后收集可见动作并展示气泡。
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { isUiGestureLocked } from '../../editor/shellEvents'
import { SelectionActionBubble } from './bubble'
import { listSelectionActions } from './registry'
import { ensureSelectionActionStyles } from './styles'
import type { SelectionActionContext } from './types'

const pluginKey = new PluginKey('selectionActions')

function selectionCoords(
  view: import('@tiptap/pm/view').EditorView,
  from: number,
  to: number,
): DOMRect | null {
  try {
    const start = view.coordsAtPos(from)
    const end = view.coordsAtPos(to)
    const left = Math.min(start.left, end.left)
    const right = Math.max(start.right, end.right)
    const top = Math.min(start.top, end.top)
    const bottom = Math.max(start.bottom, end.bottom)
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect
  } catch {
    return null
  }
}

export const SelectionActionsExtension = Extension.create({
  name: 'selectionActions',

  onCreate() {
    ensureSelectionActionStyles()
  },

  addProseMirrorPlugins() {
    const bubble = new SelectionActionBubble()

    return [
      new Plugin({
        key: pluginKey,
        props: {
          handleDOMEvents: {
            mouseup: (view) => {
              if (isUiGestureLocked()) return false
              window.setTimeout(() => {
                if (isUiGestureLocked()) return
                const { from, to, empty } = view.state.selection
                if (empty || to <= from) {
                  bubble.hide()
                  return
                }
                const text = view.state.doc.textBetween(from, to, '\n')
                if (!text.trim()) {
                  bubble.hide()
                  return
                }
                const coords = selectionCoords(view, from, to)
                if (!coords) {
                  bubble.hide()
                  return
                }
                const ctx: SelectionActionContext = {
                  view,
                  from,
                  to,
                  text,
                  coords,
                }
                const visible = listSelectionActions().filter((a) => {
                  try {
                    return !!a.isVisible(ctx)
                  } catch {
                    return false
                  }
                })
                if (!visible.length) {
                  bubble.hide()
                  return
                }
                bubble.show(coords, visible, (action) => {
                  void Promise.resolve(action.run(ctx)).catch((err) => {
                    console.warn('[selection-actions] run failed:', err)
                  })
                })
              }, 0)
              return false
            },
          },
        },
        view() {
          const onDocDown = (e: MouseEvent) => {
            if (isUiGestureLocked()) return
            if (bubble.contains(e.target)) return
            bubble.hide()
          }
          document.addEventListener('mousedown', onDocDown)
          return {
            destroy() {
              document.removeEventListener('mousedown', onDocDown)
              bubble.destroy()
            },
          }
        },
      }),
    ]
  },
})
