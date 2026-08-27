/**
 * 词条编辑浮层描述区选区「设为词条」：打开新建浮层，标题预填为选中文案（同正文「设置词条」）。
 */
import { registerSelectionAction } from '../../../../../components/selection-actions'
import { sanitizeTermTitle } from '../model/syntax'
import { TERM_REF_NODE_NAME } from '../shared/constants'
import { openTermEditorCreateFromDesc } from './termEditorPanel'
import { isTermEditorDescView } from './termEditorDescContext'

let bound = false

export function bindConfirmTermRefSelectionAction(): void {
  if (bound) return
  bound = true
  registerSelectionAction({
    id: 'term.confirm-ref',
    label: '设为词条',
    order: 16,
    isVisible: (ctx) => {
      if (!isTermEditorDescView(ctx.view)) return false
      let inRef = false
      ctx.view.state.doc.nodesBetween(ctx.from, ctx.to, (node) => {
        if (node.type.name === TERM_REF_NODE_NAME) inRef = true
      })
      if (inRef) return false
      return !!sanitizeTermTitle(ctx.text)
    },
    run: (ctx) => {
      const title = sanitizeTermTitle(ctx.text)
      if (!title) return
      openTermEditorCreateFromDesc({
        initialTitle: title,
        descView: ctx.view,
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
