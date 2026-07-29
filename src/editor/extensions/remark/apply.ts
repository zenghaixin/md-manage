/**
 * 将选区包成备注；覆盖旧备注时生成新 ID，描述用 --- 合并。
 * 整块目标（如词条 NodeSelection）挂节点 attrs，不包行内。
 */
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { notifyRemarkUi } from './bridge'
import {
  findBlockRemarkTargetAt,
  getBlockRemarkTarget,
  getNodeBlockRemarkId,
} from './blockTargets'
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
    if (node.type.name === REMARK_NODE_NAME) {
      const id = String(node.attrs.id || '').trim()
      if (id && !seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
      return
    }
    const blockId = getNodeBlockRemarkId(node)
    if (blockId && !seen.has(blockId)) {
      seen.add(blockId)
      ids.push(blockId)
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

function applyBlockRemark(
  view: EditorView,
  hit: { pos: number; node: PMNode; attr: string },
): string | null {
  const { state } = view
  const newId = createRemarkId()
  const oldId = String(hit.node.attrs[hit.attr] || '').trim()
  const coveredIds = oldId ? [oldId] : []

  const tr = state.tr.setNodeMarkup(hit.pos, undefined, {
    ...hit.node.attrs,
    [hit.attr]: newId,
  })

  if (coveredIds.length) {
    mergeRemarkDescriptions(coveredIds, newId)
  } else if (!getRemarkDescription(newId)) {
    setRemarkDescription(newId, '')
  }

  try {
    tr.setSelection(NodeSelection.create(tr.doc, hit.pos))
  } catch {
    // ignore
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

/**
 * 按文本块分别包裹：跨段时同一 id 的多段 remark。
 * 选中整块目标（词条等）时改为挂 attrs。
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
  const max = state.doc.content.size
  from = Math.max(0, Math.min(from, max))
  to = Math.max(0, Math.min(to, max))
  if (to <= from) return null

  const blockHit = findBlockRemarkTargetAt(state.doc, from, to)
  if (blockHit) {
    return applyBlockRemark(view, blockHit)
  }

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
  const blockOps: Array<{ pos: number; node: PMNode; attr: string }> = []

  state.doc.descendants((node, pos) => {
    if (node.type.name === REMARK_NODE_NAME) {
      if (String(node.attrs.id || '') !== needle) return
      ops.push({ from: pos, to: pos + node.nodeSize, content: node.content })
      return
    }
    const target = getBlockRemarkTarget(node.type.name)
    if (!target) return
    if (String(node.attrs[target.attr] || '') !== needle) return
    blockOps.push({ pos, node, attr: target.attr })
  })

  if (!ops.length && !blockOps.length) return

  let tr = state.tr
  ops.sort((a, b) => b.from - a.from)
  for (const op of ops) {
    tr = tr.replaceWith(op.from, op.to, op.content)
  }
  // 块 attrs：从后往前改 markup，避免 pos 错位（仅清 attr、不删节点）
  blockOps.sort((a, b) => b.pos - a.pos)
  for (const op of blockOps) {
    const mappedPos = tr.mapping.map(op.pos)
    const current = tr.doc.nodeAt(mappedPos)
    if (!current) continue
    tr = tr.setNodeMarkup(mappedPos, undefined, {
      ...current.attrs,
      [op.attr]: '',
    })
  }

  view.dispatch(tr)
  removeRemarkDescription(needle)
  notifyRemarkUi()
}

/** 正文中仍存活的备注 id（行内 + 整块） */
export function collectLiveRemarkIds(doc: PMNode): Set<string> {
  const live = new Set<string>()
  doc.descendants((node) => {
    if (node.type.name === REMARK_NODE_NAME) {
      const id = String(node.attrs.id || '').trim()
      if (id) live.add(id)
      return
    }
    const blockId = getNodeBlockRemarkId(node)
    if (blockId) live.add(blockId)
  })
  return live
}
