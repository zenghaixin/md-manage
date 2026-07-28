/**
 * 备注行内节点：remark(id)[文本]
 *
 * 右退出：contenteditable 在「行内节点后」常把 DOM 光标甩到段末。
 * 做法：
 * 1) PM 选区停在 after(remark)（即后文「123」的开头）
 * 2) 用 domAtPos(pos, +1) 把 DOM 光标偏进后文文本节点
 * 3) view.update 里若又被甩到段末，无历史地拉回并再钉 DOM
 * 不使用 widget（会干扰光标）。
 */
import { mergeAttributes, Node } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { REMARK_NODE_NAME } from './constants'
import { ensureRemarkStyles } from './styles'
import { formatRemark } from './syntax'

const ZWSP = '\u200b'

type Side = 'before' | 'after' | null

type BoundaryState = {
  side: Side
  remarkPos: number | null
}

const boundaryKey = new PluginKey<BoundaryState>('remarkBoundary')

/** 防止 update 里 dispatch 重入 */
let syncingPark = false

function findRemarkDepth(
  $pos: import('@tiptap/pm/model').ResolvedPos,
  name: string,
): number {
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === name) return d
  }
  return -1
}

function getBoundary(state: EditorState): BoundaryState {
  return boundaryKey.getState(state) ?? { side: null, remarkPos: null }
}

function remarkBounds(
  doc: import('@tiptap/pm/model').Node,
  remarkPos: number,
  name: string,
): { before: number; start: number; end: number; after: number } | null {
  const node = doc.nodeAt(remarkPos)
  if (!node || node.type.name !== name) return null
  return {
    before: remarkPos,
    start: remarkPos + 1,
    end: remarkPos + node.nodeSize - 1,
    after: remarkPos + node.nodeSize,
  }
}

function hasZwspAt(doc: import('@tiptap/pm/model').Node, pos: number): boolean {
  if (pos < 0 || pos > doc.content.size) return false
  try {
    const $pos = doc.resolve(pos)
    return !!(
      $pos.nodeAfter?.isText && $pos.nodeAfter.text?.startsWith(ZWSP)
    )
  } catch {
    return false
  }
}

function stripZwspAt(tr: Transaction, pos: number): Transaction {
  if (!hasZwspAt(tr.doc, pos)) return tr
  return tr.delete(pos, pos + 1)
}

function dispatchTr(view: EditorView, tr: Transaction): void {
  tr.setStoredMarks([])
  view.dispatch(tr.scrollIntoView())
}

function beforeParkPos(
  doc: import('@tiptap/pm/model').Node,
  box: { before: number },
): number | null {
  if (hasZwspAt(doc, box.before - 1)) return box.before - 1
  if (hasZwspAt(doc, box.before)) return box.before
  return null
}

/** 把 DOM 光标偏进 pos 右侧的文本节点（避免停在 span 闭合边界被甩到段末） */
function forceDomCaret(view: EditorView, pos: number, side: -1 | 1 = 1): void {
  if (typeof document === 'undefined') return
  const sel = document.getSelection()
  if (!sel) return
  try {
    const max = view.state.doc.content.size
    const safe = Math.max(0, Math.min(pos, max))
    const { node, offset } = view.domAtPos(safe, side)
    if (sel.rangeCount === 1) {
      const cur = sel.getRangeAt(0)
      if (
        cur.collapsed &&
        cur.startContainer === node &&
        cur.startOffset === offset
      ) {
        return
      }
    }
    const range = document.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  } catch {
    // ignore
  }
}

function scheduleForceDom(view: EditorView, pos: number): void {
  const run = () => forceDomCaret(view, pos, 1)
  queueMicrotask(run)
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run)
  }
  window.setTimeout(run, 0)
  window.setTimeout(run, 16)
}

function selectionStillOnExitSide(
  doc: import('@tiptap/pm/model').Node,
  from: number,
  side: Side,
  box: { before: number; start: number; end: number; after: number },
  remarkPos: number,
): boolean {
  if (!side) return false
  try {
    const $remark = doc.resolve(remarkPos)
    const parentDepth = $remark.depth
    const parentStart = $remark.start(parentDepth)
    const parentEnd = $remark.end(parentDepth)
    if (from < parentStart || from > parentEnd) return false
    if (side === 'after') return from >= box.end && from <= parentEnd
    return from >= parentStart && from <= box.start
  } catch {
    return false
  }
}

