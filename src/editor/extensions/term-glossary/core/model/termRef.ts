/**
 * 已确认行内引用：编辑区显示标题高亮；落库为 ` term[标题] `。
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { useGlossaryStore } from '../../../../../stores/glossary'
import {
  TERM_GLOSSARY_ID,
  TERM_NODE_NAME,
  TERM_REF_CLASS,
  TERM_REF_NODE_NAME,
  TERM_REF_SELF_CLASS,
  termDashClass,
} from '../shared/constants'
import {
  buildShortIgnoreContext,
  demoteTermToCandidate,
} from '../match/match'
import { ensureTermGlossaryStyles } from '../shared/styles'
import { formatTermRef, sanitizeTermTitle } from './syntax'

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

/** 行内引用是否落在某词条定义块的描述内，且与块标题同名 */
function isSelfRefInTermDef(
  editor: import('@tiptap/core').Editor,
  pos: number | null | undefined,
  refTitle: string,
): boolean {
  if (pos == null || typeof pos !== 'number') return false
  const refKey = sanitizeTermTitle(refTitle)
  if (!refKey) return false
  try {
    const $pos = editor.state.doc.resolve(pos)
    for (let d = $pos.depth; d > 0; d -= 1) {
      if ($pos.node(d).type.name !== TERM_NODE_NAME) continue
      const host = sanitizeTermTitle($pos.node(d).attrs.title)
      return !!host && host === refKey
    }
  } catch {
    // ignore
  }
  return false
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

      const textEl = document.createElement('span')
      textEl.className = 'ext-term-ref-text'
      textEl.contentEditable = 'false'
      textEl.textContent = title

      const closeBtn = document.createElement('button')
      closeBtn.type = 'button'
      closeBtn.className = 'ext-term-ref-close'
      closeBtn.contentEditable = 'false'
      closeBtn.tabIndex = -1
      closeBtn.setAttribute('aria-label', '取消确认')
      closeBtn.title = '取消确认'
      closeBtn.textContent = '×'

      const syncValid = (t: string, atPos?: number | null) => {
        const pos = atPos ?? (typeof getPos === 'function' ? getPos() : null)
        if (isSelfRefInTermDef(editor, pos, t)) {
          dom.className = TERM_REF_SELF_CLASS
          dom.removeAttribute('title')
          closeBtn.hidden = true
          return
        }
        closeBtn.hidden = false
        const valid = glossaryHasTitle(t)
        dom.className = valid
          ? TERM_REF_CLASS
          : `${TERM_REF_CLASS} ${termDashClass('invalid')}`
        if (valid) dom.removeAttribute('title')
        else dom.title = '没有对应词条，点击可新建'
      }
      syncValid(title, typeof getPos === 'function' ? getPos() : null)

      dom.appendChild(textEl)

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
          syncValid(
            dom.getAttribute('data-term-title') || '',
            typeof getPos === 'function' ? getPos() : null,
          )
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
          syncValid(nextTitle, typeof getPos === 'function' ? getPos() : null)
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
