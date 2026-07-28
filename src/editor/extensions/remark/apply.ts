/**
 * 将选区包成备注；覆盖旧备注时生成新 ID，描述用 --- 合并。
 */
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { notifyRemarkUi } from './bridge'
import { REMARK_NODE_NAME } from './constants'
import { createRemarkId } from './syntax'
import {
  getRemarkDescription,
  mergeRemarkDescriptions,
  removeRemarkDescription,
  setRemarkDescription,
} from './storage'

function collectRemarkIdsInRange(
  doc: PMNode,
  from: number,
  to: number,
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  doc.nodesBetween(from, to, (node) => {
    if (node.type.name !== REMARK_NODE_NAME) return
    const id = String(node.attrs.id || '').trim()
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  })
  return ids
}

function unwrapRemarksInRange(tr: Transaction, from: number, to: number) {
  const ops: Array<{ from: number; to: number; content: PMNode['content'] }> =
    []
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== REMARK_NODE_NAME) return
    ops.push({ from: pos, to: pos + node.nodeSize, content: node.content })
  })
  ops.sort((a, b) => b.from - a.from)
  for (const op of ops) {
    tr.replaceWith(op.from, op.to, op.content)
  }
}

export type RemarkRange = { from: number; to: number }

/**
 * 按文本块分别包裹：跨段时同一 id 的多段 remark。
 * range 可显式传入（气泡点击时选区可能已丢）。
 */
export function applyRemarkToSelection(
  view: EditorView,
  range?: RemarkRange,
): string | null {
  const { state } = view
  let from = range?.from ?? state.selection.from
  let to = range?.to ?? state.selection.to
  if (to <= from) return null
  // 边界钳制，避免选区丢失后用脏坐标
  const max = state.doc.content.size
  from = Math.max(0, Math.min(from, max))
  to = Math.max(0, Math.min(to, max))
  if (to <= from) return null

  const text = state.doc.textBetween(from, to, '')
  if (!text.trim()) return null

  const coveredIds = collectRemarkIdsInRange(state.doc, from, to)
  const newId = createRemarkId()
  const remarkType = state.schema.nodes[REMARK_NODE_NAME]
  if (!remarkType) {
    console.warn('[remark] schema 中无 remark 节点，扩展可能未注册')
    return null
  }

  const tr = state.tr
  unwrapRemarksInRange(tr, from, to)

  const map = tr.mapping
  let mappedFrom = map.map(from, 1)
  let mappedTo = map.map(to, -1)
  if (mappedTo <= mappedFrom) {
    mappedFrom = map.map(from, -1)
    mappedTo = map.map(to, 1)
  }

  const ranges: Array<{ from: number; to: number }> = []
  tr.doc.nodesBetween(mappedFrom, mappedTo, (node, pos) => {
    if (!node.isTextblock) return
    const blockFrom = pos + 1
    const blockTo = pos + node.nodeSize - 1
    const a = Math.max(blockFrom, mappedFrom)
    const b = Math.min(blockTo, mappedTo)
    if (b > a) ranges.push({ from: a, to: b })
  })
  ranges.sort((a, b) => b.from - a.from)

  for (const r of ranges) {
    const slice = tr.doc.slice(r.from, r.to)
    try {
      const wrapper = remarkType.create({ id: newId }, slice.content)
      tr.replaceWith(r.from, r.to, wrapper)
    } catch (err) {
      console.warn('[remark] wrap failed:', err)
    }
  }

  if (!tr.docChanged) {
    console.warn('[remark] 文档未变化，包裹失败', { from, to, ranges })
    return null
  }

  // 把选区放到备注内，便于立刻看见效果
  try {
    const $pos = tr.doc.resolve(Math.min(mappedFrom + 1, tr.doc.content.size))
    tr.setSelection(TextSelection.near($pos))
  } catch {
    // ignore
  }

  if (coveredIds.length) {
    mergeRemarkDescriptions(coveredIds, newId)
  } else if (!getRemarkDescription(newId)) {
    setRemarkDescription(newId, '')
  }

  view.dispatch(tr)
  try {
    view.focus()
  } catch {
    // ignore
  }
  notifyRemarkUi()
  return newId
}

export function removeRemarkById(view: EditorView, id: string) {
  const needle = String(id || '').trim()
  if (!needle) return
  const { state } = view
  const ops: Array<{ from: number; to: number; content: PMNode['content'] }> =
    []
  state.doc.descendants((node, pos) => {
    if (node.type.name !== REMARK_NODE_NAME) return
    if (String(node.attrs.id || '') !== needle) return
    ops.push({ from: pos, to: pos + node.nodeSize, content: node.content })
  })
  if (!ops.length) return
  ops.sort((a, b) => b.from - a.from)
  let tr = state.tr
  for (const op of ops) {
    tr = tr.replaceWith(op.from, op.to, op.content)
  }
  view.dispatch(tr)
  removeRemarkDescription(needle)
  notifyRemarkUi()
}