function endExit(
  view: EditorView,
  opts: { caret: number; stripPark?: number },
): void {
  const { state } = view
  let tr = state.tr.setMeta(boundaryKey, {
    side: null,
    remarkPos: null,
  } satisfies BoundaryState)
  if (opts.stripPark != null) tr = stripZwspAt(tr, opts.stripPark)
  const caret = Math.max(
    0,
    Math.min(tr.mapping.map(opts.caret), tr.doc.content.size),
  )
  try {
    tr = tr.setSelection(TextSelection.create(tr.doc, caret))
  } catch {
    // ignore
  }
  dispatchTr(view, tr)
}

/**
 * 右退出：选区 = after(remark)。
 * 若备注已在段末则补 ZWSP 作为落点；否则直接停在后文开头。
 */
function exitAfter(
  view: EditorView,
  remarkPos: number,
  name: string,
): boolean {
  const { state } = view
  const box = remarkBounds(state.doc, remarkPos, name)
  if (!box || !state.schema.text) return false

  let tr = state.tr
  const $after = tr.doc.resolve(box.after)
  // 段末没有后文时才需要零宽落点
  if (!$after.nodeAfter && $after.parent.inlineContent) {
    tr = tr.insert(box.after, state.schema.text(ZWSP))
  }

  const caret = box.after
  tr = tr
    .setMeta(boundaryKey, { side: 'after', remarkPos } satisfies BoundaryState)
    .setSelection(TextSelection.create(tr.doc, caret))
  dispatchTr(view, tr)
  scheduleForceDom(view, caret)
  return true
}

function exitBefore(
  view: EditorView,
  remarkPos: number,
  name: string,
): boolean {
  const { state } = view
  const box = remarkBounds(state.doc, remarkPos, name)
  if (!box || !state.schema.text) return false

  let tr = state.tr
  let park = beforeParkPos(tr.doc, box)
  let nextRemarkPos = remarkPos
  if (park == null) {
    park = box.before
    tr = tr.insert(park, state.schema.text(ZWSP))
    nextRemarkPos = remarkPos + 1
  }
  tr = tr
    .setMeta(boundaryKey, {
      side: 'before',
      remarkPos: nextRemarkPos,
    } satisfies BoundaryState)
    .setSelection(TextSelection.create(tr.doc, park))
  dispatchTr(view, tr)
  scheduleForceDom(view, park)
  return true
}

/** 右退出态输入兜底：写到备注后 */
function insertAfterRemark(
  view: EditorView,
  text: string,
  name: string,
): boolean {
  const { state } = view
  const bound = getBoundary(state)
  if (bound.side !== 'after' || bound.remarkPos == null) return false
  const box = remarkBounds(state.doc, bound.remarkPos, name)
  if (!box) return false

  const zwsp = hasZwspAt(state.doc, box.after) ? 1 : 0
  let tr = state.tr.insertText(text, box.after, box.after + zwsp)
  const caret = box.after + text.length
  tr = tr
    .setMeta(boundaryKey, {
      side: null,
      remarkPos: null,
    } satisfies BoundaryState)
    .setSelection(TextSelection.create(tr.doc, caret))
  dispatchTr(view, tr)
  return true
}

function isPrintableKey(event: KeyboardEvent): boolean {
  if (event.isComposing || event.key === 'Process') return false
  if (event.key.length !== 1) return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  return true
}

