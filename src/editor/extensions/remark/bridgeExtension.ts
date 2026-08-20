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
import { applyRemarkToSelection } from './apply'
import {
  getActiveRemarkId,
  getRemarkEditorView,
  getRemarkHoverId,
  notifyRemarkUi,
  onRemarkHoverChange,
  openRemarkById,
  setRemarkEditorView,
  syncRemarkPanelVisibility,
} from './bridge'
import {
  findBlockRemarkTargetAt,
  getBlockRemarkTarget,
  getNodeBlockRemarkId,
} from './blockTargets'
import { REMARK_NODE_NAME } from './constants'
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
      const block = findBlockRemarkTargetAt(ctx.view.state.doc, ctx.from, ctx.to)
      // 已整块备注过的模块（如词条）：再选中不显示「备注」
      if (block) return !getNodeBlockRemarkId(block.node)
      return !!ctx.text.trim()
    },
    run: (ctx) => {
      const id = applyRemarkToSelection(ctx.view, {
        from: ctx.from,
        to: ctx.to,
      })
      if (!id) return
      // 正文原位置：右侧备注栏
      window.setTimeout(() => {
        openRemarkById(id, { ui: 'panel' })
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

          /** 点击已备注锚点（整块模块 / 行内文案）→ 打开右侧备注 */
          const onRemarkAnchorClick = (event: MouseEvent) => {
            if (event.button !== 0) return
            const target = event.target as HTMLElement | null
            if (target?.closest?.('.ext-term-actions')) return
            const hitInline = target?.closest?.('.ext-remark') as HTMLElement | null
            const hitInlineId = String(
              hitInline?.getAttribute?.('data-remark-id') || '',
            ).trim()

            window.setTimeout(() => {
              if (editorView.isDestroyed) return
              let id = ''
              const { selection } = editorView.state
              if (selection instanceof NodeSelection) {
                id = getNodeBlockRemarkId(selection.node)
              }
              if (!id) id = getActiveRemarkId()
              if (!id) id = hitInlineId
              if (!id) return
              openRemarkById(id, { ui: 'panel' })
              notifyRemarkUi()
            }, 0)
          }
          editorView.dom.addEventListener('click', onRemarkAnchorClick, true)

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
              editorView.dom.removeEventListener(
                'click',
                onRemarkAnchorClick,
                true,
              )
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
