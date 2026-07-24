/**
 * 已确认行内引用：编辑区显示标题高亮；落库为 ` term[标题] `。
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { useGlossaryStore } from '../../../stores/glossary'
import {
  TERM_GLOSSARY_ID,
  TERM_REF_CLASS,
  TERM_REF_NODE_NAME,
} from './constants'
import { termDashClass } from './dash'
import {
  buildShortIgnoreContext,
  demoteTermToCandidate,
} from './match'
import { ensureTermGlossaryStyles } from './styles'
import { formatTermRef } from './syntax'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    termRef: {
      insertTermRef: (title: string) => ReturnType
    }
  }
}

function glossaryHasTitle(title: string): boolean {
  const key = String(title ?? '').trim()
  if (!key) return false
  try {
    return !!useGlossaryStore().getTerm(key)
  } catch {
    return false
  }
}

export const TermRefNode = Node.create({
  name: TERM_REF_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-term-title') ||
          element.getAttribute('data-title') ||
          '',
        renderHTML: (attributes) => ({
          'data-term-title': attributes.title || '',
          'data-title': attributes.title || '',
        }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: `span[data-type="${TERM_GLOSSARY_ID}-ref"]` },
      { tag: `span[data-term-ref]` },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const title = String(node.attrs.title ?? '').trim()
    const valid = glossaryHasTitle(title)
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': `${TERM_GLOSSARY_ID}-ref`,
        'data-term-ref': '',
        'data-term-title': title,
        'data-extension': TERM_GLOSSARY_ID,
        class: valid
          ? TERM_REF_CLASS
          : `${TERM_REF_CLASS} ${termDashClass('invalid')}`,
        title: valid ? undefined : '没有对应词条，点击可新建',
      }),
      title,
    ]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const title = String(node.attrs.title ?? '').trim()

      const dom = document.createElement('span')
      // atom NodeView 必须不可编辑，否则光标会掉进节点内部导致后续无法输入
      dom.contentEditable = 'false'
      dom.setAttribute('contenteditable', 'false')
      dom.setAttribute('data-type', `${TERM_GLOSSARY_ID}-ref`)
      dom.setAttribute('data-term-ref', '')
      dom.setAttribute('data-term-title', title)
      dom.setAttribute('data-extension', TERM_GLOSSARY_ID)

      const syncValid = (t: string) => {
        const valid = glossaryHasTitle(t)
        dom.className = valid
          ? TERM_REF_CLASS
          : `${TERM_REF_CLASS} ${termDashClass('invalid')}`
        if (valid) dom.removeAttribute('title')
        else dom.title = '没有对应词条，点击可新建'
      }
      syncValid(title)

      const textEl = document.createElement('span')
      textEl.className = 'ext-term-ref-text'
      textEl.contentEditable = 'false'
      textEl.textContent = title
      dom.appendChild(textEl)

      const closeBtn = document.createElement('button')
      closeBtn.type = 'button'
      closeBtn.className = 'ext-term-ref-close'
      closeBtn.contentEditable = 'false'
      closeBtn.tabIndex = -1
      closeBtn.setAttribute('aria-label', '取消确认')
      closeBtn.title = '取消确认'
      closeBtn.textContent = '×'
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const pos = typeof getPos === 'function' ? getPos() : null
        if (pos == null || typeof pos !== 'number') return
        const current = editor.state.doc.nodeAt(pos)
        if (!current || current.type.name !== TERM_REF_NODE_NAME) return
        const plain = String(current.attrs.title ?? '').trim()
        if (!plain) return
        const end = pos + current.nodeSize
        // 降级为灰线候选（不写 ignore；ignore 仅用于「不是词条」）
        const ctx = buildShortIgnoreContext(editor.state.doc, pos, end, plain)
        demoteTermToCandidate(plain, ctx || plain)
        const tr = editor.state.tr.replaceWith(
          pos,
          end,
          editor.schema.text(plain),
        )
        tr.setMeta('termGlossaryUnconfirm', true)
        editor.view.dispatch(tr)
      })
      dom.appendChild(closeBtn)

      let unsub: (() => void) | null = null
      try {
        unsub = useGlossaryStore().$subscribe(() => {
          syncValid(dom.getAttribute('data-term-title') || '')
        })
      } catch {
        // Pinia 未就绪
      }

      return {
        dom,
        // 无 contentDOM 的 atom：忽略内部 DOM 变更，但放行 selection，便于校正光标
        ignoreMutation: (mutation) => mutation.type !== 'selection',
        selectNode() {
          dom.classList.add('is-selected')
        },
        deselectNode() {
          dom.classList.remove('is-selected')
        },
        update(updated) {
          if (updated.type.name !== TERM_REF_NODE_NAME) return false
          const nextTitle = String(updated.attrs.title ?? '').trim()
          textEl.textContent = nextTitle
          dom.setAttribute('data-term-title', nextTitle)
          syncValid(nextTitle)
          return true
        },
        destroy() {
          unsub?.()
        },
        stopEvent: (event) => {
          const t = event.target as HTMLElement | null
          return !!t?.closest?.('.ext-term-ref-close')
        },
      }
    }
  },

  onCreate() {
    ensureTermGlossaryStyles()
  },

  markdownTokenName: TERM_REF_NODE_NAME,

  parseMarkdown: (token, helpers) => {
    const title = String(
      (token as { title?: string }).title ??
        (token as { attributes?: { title?: string } }).attributes?.title ??
        '',
    ).trim()
    return helpers.createNode(TERM_REF_NODE_NAME, { title })
  },

  renderMarkdown: (node) => {
    const title = String(node.attrs?.title ?? '').trim()
    return formatTermRef(title)
  },

  markdownTokenizer: {
    name: TERM_REF_NODE_NAME,
    level: 'inline',
    start(src: string) {
      return src.indexOf('term[')
    },
    tokenize(src: string) {
      // 吞掉两侧 ASCII 空格，序列化时再统一加回
      const match = /^( ?)term\[([^\]]+)\]( ?)/.exec(src)
      if (!match) return undefined
      const title = match[2].trim()
      if (!title) return undefined
      return {
        type: TERM_REF_NODE_NAME,
        raw: match[0],
        title,
      }
    },
  },

  addCommands() {
    return {
      insertTermRef:
        (title: string) =>
        ({ commands }) => {
          const t = String(title ?? '').trim()
          if (!t) return false
          return commands.insertContent({
            type: this.name,
            attrs: { title: t },
          })
        },
    }
  },
})

export default TermRefNode