function handleArrowRight(view: EditorView, name: string): boolean {
  const { state } = view
  const { $from, empty } = state.selection
  const bound = getBoundary(state)

  if (bound.side && bound.remarkPos != null) {
    const box = remarkBounds(state.doc, bound.remarkPos, name)
    if (
      box &&
      selectionStillOnExitSide(
        state.doc,
        state.selection.from,
        bound.side,
        box,
        bound.remarkPos,
      )
    ) {
      if (bound.side === 'after') {
        const has = hasZwspAt(state.doc, box.after)
        // 再 →：进入后文第一个字符之后
        const base = has ? box.after + 1 : box.after
        endExit(view, {
          caret: Math.min(base + 1, state.doc.content.size),
          stripPark: has ? box.after : undefined,
        })
      } else {
        const park = beforeParkPos(state.doc, box)
        endExit(view, {
          caret: box.start,
          stripPark:
            park != null && hasZwspAt(state.doc, park) ? park : undefined,
        })
      }
      return true
    }
  }

  if (!empty) return false
  if ($from.nodeAfter?.type.name === name) {
    endExit(view, { caret: $from.pos + 1 })
    return true
  }
  const depth = findRemarkDepth($from, name)
  if (depth >= 0) {
    if ($from.pos < $from.end(depth)) return false
    return exitAfter(view, $from.before(depth), name)
  }
  return false
}

function handleArrowLeft(view: EditorView, name: string): boolean {
  const { state } = view
  const { $from, empty } = state.selection
  const bound = getBoundary(state)

  if (bound.side && bound.remarkPos != null) {
    const box = remarkBounds(state.doc, bound.remarkPos, name)
    if (
      box &&
      selectionStillOnExitSide(
        state.doc,
        state.selection.from,
        bound.side,
        box,
        bound.remarkPos,
      )
    ) {
      if (bound.side === 'after') {
        endExit(view, {
          caret: box.end,
          stripPark: hasZwspAt(state.doc, box.after) ? box.after : undefined,
        })
      } else {
        const park = beforeParkPos(state.doc, box)
        const strip =
          park != null && hasZwspAt(state.doc, park) ? park : undefined
        endExit(view, {
          caret: strip ?? Math.max(0, box.before - 1),
          stripPark: strip,
        })
      }
      return true
    }
  }

  if (!empty) return false
  if ($from.nodeBefore?.type.name === name) {
    endExit(view, { caret: $from.pos - 1 })
    return true
  }
  const depth = findRemarkDepth($from, name)
  if (depth >= 0) {
    if ($from.pos > $from.start(depth)) return false
    return exitBefore(view, $from.before(depth), name)
  }
  return false
}

function handleBackspace(view: EditorView, name: string): boolean {
  const { state } = view
  const { $from, empty } = state.selection
  if (!empty) return false

  const bound = getBoundary(state)
  if (bound.side && bound.remarkPos != null) {
    const box = remarkBounds(state.doc, bound.remarkPos, name)
    if (
      box &&
      selectionStillOnExitSide(
        state.doc,
        state.selection.from,
        bound.side,
        box,
        bound.remarkPos,
      )
    ) {
      if (bound.side === 'before') {
        const park = beforeParkPos(state.doc, box)
        const strip =
          park != null && hasZwspAt(state.doc, park) ? park : undefined
        endExit(view, {
          caret: strip ?? box.before,
          stripPark: strip,
        })
        return true
      }
      endExit(view, {
        caret: box.end,
        stripPark: hasZwspAt(state.doc, box.after) ? box.after : undefined,
      })
      return true
    }
  }

  const depth = findRemarkDepth($from, name)
  if (depth < 0) return false
  if ($from.pos > $from.start(depth)) return false
  return exitBefore(view, $from.before(depth), name)
}

