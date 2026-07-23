/**
 * 自动确认：字面 term[标题] + segmentit 整词命中 → termRef 节点。
 * pendingManualConfirm 非空时该标题不自动确认（仅灰线）。
 */
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'
import { TERM_REF_NODE_NAME } from './constants'
import {
  buildShortIgnoreContext,
  clearDemotedTermContext,
  collectCodeRanges,
  collectTermRanges,
  enclosingTerm,
  inRange,
  isAutoConfirmSuppressed,
  overlaps,
  scanTermMatches,
} from './match'

interface ReplaceOp {
  from: number
  to: number
  title: string
}

function createRefNode(schema: Schema, title: string): ProseMirrorNode | null {
  const type = schema.nodes[TERM_REF_NODE_NAME]
  if (!type) return null
  return type.create({ title })
}

/** 将光标放到可输入的文本位置（不强行跨过前方的 termRef） */
export function selectionAtEditablePos(
  doc: ProseMirrorNode,
  pos: number,
): TextSelection {
  const safe = Math.max(0, Math.min(pos, doc.content.size))
  try {
    return TextSelection.near(doc.resolve(safe), 1)
  } catch {
    return TextSelection.near(doc.resolve(Math.min(1, doc.content.size)), 1)
  }
}

/** 收集字面 term[标题]（含旧版两侧空格）；待人工确认的标题跳过 */
function collectLiteralTermRefOps(doc: ProseMirrorNode): ReplaceOp[] {
  const termRanges = collectTermRanges(doc)
  const codeRanges = collectCodeRanges(doc)
  const ops: ReplaceOp[] = []
  const taken: Array<{ from: number; to: number }> = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    if (node.marks.some((m) => m.type.name === 'code')) return

    const textFrom = pos
    if (inRange(textFrom, textFrom + node.nodeSize, codeRanges)) return

    const selfTerm = enclosingTerm(textFrom, textFrom + 1, termRanges)
    const text = node.text
    const re = /( ?)term\[([^\]]+)\]( ?)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const title = m[2].trim()
      if (!title) continue
      if (isAutoConfirmSuppressed(title)) continue
      if (selfTerm && selfTerm.title === title) continue
      const from = textFrom + m.index
      const to = from + m[0].length
      if (overlaps(from, to, taken)) continue
      taken.push({ from, to })
      ops.push({ from, to, title })
    }
  })

  return ops
}

/**
 * 收集需要转为 termRef 的区间（从后往前替换）。
 * - 字面 term[]
 * - segmentit 整词 ∈ 词表
 */
export function collectAutoConfirmOps(doc: ProseMirrorNode): ReplaceOp[] {
  const literal = collectLiteralTermRefOps(doc)
  const taken = literal.map((o) => ({ from: o.from, to: o.to }))
  const { autoConfirm } = scanTermMatches(doc)

  const ops = [...literal]
  for (const hit of autoConfirm) {
    if (overlaps(hit.from, hit.to, taken)) continue
    taken.push({ from: hit.from, to: hit.to })
    ops.push({ from: hit.from, to: hit.to, title: hit.matchTitle })
  }

  return ops.sort((a, b) => b.from - a.from)
}

/** 若有可转换项则返回 transaction，否则 null */
export function buildAutoConfirmTransaction(
  tr: Transaction,
  schema: Schema,
): Transaction | null {
  const ops = collectAutoConfirmOps(tr.doc)
  if (!ops.length) return null

  const selPos = Math.max(tr.selection.anchor, tr.selection.head)
  let did = false
  let caretAfter: number | null = null

  for (const op of ops) {
    const mappedFrom = tr.mapping.map(op.from)
    const mappedTo = tr.mapping.map(op.to)
    if (mappedTo <= mappedFrom) continue
    const node = createRefNode(schema, op.title)
    if (!node) continue

    const cursorMapped = tr.mapping.map(selPos)
    const touchesCaret =
      cursorMapped >= mappedFrom && cursorMapped <= mappedTo

    tr.replaceWith(mappedFrom, mappedTo, node)
    did = true

    if (touchesCaret) {
      caretAfter = mappedFrom + node.nodeSize
    }
  }
  if (!did) return null

  try {
    const target =
      caretAfter != null ? caretAfter : tr.mapping.map(selPos)
    tr.setSelection(selectionAtEditablePos(tr.doc, target))
  } catch {
    // ignore
  }

  return tr
}

/** 用所选标题替换 [from,to) 为已确认引用 */
export function replaceRangeWithTermRef(
  tr: Transaction,
  schema: Schema,
  from: number,
  to: number,
  title: string,
): boolean {
  const node = createRefNode(schema, title)
  if (!node) return false
  const ctx = buildShortIgnoreContext(tr.doc, from, to, title)
  clearDemotedTermContext(title, ctx || title)
  clearDemotedTermContext(title, title)
  tr.replaceWith(from, to, node)
  try {
    tr.setSelection(selectionAtEditablePos(tr.doc, from + node.nodeSize))
  } catch {
    // ignore
  }
  return true
}
