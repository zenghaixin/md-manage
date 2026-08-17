import { Node, mergeAttributes } from '@tiptap/core'
import type { ResolvedPos } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import { TERM_GLOSSARY_ID, TERM_NODE_NAME } from './constants'
import { ensureTermGlossaryStyles } from './styles'
import {
  normalizeTermType,
  TERM_TYPE_BASIC,
  type TermTypeId,
} from './termTypes'
import { openTermTypePicker } from './typePickerBubble'
import { openTermEditorCreate } from './termEditorPanel'
import {
  confirmDeleteSelectedTerm,
  getInsertPosAfterCurrentBlock,
} from './termOps'
import { createTermNestGuardPlugin } from './nestGuard'
import TermNodeView from './TermNodeView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    termGlossary: {
      /** @param termType 词条类型；默认普通 → 打开右栏新建 */
      insertTermGlossary: (termType?: TermTypeId | string) => ReturnType
      /** 弹出类型选择后再打开右栏新建 */
      promptInsertTermGlossary: () => ReturnType
    }
  }
}

function findTermDepth($from: ResolvedPos, name: string): number {
  for (let d = $from.depth; d > 0; d -= 1) {
    if ($from.node(d).type.name === name) return d
  }
  return -1
}

/** 光标是否紧贴在某个 term 节点之后（用于从后方退格选中整块） */
function termPosBeforeCursor($from: ResolvedPos, name: string): number | null {
  if ($from.parentOffset !== 0) return null
  if ($from.depth < 1) return null
  const index = $from.index($from.depth - 1)
  if (index <= 0) return null
  const parent = $from.node($from.depth - 1)
  const prev = parent.child(index - 1)
  if (prev.type.name !== name) return null
  return $from.before($from.depth) - prev.nodeSize
}

/**
 * TipTap 词条节点。
 * 落库：`::: term [标题]\\n描述\\n:::`
 * 整块备注：`::: term [标题] {remark:r_xxx}\\n…\\n:::`
 * 展示只读；创建/编辑在右侧「词条」面板。
 */