function appendBoundaryFix(
  state: EditorState,
  name: string,
): Transaction | null {
  const bound = getBoundary(state)
  const { $from, empty } = state.selection

  if (!bound.side) {
    if (!empty) return null
    // 仅处理左侧粘边：before(remark) → start，便于点进备注开头。
    // 不要把 after(remark) 拉回 end：加载/落在段末时会吸进最后一个备注并误高亮卡片。
    if ($from.nodeAfter?.type.name === name) {
      return state.tr
        .setSelection(TextSelection.create(state.doc, $from.pos + 1))
        .setMeta(boundaryKey, { side: null, remarkPos: null })
    }
    return null
  }

  if (bound.remarkPos == null) return null
  const box = remarkBounds(state.doc, bound.remarkPos, name)
  if (!box) {
    return state.tr.setMeta(boundaryKey, { side: null, remarkPos: null })
  }

  const park =
    bound.side === 'after' ? box.after : beforeParkPos(state.doc, box)
  if (park == null) return null

  // 清掉「零宽 + 正文」混在同一 text 节点里的 ZWSP
  try {
    const node = state.doc.resolve(park).nodeAfter
    if (!node?.isText || !node.text?.includes(ZWSP)) return null
    if (node.text === ZWSP) return null
    const cleaned = node.text.replaceAll(ZWSP, '')
    if (!cleaned) return null
    let tr = state.tr.insertText(cleaned, park, park + node.text.length)
    tr = tr.setMeta(boundaryKey, { side: null, remarkPos: null })
    tr = tr.setSelection(
      TextSelection.create(tr.doc, park + cleaned.length),
    )
    return tr
  } catch {
    return null
  }
}

/** 右退出期间：PM/DOM 被甩到段末时拉回 after(remark) */
function syncAfterPark(view: EditorView, name: string): void {
  if (syncingPark) return
  const bound = getBoundary(view.state)
  if (bound.side !== 'after' || bound.remarkPos == null) return
  const box = remarkBounds(view.state.doc, bound.remarkPos, name)
  if (!box) return

  const caret = box.after
  const from = view.state.selection.from
  if (from !== caret && from !== box.end) {
    // 仍在同段后部（被甩到段末）→ 拉回落点
    try {
      const $r = view.state.doc.resolve(bound.remarkPos)
      const parentEnd = $r.end($r.depth)
      if (from > caret && from <= parentEnd) {
        syncingPark = true
        const tr = view.state.tr
          .setSelection(TextSelection.create(view.state.doc, caret))
          .setMeta(boundaryKey, {
            side: 'after',
            remarkPos: bound.remarkPos,
          } satisfies BoundaryState)
          .setMeta('addToHistory', false)
        view.dispatch(tr)
        syncingPark = false
      }
    } catch {
      syncingPark = false
    }
  }
  forceDomCaret(view, caret, 1)
}

export function isRemarkBoundaryExited(state: EditorState): boolean {
  return getBoundary(state).side != null
}

