import { Node, mergeAttributes } from '@tiptap/core'
import type { ResolvedPos } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import { TERM_GLOSSARY_ID, TERM_NODE_NAME } from './constants'
import { ensureTermGlossaryStyles } from './styles'
import { requestTermTitleAutofocus, consumeTermTitleAutofocus } from './titleAutofocus'
import TermNodeView from './TermNodeView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    termGlossary: {
      insertTermGlossary: () => ReturnType
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
 * 编辑：标题加粗；描述为块级内容（支持 Markdown 换行 / 加粗等）。
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
        return !!t?.closest?.('.ext-term-title')
      },
      ignoreMutation: ({ mutation }) => {
        if (mutation.type === 'selection') return false
        const t = mutation.target as Node | null
        const el =
          t && t.nodeType === Node.TEXT_NODE
            ? t.parentElement
            : (t as HTMLElement | null)
        // 标题 input 在 contentDOM 外，其变更必须忽略
        if (el?.closest?.('.ext-term-title')) return true
        // 描述 contentDOM 内的变更交给 ProseMirror
        if (
          el?.closest?.(
            '.ext-term-desc, [data-node-view-content], [data-node-view-content-vue]',
          )
        ) {
          return false
        }
        // wrapper chrome（is-incomplete / selected / data-*）必须忽略，否则会重绘抢光标
        return true
      },
    })
  },

  onCreate() {
    ensureTermGlossaryStyles()
  },

  markdownTokenName: TERM_NODE_NAME,

  parseMarkdown: (token, helpers) => {
    const title = String(
      (token as { title?: string }).title ??
        (token as { attributes?: { title?: string } }).attributes?.title ??
        '',
    ).trim()
    const content = helpers.parseChildren(token.tokens || [])
    return helpers.createNode(
      TERM_NODE_NAME,
      { title },
      content.length ? content : [helpers.createNode('paragraph')],
    )
  },

  renderMarkdown: (node, helpers) => {
    const title = String(node.attrs?.title ?? '').trim()
    const body = helpers
      .renderChildren(node.content || [], '\n')
      .replace(/^(?:&nbsp;|\u00a0|\s)+|(?:&nbsp;|\u00a0|\s)+$/g, '')
      .replace(/\n+$/g, '')
    if (!body) return `::: term [${title}]\n:::`
    return `::: term [${title}]\n${body}\n:::`
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
        /^:::[\t ]*term[\t ]*\[([^\]]*)\]\s*([\s\S]*?)\s*:::/.exec(src)
      if (!match) return undefined

      const title = match[1].trim()
      const body = match[2].replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '')
      if (!body.trim()) {
        return {
          type: TERM_NODE_NAME,
          raw: match[0],
          title,
          text: '',
          tokens: [],
        }
      }
      const forBlocks = body.replace(/\r\n/g, '\n')

      return {
        type: TERM_NODE_NAME,
        raw: match[0],
        title,
        text: body,
        tokens: lexer.blockTokens(forBlocks),
      }
    },
  },

  addCommands() {
    return {
      insertTermGlossary:
        () =>
        ({ editor, chain }) => {
          requestTermTitleAutofocus()
          const ok = chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { title: '' },
              content: [{ type: 'paragraph' }],
            })
            .run()
          if (!ok) {
            consumeTermTitleAutofocus()
            return false
          }

          // 兜底：NodeView mount 未消费时，再尝试聚焦标题
          const nodeName = this.name
          const tryFocus = (attempt: number) => {
            try {
              if (editor.isDestroyed) return
              const { $from } = editor.state.selection
              const depth = findTermDepth($from, nodeName)
              if (depth < 0) {
                if (attempt < 4) requestAnimationFrame(() => tryFocus(attempt + 1))
                return
              }
              const termPos = $from.before(depth)
              const dom = editor.view.nodeDOM(termPos) as HTMLElement | null
              const input = dom?.querySelector?.(
                '.ext-term-title',
              ) as HTMLInputElement | null
              if (!input) {
                if (attempt < 4) requestAnimationFrame(() => tryFocus(attempt + 1))
                return
              }
              if (document.activeElement === input) return
              input.focus()
              input.select()
            } catch {
              // ignore
            }
          }
          requestAnimationFrame(() => tryFocus(0))
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      /**
       * 插入词条。
       * 不用 Mod-t：浏览器占用为「新建标签页」，网页收不到。
       * 使用 Mod-Alt-t（Windows: Ctrl+Alt+T，Mac: Cmd+Option+T）。
       */
      'Mod-Alt-t': ({ editor }) => editor.commands.insertTermGlossary(),

      Enter: ({ editor }) => {
        const { state } = editor
        const { $from } = state.selection

        const depth = findTermDepth($from, this.name)
        if (depth < 0) return false

        const term = $from.node(depth)
        const atLastChild = $from.index(depth) === term.childCount - 1
        const inEmptyParagraph =
          $from.parent.type.name === 'paragraph' &&
          $from.parent.content.size === 0

        if (inEmptyParagraph && atLastChild) {
          return editor
            .chain()
            .command(({ tr, dispatch, state: st }) => {
              const emptyFrom = $from.before($from.depth)
              const emptyTo = $from.after($from.depth)
              const posAfterTerm = $from.after(depth)

              if (term.childCount > 1) {
                tr.delete(emptyFrom, emptyTo)
                const insertAt = tr.mapping.map(posAfterTerm)
                const paragraph = st.schema.nodes.paragraph.create()
                tr.insert(insertAt, paragraph)
                tr.setSelection(
                  TextSelection.near(tr.doc.resolve(insertAt + 1)),
                )
              } else {
                const paragraph = st.schema.nodes.paragraph.create()
                tr.insert(posAfterTerm, paragraph)
                tr.setSelection(
                  TextSelection.near(tr.doc.resolve(posAfterTerm + 1)),
                )
              }

              if (dispatch) dispatch(tr.scrollIntoView())
              return true
            })
            .run()
        }

        // 标题内回车：新行改为普通段落
        if ($from.parent.type.name === 'heading') {
          if ($from.parent.content.size === 0) {
            return editor.commands.setParagraph()
          }
          return editor.chain().splitBlock().setParagraph().run()
        }

        return editor.commands.splitBlock()
      },

      'Shift-Enter': ({ editor }) => {
        if (!editor.isActive(this.name)) return false
        return editor.commands.setHardBreak()
      },

      /**
       * 删除整块词条：
       * 1) 已 NodeSelection 选中 → 直接删
       * 2) 光标在词条后方段首 → 先选中整块
       * 3) 光标在词条内第一段开头 → 选中整块（再按一次 Backspace 删除）
       * 4) 空词条（无标题 + 空描述）→ 直接删
       */
      Backspace: ({ editor }) => {
        const { state } = editor
        const { selection } = state

        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === this.name
        ) {
          return editor.commands.deleteSelection()
        }

        if (!selection.empty) return false
        const { $from } = selection

        const beforePos = termPosBeforeCursor($from, this.name)
        if (beforePos != null) {
          return editor.commands.setNodeSelection(beforePos)
        }

        const depth = findTermDepth($from, this.name)
        if (depth < 0) return false

        const term = $from.node(depth)
        const title = String(term.attrs.title ?? '').trim()
        const emptyDesc =
          term.childCount === 1 &&
          term.firstChild?.type.name === 'paragraph' &&
          (term.firstChild?.content.size ?? 0) === 0

        if (emptyDesc && !title) {
          return editor.commands.command(({ tr, dispatch }) => {
            tr.delete($from.before(depth), $from.after(depth))
            if (dispatch) dispatch(tr.scrollIntoView())
            return true
          })
        }

        if ($from.index(depth) === 0 && $from.parentOffset === 0) {
          // 标题行首退格：先降为段落，而不是选中整块词条
          if ($from.parent.type.name === 'heading') {
            return editor.commands.setParagraph()
          }
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
          return editor.commands.deleteSelection()
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

        const depth = findTermDepth($from, this.name)
        if (depth < 0) return false

        const term = $from.node(depth)
        const title = String(term.attrs.title ?? '').trim()
        const emptyDesc =
          term.childCount === 1 &&
          term.firstChild?.type.name === 'paragraph' &&
          (term.firstChild?.content.size ?? 0) === 0

        if (emptyDesc && !title) {
          return editor.commands.command(({ tr, dispatch }) => {
            tr.delete($from.before(depth), $from.after(depth))
            if (dispatch) dispatch(tr.scrollIntoView())
            return true
          })
        }

        return false
      },
    }
  },
})

export default TermGlossaryNode
