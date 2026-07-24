/**
 * 自动确认：字面 term[标题] + segmentit 整词命中 → termRef 节点。
 * pendingManualConfirm 非空时该标题不自动确认（仅灰线）。
 */
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'
import { NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state'
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

/** 将光标放到可输入的文本位置（优先精确落点，避免选中整颗 termRef） */
export function selectionAtEditablePos(
  doc: ProseMirrorNode,
  pos: number,
): TextSelection {
  const size = doc.content.size
  const safe = Math.max(0, Math.min(pos, size))
  try {
    return TextSelection.create(doc, safe)
  } catch {
    try {
      return TextSelection.near(doc.resolve(safe), 1)
    } catch {
      return TextSelection.near(doc.resolve(Math.min(1, size)), 1)
    }
  }
}

/**
 * 确认成 termRef 后，若后方没有文本节点，插入零宽空格作为输入落点。
 * 否则中文输入法在 contenteditable=false 的 atom 段末容易整颗替换。
 * @returns 最终光标位置
 */
function placeCaretAfterTermRef(
  tr: Transaction,
  schema: Schema,
  refFrom: number,
  refNodeSize: number,
): number {
  let after = refFrom + refNodeSize
  try {
    const $after = tr.doc.resolve(after)
    if ($after.parent.inlineContent && schema.text) {
      const next = $after.nodeAfter
      if (next?.isText && next.text?.startsWith('\u200b')) {
        after += 1
      } else {
        // 始终在后方留零宽落点，避免输入法在 atom 边界整颗替换
        tr.insert(after, schema.text('\u200b'))
        after += 1
      }
    }
  } catch {
    // ignore
  }

  try {
    tr.setSelection(selectionAtEditablePos(tr.doc, after))
  } catch {
    // ignore
  }

  const sel = tr.selection
  if (
    sel instanceof NodeSelection &&
    sel.node.type.name === TERM_REF_NODE_NAME
  ) {
    try {
      tr.setSelection(selectionAtEditablePos(tr.doc, sel.to))
      return sel.to
    } catch {
      // ignore
    }
  }
  return after
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
  let caretRefFrom: number | null = null
  let caretRefSize = 1

  for (const op of ops) {
    const mappedFrom = tr.mapping.map(op.from)
    const mappedTo = tr.mapping.map(op.to)
    if (mappedTo <= mappedFrom) continue
    const node = createRefNode(schema, op.title)
    if (!node) continue

    const cursorMapped = tr.mapping.map(selPos)
    const touchesCaret =
      cursorMapped >= mappedFrom && cursorMapped <= mappedTo

    const deleted = mappedTo - mappedFrom
    tr.replaceWith(mappedFrom, mappedTo, node)
    did = true

    // 前方替换会推移已记录的光标落点
    if (caretRefFrom != null && mappedFrom < caretRefFrom) {
      caretRefFrom += node.nodeSize - deleted
    }
    if (touchesCaret) {
      caretRefFrom = mappedFrom
      caretRefSize = node.nodeSize
    }
  }
  if (!did) return null

  if (caretRefFrom != null) {
    placeCaretAfterTermRef(tr, schema, caretRefFrom, caretRefSize)
  } else {
    try {
      tr.setSelection(
        selectionAtEditablePos(tr.doc, tr.mapping.map(selPos)),
      )
    } catch {
      // ignore
    }
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
  placeCaretAfterTermRef(tr, schema, from, node.nodeSize)
  return true
}
