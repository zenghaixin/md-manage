/**
 * 注册编辑器视图、滚动同步、选区动作、高亮装饰。
 * 切勿直接改 ProseMirror 管理的 DOM class，否则光标进出备注会重建循环卡死。
 *
 * 注意：@tiptap/pm/view 导出的是 Decoration / DecorationSet，没有 Decorations。
 */
import { Extension } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { registerSelectionAction } from '../../../components/selection-actions'
import { requestOpenRightPanel } from '../../../editor/shellEvents'
import { applyRemarkToSelection } from './apply'
import {
  getRemarkEditorView,
  getRemarkHoverId,
  notifyRemarkUi,
  onRemarkHoverChange,
  setRemarkEditorView,
  syncRemarkPanelVisibility,
} from './bridge'
import {
  findBlockRemarkTargetAt,
  getBlockRemarkTarget,
  getNodeBlockRemarkId,
} from './blockTargets'
import { REMARK_NODE_NAME, REMARK_PANEL_MODULE_ID } from './constants'
import { isRemarkBoundaryExited } from './node'
import { ensureRemarkStyles } from './styles'

const pluginKey = new PluginKey('remarkBridge')
let actionBound = false

function bindSelectionAction() {
  if (actionBound) return
  actionBound = true
  registerSelectionAction({
    id: 'remark.add',
    label: '备注',
    order: 20,
    isVisible: (ctx) => {
      if (ctx.text.trim()) return true
      return !!findBlockRemarkTargetAt(ctx.view.state.doc, ctx.from, ctx.to)
    },
    run: (ctx) => {
      const id = applyRemarkToSelection(ctx.view, {
        from: ctx.from,
        to: ctx.to,
      })
      if (!id) return
      window.setTimeout(() => {
        requestOpenRightPanel({ moduleId: REMARK_PANEL_MODULE_ID })
      }, 180)
    },
  })
}

function findActiveRemarkRange(state: import('@tiptap/pm/state').EditorState): {
  from: number
  to: number
} | null {
  if (isRemarkBoundaryExited(state)) return null
  const { selection } = state
  if (selection instanceof NodeSelection) {
    const blockId = getNodeBlockRemarkId(selection.node)
    if (blockId) {
      return { from: selection.from, to: selection.to }
    }
  }
  const { $from, empty } = selection
  if (!empty) return null
  for (let d = $from.depth; d > 0; d -= 1) {
    if ($from.node(d).type.name !== REMARK_NODE_NAME) continue
    const from = $from.before(d)
    return { from, to: from + $from.node(d).nodeSize }
  }
  return null
}

function buildDecorations(
  state: import('@tiptap/pm/state').EditorState,
): DecorationSet {
  const decos: Decoration[] = []
  const hoverId = getRemarkHoverId()
  const active = findActiveRemarkRange(state)
  const activeFrom = active?.from ?? -1

  if (active) {
    decos.push(
      Decoration.node(active.from, active.to, {
        class: 'ext-remark-active',
      }),
    )
  }

  if (hoverId) {
    state.doc.descendants((node, pos) => {
      if (node.type.name === REMARK_NODE_NAME) {
        if (String(node.attrs.id || '') !== hoverId) return
        if (pos === activeFrom) return
        decos.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: 'ext-remark-hover',
          }),
        )
        return
      }
      if (!getBlockRemarkTarget(node.type.name)) return
      if (getNodeBlockRemarkId(node) !== hoverId) return
      if (pos === activeFrom) return
      decos.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: 'ext-remark-block-hover',
        }),
      )
    })
  }

  return DecorationSet.create(state.doc, decos)
}

export const RemarkBridgeExtension = Extension.create({
  name: 'remarkBridge',

  onCreate() {
    ensureRemarkStyles()
    bindSelectionAction()
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: (_, state) => buildDecorations(state),
          apply(tr, old, _oldState, newState) {
            if (
              tr.docChanged ||
              tr.selectionSet ||
              tr.getMeta(pluginKey)?.refresh
            ) {
              return buildDecorations(newState)
            }
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state)
          },
        },
        view(editorView) {
          setRemarkEditorView(editorView)
          const scrollParent =
            editorView.dom.closest('.overflow-auto') ||
            editorView.dom.parentElement

          const onScroll = () => notifyRemarkUi()
          const onFocusChange = () => notifyRemarkUi()
          scrollParent?.addEventListener('scroll', onScroll, { passive: true })
          editorView.dom.addEventListener('focus', onFocusChange)
          editorView.dom.addEventListener('blur', onFocusChange)

          const stopHover = onRemarkHoverChange(() => {
            if (editorView.isDestroyed) return
            editorView.dispatch(
              editorView.state.tr.setMeta(pluginKey, { refresh: true }),
            )
          })

          return {
            update(_view, prevState) {
              const docChanged = !_view.state.doc.eq(prevState.doc)
              const selChanged = !_view.state.selection.eq(prevState.selection)
              if (!docChanged && !selChanged) return
              notifyRemarkUi()
              if (docChanged) syncRemarkPanelVisibility()
            },
            destroy() {
              stopHover()
              scrollParent?.removeEventListener('scroll', onScroll)
              editorView.dom.removeEventListener('focus', onFocusChange)
              editorView.dom.removeEventListener('blur', onFocusChange)
              if (getRemarkEditorView() === editorView) {
                setRemarkEditorView(null)
              }
            },
          }
        },
      }),
    ]
  },
})
