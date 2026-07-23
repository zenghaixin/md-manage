/**
 * 改名时同步已确认引用：当前编辑器内 termRef / 定义块标题。
 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { TERM_NODE_NAME, TERM_REF_NODE_NAME } from './constants'
import { sanitizeTermTitle } from './syntax'

interface MarkupOp {
  from: number
  attrs: Record<string, unknown>
  typeName: string
}

function collectRewriteOps(
  doc: ProseMirrorNode,
  fromTitles: string[],
  toTitle: string,
): MarkupOp[] {
  const fromSet = new Set(
    fromTitles.map((t) => sanitizeTermTitle(t)).filter(Boolean),
  )
  const to = sanitizeTermTitle(toTitle)
  if (!to || !fromSet.size) return []

  const ops: MarkupOp[] = []
  doc.descendants((node, pos) => {
    if (
      node.type.name !== TERM_REF_NODE_NAME &&
      node.type.name !== TERM_NODE_NAME
    ) {
      return
    }
    const title = sanitizeTermTitle(node.attrs.title)
    if (!title || !fromSet.has(title) || title === to) return
    ops.push({
      from: pos,
      typeName: node.type.name,
      attrs: { ...node.attrs, title: to },
    })
  })
  return ops.sort((a, b) => b.from - a.from)
}

/** 在当前编辑器中把旧标题的已确认引用 / 定义标题改成新标题 */
export function rewriteOpenEditorTermRefs(
  view: EditorView | null | undefined,
  fromTitles: string[],
  toTitle: string,
): boolean {
  if (!view || view.isDestroyed) return false
  const ops = collectRewriteOps(view.state.doc, fromTitles, toTitle)
  if (!ops.length) return false

  let tr = view.state.tr
  for (const op of ops) {
    const node = tr.doc.nodeAt(op.from)
    if (!node || node.type.name !== op.typeName) continue
    tr = tr.setNodeMarkup(op.from, node.type, op.attrs)
  }
  if (!tr.docChanged) return false
  tr.setMeta('addToHistory', false)
  view.dispatch(tr)
  return true
}
