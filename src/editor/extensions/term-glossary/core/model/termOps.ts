/**
 * 词条定义块：插入位置、按 Markdown 写入/替换、删除（块 + glossary）。
 */
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { fromStorageMarkdown } from '../../../../blankLines'
import { requestSaveCurrentFile } from '../../../../shellEvents'
import { confirmAction } from '../../../../../composables/useDialog'
import { useGlossaryStore } from '../../../../../stores/glossary'
import { TERM_NODE_NAME } from '../shared/constants'
import { formatTermSource, peelRemarkBraceFromDescription, sanitizeTermTitle } from './syntax'
import {
  getTermRemarkIdFromNode,
  serializeTermDescriptionFromNode,
} from './serializeDesc'
import { normalizeTermType, type TermTypeId } from '../shared/termTypes'

/** 当前顶层块之后（「当前行下一行」） */
export function getInsertPosAfterCurrentBlock(editor: Editor): number {
  const { $from } = editor.state.selection
  if ($from.depth >= 1) return $from.after(1)
  return $from.pos
}

function clampPos(editor: Editor, pos: number): number {
  const max = editor.state.doc.content.size
  if (!Number.isFinite(pos)) return max
  return Math.max(0, Math.min(Math.floor(pos), max))
}

function findTermPosByTitleNear(
  editor: Editor,
  title: string,
  near: number,
): number | null {
  const key = sanitizeTermTitle(title)
  if (!key) return null
  const doc = editor.state.doc
  const nodeAt = doc.nodeAt(near)
  if (
    nodeAt?.type.name === TERM_NODE_NAME &&
    sanitizeTermTitle(nodeAt.attrs.title) === key
  ) {
    return near
  }
  let found: number | null = null
  let best = Infinity
  doc.descendants((node, pos) => {
    if (node.type.name !== TERM_NODE_NAME) return
    if (sanitizeTermTitle(node.attrs.title) !== key) return
    const dist = Math.abs(pos - near)
    if (dist < best) {
      best = dist
      found = pos
    }
  })
  return found
}

/** 在 at 处插入定义块，并写入 termType */
export function insertTermDefinition(
  editor: Editor,
  opts: {
    title: string
    description: string
    termType: TermTypeId | string
    at: number
  },
): boolean {
  if (editor.isDestroyed) return false
  const title = sanitizeTermTitle(opts.title)
  if (!title) return false
  const description = String(opts.description ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
  const termType = normalizeTermType(opts.termType)
  const at = clampPos(editor, opts.at)
  const md = formatTermSource(title, description)

  const ok = editor
    .chain()
    .focus()
    .insertContentAt(at, fromStorageMarkdown(md), { contentType: 'markdown' })
    .run()
  if (!ok) return false

  const pos = findTermPosByTitleNear(editor, title, at)
  if (pos == null) return true
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== TERM_NODE_NAME) return true
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      title,
      termType,
    }),
  )
  try {
    editor.chain().setNodeSelection(pos).scrollIntoView().run()
  } catch {
    // ignore
  }
  return true
}

/** 用新标题/描述/类型替换已有定义块 */
export function replaceTermDefinition(
  editor: Editor,
  opts: {
    pos: number
    title: string
    description: string
    termType: TermTypeId | string
    remarkId?: string
  },
): boolean {
  if (editor.isDestroyed) return false
  const title = sanitizeTermTitle(opts.title)
  if (!title) return false
  const node = editor.state.doc.nodeAt(opts.pos)
  if (!node || node.type.name !== TERM_NODE_NAME) return false

  const peeled = peelRemarkBraceFromDescription(
    String(opts.description ?? '').replace(/\u00a0/g, ' '),
  )
  const description = peeled.description.trim()
  const termType = normalizeTermType(opts.termType)
  const remarkId =
    String(opts.remarkId ?? '').trim() ||
    String(node.attrs.remarkId || '').trim() ||
    peeled.remarkId
  const from = opts.pos
  const to = from + node.nodeSize
  const md = formatTermSource(title, description, remarkId)

  const ok = editor
    .chain()
    .focus()
    .deleteRange({ from, to })
    .insertContentAt(from, fromStorageMarkdown(md), { contentType: 'markdown' })
    .run()
  if (!ok) return false

  const pos = findTermPosByTitleNear(editor, title, from)
  if (pos == null) return true
  const next = editor.state.doc.nodeAt(pos)
  if (!next || next.type.name !== TERM_NODE_NAME) return true
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(pos, undefined, {
      ...next.attrs,
      title,
      termType,
      remarkId,
    }),
  )
  return true
}

/**
 * 修复误入描述正文的 `{remark:id}`：写回开场行 attrs，并清理 body。
 * @returns 修复后的节点位置（可能与入参相同）
 */
export function repairTermRemarkLeak(
  editor: Editor,
  pos: number,
): number {
  if (editor.isDestroyed) return pos
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== TERM_NODE_NAME) return pos
  const cleanDesc = serializeTermDescriptionFromNode(node)
  const remarkId = getTermRemarkIdFromNode(node)
  const attrId = String(node.attrs.remarkId || '').trim()
  // 无泄漏且 attrs 已有 id：无需改写
  const rawHasLeak =
    node.textContent.includes('{remark:') || node.textContent.includes('{remark :')
  if (!rawHasLeak && attrId) return pos
  if (!rawHasLeak && !remarkId) return pos

  const title =
    sanitizeTermTitle(node.attrs.title) || String(node.attrs.title ?? '')
  const termType = normalizeTermType(node.attrs.termType)
  const ok = replaceTermDefinition(editor, {
    pos,
    title,
    description: cleanDesc,
    termType,
    remarkId,
  })
  if (!ok) return pos
  return findTermPosByTitleNear(editor, title, pos) ?? pos
}

/**
 * 删除定义块 + glossary 条目（确认后）。
 * @returns 是否已删除
 */
export async function confirmDeleteTermDefinition(
  editor: Editor,
  pos: number,
): Promise<boolean> {
  if (editor.isDestroyed) return false
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== TERM_NODE_NAME) return false
  const title =
    sanitizeTermTitle(node.attrs.title) ||
    String(node.attrs.title ?? '').trim() ||
    '（未命名）'

  const ok = await confirmAction(
    `是否删除词条「${title}」？`,
    '删除词条',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    },
  )
  if (!ok || editor.isDestroyed) return false

  const latest = editor.state.doc.nodeAt(pos)
  if (!latest || latest.type.name !== TERM_NODE_NAME) return false

  editor
    .chain()
    .focus()
    .command(({ tr, dispatch }) => {
      tr.delete(pos, pos + latest.nodeSize)
      if (dispatch) dispatch(tr.scrollIntoView())
      return true
    })
    .run()

  const key = sanitizeTermTitle(title)
  if (key) {
    try {
      await useGlossaryStore().removeTerm(key)
    } catch (err) {
      console.warn('[term] remove glossary entry failed:', err)
    }
  }
  requestSaveCurrentFile()
  return true
}

/** NodeSelection 选中词条时删 */
export async function confirmDeleteSelectedTerm(
  editor: Editor,
): Promise<boolean> {
  const { selection } = editor.state
  if (
    !(selection instanceof NodeSelection) ||
    selection.node.type.name !== TERM_NODE_NAME
  ) {
    return false
  }
  return confirmDeleteTermDefinition(editor, selection.from)
}
