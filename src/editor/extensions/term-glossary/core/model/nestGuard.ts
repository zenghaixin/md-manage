/**
 * 禁止词条嵌套：不可把词条拖进 / 粘贴进另一个词条。
 * 已存在的嵌套文档仍可编辑，但不允许再增加嵌套层数。
 */
import type { Node as PMNode, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { TERM_NODE_NAME } from '../shared/constants'

const pluginKey = new PluginKey('termNestGuard')

/** 文档中「落在某个词条内部的词条节点」数量 */
export function countNestedTermNodes(doc: PMNode): number {
  let count = 0
  doc.descendants((node) => {
    if (node.type.name !== TERM_NODE_NAME) return
    node.descendants((child) => {
      if (child.type.name === TERM_NODE_NAME) count += 1
    })
  })
  return count
}

function sliceHasTerm(slice: Slice): boolean {
  let found = false
  const walk = (node: PMNode) => {
    if (found) return
    if (node.type.name === TERM_NODE_NAME) {
      found = true
      return
    }
    node.forEach((child) => walk(child))
  }
  slice.content.forEach((child) => walk(child))
  return found
}

function posInsideTerm(doc: PMNode, pos: number): boolean {
  try {
    const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
    for (let d = $pos.depth; d > 0; d -= 1) {
      if ($pos.node(d).type.name === TERM_NODE_NAME) return true
    }
  } catch {
    // ignore
  }
  return false
}

export function createTermNestGuardPlugin() {
  return new Plugin({
    key: pluginKey,
    filterTransaction(tr, state) {
      if (!tr.docChanged) return true
      return countNestedTermNodes(tr.doc) <= countNestedTermNodes(state.doc)
    },
    props: {
      handleDrop(view, event, slice, _moved) {
        if (!sliceHasTerm(slice)) return false
        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })
        if (!coords) return false
        if (posInsideTerm(view.state.doc, coords.pos)) {
          event.preventDefault()
          return true
        }
        return false
      },
      handlePaste(view, _event, slice) {
        if (!sliceHasTerm(slice)) return false
        const { from } = view.state.selection
        if (posInsideTerm(view.state.doc, from)) {
          return true
        }
        return false
      },
    },
  })
}