export const TermGlossaryNode = Node.create({
  name: TERM_NODE_NAME,
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  selectable: true,

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') || '',
        renderHTML: (attributes) => ({
          'data-title': attributes.title || '',
        }),
      },
      termType: {
        default: TERM_TYPE_BASIC,
        parseHTML: (element) =>
          normalizeTermType(element.getAttribute('data-term-type')),
        renderHTML: (attributes) => ({
          'data-term-type': normalizeTermType(attributes.termType),
        }),
      },
      /** 整块备注 id；落库：`::: term [标题] {remark:id}` */
      remarkId: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-remark-id') || '',
        renderHTML: (attributes) => {
          const id = String(attributes.remarkId || '').trim()
          return id ? { 'data-remark-id': id } : {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: `div[data-type="${TERM_GLOSSARY_ID}"]` }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': TERM_GLOSSARY_ID,
        class: 'ext-term-node',
      }),
      0,
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(TermNodeView, {
      stopEvent: ({ event }) => {
        const t = event.target as HTMLElement | null
        if (t?.closest?.('.ext-term-actions')) return true
        if (
          event.type === 'mousedown' ||
          event.type === 'keydown' ||
          event.type === 'beforeinput' ||
          event.type === 'input'
        ) {
          return true
        }
        return false
      },
      ignoreMutation: ({ mutation }) => {
        if (mutation.type === 'selection') return false
        return true
      },
    })
  },

  onCreate() {
    ensureTermGlossaryStyles()
  },

  addProseMirrorPlugins() {
    return [createTermNestGuardPlugin()]
  },

  markdownTokenName: TERM_NODE_NAME,

  parseMarkdown: (token, helpers) => {
    const title = String(
      (token as { title?: string }).title ??
        (token as { attributes?: { title?: string } }).attributes?.title ??
        '',
    ).trim()
    const remarkId = String(
      (token as { remarkId?: string }).remarkId ?? '',
    ).trim()
    const content = helpers.parseChildren(token.tokens || [])
    return helpers.createNode(
      TERM_NODE_NAME,
      { title, remarkId },
      content.length ? content : [helpers.createNode('paragraph')],
    )
  },

  renderMarkdown: (node, helpers) => {
    const title = String(node.attrs?.title ?? '').trim()
    const remarkId = String(node.attrs?.remarkId ?? '').trim()
    const suffix = remarkId ? ` {remark:${remarkId}}` : ''
    const body = helpers
      .renderChildren(node.content || [], '\n')
      .replace(/^(?:&nbsp;|\u00a0|\s)+|(?:&nbsp;|\u00a0|\s)+$/g, '')
      .replace(/\n+$/g, '')
    if (!body) return `::: term [${title}]${suffix}\n:::`
    return `::: term [${title}]${suffix}\n${body}\n:::`
  },

  markdownTokenizer: {
    name: TERM_NODE_NAME,
    level: 'block',
    start(src) {
      const match = src.match(/^:::[\t ]*term[\t ]*\[/m)
      return match?.index ?? -1
    },
    tokenize(src, _tokens, lexer) {
      const match =
        /^:::[\t ]*term[\t ]*\[([^\]]*)\](?:[\t ]*\{([^}]*)\})?\s*([\s\S]*?)\s*:::/.exec(
          src,
        )
      if (!match) return undefined

      const title = match[1].trim()
      const remarkId =
        /\bremark\s*:\s*([A-Za-z0-9_-]+)/i.exec(match[2] || '')?.[1]?.trim() ||
        ''
      const body = match[3].replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '')
      if (!body.trim()) {
        return {
          type: TERM_NODE_NAME,
          raw: match[0],
          title,
          remarkId,
          text: '',
          tokens: [],
        }
      }
      const forBlocks = body.replace(/\r\n/g, '\n')

      return {
        type: TERM_NODE_NAME,
        raw: match[0],
        title,
        remarkId,
        text: body,
        tokens: lexer.blockTokens(forBlocks),
      }
    },
  },

  addCommands() {
    return {
      insertTermGlossary:
        (termType = TERM_TYPE_BASIC) =>
        ({ editor }) => {
          if (editor.isDestroyed) return false
          openTermEditorCreate({
            editor,
            termType: normalizeTermType(termType),
            insertPos: getInsertPosAfterCurrentBlock(editor),
          })
          return true
        },

      promptInsertTermGlossary:
        () =>
        ({ editor }) => {
          if (editor.isDestroyed) return false
          const { from } = editor.state.selection
          let anchor = { left: 0, top: 0, bottom: 0 }
          try {
            const c = editor.view.coordsAtPos(from)
            anchor = { left: c.left, top: c.top, bottom: c.bottom }
          } catch {
            anchor = {
              left: window.innerWidth / 2 - 80,
              top: window.innerHeight / 3,
              bottom: window.innerHeight / 3 + 20,
            }
          }

          const insertPos = getInsertPosAfterCurrentBlock(editor)

          void openTermTypePicker(anchor).then((result) => {
            if (editor.isDestroyed || !result.ok) return
            openTermEditorCreate({
              editor,
              termType: result.type,
              insertPos,
            })
          })
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-t': ({ editor }) => editor.commands.promptInsertTermGlossary(),

      Backspace: ({ editor }) => {
        const { state } = editor
        const { selection } = state

        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === this.name
        ) {
          void confirmDeleteSelectedTerm(editor)
          return true
        }

        if (!selection.empty) return false
        const { $from } = selection

        const beforePos = termPosBeforeCursor($from, this.name)
        if (beforePos != null) {
          return editor.commands.setNodeSelection(beforePos)
        }

        const depth = findTermDepth($from, this.name)
        if (depth < 0) return false

        if ($from.index(depth) === 0 && $from.parentOffset === 0) {
          return editor.commands.setNodeSelection($from.before(depth))
        }

        return false
      },

      Delete: ({ editor }) => {
        const { state } = editor
        const { selection } = state

        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === this.name
        ) {
          void confirmDeleteSelectedTerm(editor)
          return true
        }

        if (!selection.empty) return false
        const { $from } = selection

        if ($from.parentOffset === $from.parent.content.size) {
          const index = $from.index($from.depth - 1)
          const parent = $from.node($from.depth - 1)
          if (index + 1 < parent.childCount) {
            const next = parent.child(index + 1)
            if (next.type.name === this.name) {
              return editor.commands.setNodeSelection($from.after($from.depth))
            }
          }
        }

        return false
      },
    }
  },
})

export default TermGlossaryNode
