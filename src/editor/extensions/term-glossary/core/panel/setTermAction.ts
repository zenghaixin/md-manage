/**
 * 选区「设置词条」：打开新建浮层，标题预填为选中文案；确认后将该选区包成 term[]。
 */
import { NodeSelection } from '@tiptap/pm/state'
import { registerSelectionAction } from '../../../../../components/selection-actions'
import { sanitizeTermTitle } from '../model/syntax'
import { TERM_NODE_NAME } from '../shared/constants'
import { getActiveTermEditor } from '../shared/editorViewRef'
import { openTermEditorCreate } from './termEditorPanel'

let bound = false

export function bindSetTermSelectionAction(): void {
  if (bound) return
  bound = true
  registerSelectionAction({
    id: 'term.set-term',
    label: '设置词条',
    order: 18,
    isVisible: (ctx) => {
      const title = sanitizeTermTitle(ctx.text)
      if (!title) return false
      const { selection } = ctx.view.state
      if (
        selection instanceof NodeSelection &&
        selection.node.type.name === TERM_NODE_NAME
      ) {
        return false
      }
      return true
    },
    run: (ctx) => {
      const title = sanitizeTermTitle(ctx.text)
      if (!title) return
      openTermEditorCreate({
        editor: getActiveTermEditor(),
        initialTitle: title,
        selectionFrom: ctx.from,
        selectionTo: ctx.to,
        besideRect: {
          left: ctx.coords.left,
          right: ctx.coords.right,
          top: ctx.coords.top,
          bottom: ctx.coords.bottom,
        },
      })
    },
  })
}