export const RemarkNode = Node.create({
  name: REMARK_NODE_NAME,
  group: 'inline',
  inline: true,
  content: 'inline*',
  defining: false,
  selectable: false,
  priority: 1000,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-remark-id') || '',
        renderHTML: (attrs) =>
          attrs.id ? { 'data-remark-id': attrs.id } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-remark-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'ext-remark',
        'data-type': REMARK_NODE_NAME,
      }),
      0,
    ]
  },

  addProseMirrorPlugins() {
    const name = this.name
    return [
      new Plugin({
        key: boundaryKey,
        state: {
          init: (): BoundaryState => ({ side: null, remarkPos: null }),
          apply(tr, val): BoundaryState {
            const meta = tr.getMeta(boundaryKey) as BoundaryState | undefined
            if (meta && 'side' in meta) {
              return { side: meta.side, remarkPos: meta.remarkPos }
            }

            let side = val.side
            let remarkPos = val.remarkPos
            if (remarkPos != null && tr.docChanged) {
              remarkPos = tr.mapping.map(remarkPos)
            }

            if (side && remarkPos != null && tr.selectionSet) {
              const box = remarkBounds(tr.doc, remarkPos, name)
              if (!box) return { side: null, remarkPos: null }
              if (
                !selectionStillOnExitSide(
                  tr.doc,
                  tr.selection.from,
                  side,
                  box,
                  remarkPos,
                )
              ) {
                side = null
                remarkPos = null
              }
            }

            return { side, remarkPos }
          },
        },
        view(editorView) {
          const onSelChange = () => {
            if (getBoundary(editorView.state).side === 'after') {
              syncAfterPark(editorView, name)
            }
          }
          document.addEventListener('selectionchange', onSelChange)
          return {
            update(view) {
              syncAfterPark(view, name)
            },
            destroy() {
              document.removeEventListener('selectionchange', onSelChange)
            },
          }
        },
        appendTransaction(trs, _old, state) {
          if (!trs.some((t) => t.docChanged || t.selectionSet)) return null
          return appendBoundaryFix(state, name)
        },
        props: {
          handleKeyDown(view, event) {
            if (
              isPrintableKey(event) &&
              getBoundary(view.state).side === 'after'
            ) {
              if (insertAfterRemark(view, event.key, name)) {
                event.preventDefault()
                return true
              }
            }
            if (
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey
            ) {
              return false
            }
            if (event.key === 'Backspace') return handleBackspace(view, name)
            if (event.key === 'ArrowLeft') return handleArrowLeft(view, name)
            if (event.key === 'ArrowRight') return handleArrowRight(view, name)
            return false
          },
          handleTextInput(view, _from, _to, text) {
            if (getBoundary(view.state).side !== 'after') return false
            return insertAfterRemark(view, text, name)
          },
          handleDOMEvents: {
            mousedown(view) {
              const bound = getBoundary(view.state)
              if (!bound.side) return false
              view.dispatch(
                view.state.tr.setMeta(boundaryKey, {
                  side: null,
                  remarkPos: null,
                } satisfies BoundaryState),
              )
              return false
            },
            beforeinput(view, event) {
              if (getBoundary(view.state).side !== 'after') return false
              const ie = event as InputEvent
              if (ie.inputType !== 'insertText') return false
              if (view.composing) return false
              const text = ie.data
              if (!text) return false
              event.preventDefault()
              return insertAfterRemark(view, text, name)
            },
          },
          handleClickOn(view, pos, node, nodePos) {
            if (node.type.name !== name) return false
            const start = nodePos + 1
            const end = nodePos + node.nodeSize - 1
            const target = Math.max(start, Math.min(pos, end))
            const after = nodePos + node.nodeSize
            const beforePark = hasZwspAt(view.state.doc, nodePos - 1)
              ? nodePos - 1
              : undefined
            const afterPark = hasZwspAt(view.state.doc, after)
              ? after
              : undefined

            let tr = view.state.tr.setMeta(boundaryKey, {
              side: null,
              remarkPos: null,
            } satisfies BoundaryState)
            if (afterPark != null) tr = stripZwspAt(tr, afterPark)
            if (beforePark != null) {
              tr = stripZwspAt(tr, tr.mapping.map(beforePark))
            }
            try {
              tr = tr.setSelection(
                TextSelection.create(tr.doc, tr.mapping.map(target)),
              )
            } catch {
              // ignore
            }
            dispatchTr(view, tr)
            return true
          },
        },
      }),
    ]
  },

  onCreate() {
    ensureRemarkStyles()
  },

  markdownTokenName: REMARK_NODE_NAME,

  parseMarkdown: (token, helpers) => {
    const id = String((token as { id?: string }).id || '').trim()
    const content = helpers.parseInline(
      (token as { tokens?: unknown[] }).tokens || [],
    )
    return helpers.createNode(REMARK_NODE_NAME, { id }, content)
  },

  renderMarkdown: (node, helpers) => {
    const id = String(node.attrs?.id ?? '').trim()
    const inner = helpers
      .renderChildren(node.content || [])
      .replaceAll(ZWSP, '')
    return formatRemark(id, inner)
  },

  markdownTokenizer: {
    name: REMARK_NODE_NAME,
    level: 'inline',
    start(src: string) {
      return src.indexOf('remark(')
    },
    tokenize(
      src: string,
      _tokens: unknown,
      lexer: { inlineTokens: (s: string) => unknown[] },
    ) {
      const match = /^remark\(([^)]+)\)\[/.exec(src)
      if (!match) return undefined
      const id = match[1].trim()
      const openLen = match[0].length
      let i = openLen
      while (i < src.length && src[i] !== ']') i += 1
      if (i >= src.length) return undefined
      const inner = src.slice(openLen, i)
      const raw = src.slice(0, i + 1)
      return {
        type: REMARK_NODE_NAME,
        raw,
        id,
        text: inner,
        tokens: lexer.inlineTokens(inner),
      }
    },
  },
})
