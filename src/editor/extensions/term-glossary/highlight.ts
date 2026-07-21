import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  TERM_GLOSSARY_ID,
  TERM_NODE_NAME,
  TERM_REF_CLASS,
  TERM_POPOVER_CLASS,
} from './constants'
import { ensureTermGlossaryStyles } from './styles'
import { titlePattern } from './syntax'

const pluginKey = new PluginKey('termGlossaryHighlight')

interface TermMatch {
  from: number
  to: number
  title: string
}

interface TermRange {
  from: number
  to: number
  title: string
}

function collectGlossary(doc: ProseMirrorNode): Map<string, string> {
  const byTitle = new Map<string, string>()
  doc.descendants((node) => {
    if (node.type.name !== TERM_NODE_NAME) return
    const title = String(node.attrs.title ?? '').trim()
    if (!title) return
    const description = node.textContent.replace(/\u00a0/g, ' ').trim()
    byTitle.set(title, description)
  })
  return byTitle
}

function collectTermRanges(doc: ProseMirrorNode): TermRange[] {
  const ranges: TermRange[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== TERM_NODE_NAME) return
    ranges.push({
      from: pos,
      to: pos + node.nodeSize,
      title: String(node.attrs.title ?? '').trim(),
    })
  })
  return ranges
}

function collectCodeRanges(doc: ProseMirrorNode): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'codeBlock') {
      ranges.push({ from: pos, to: pos + node.nodeSize })
      return false
    }
  })
  return ranges
}

function inRange(
  from: number,
  to: number,
  ranges: Array<{ from: number; to: number }>,
): boolean {
  return ranges.some((r) => from >= r.from && to <= r.to)
}

function overlaps(
  from: number,
  to: number,
  ranges: Array<{ from: number; to: number }>,
): boolean {
  return ranges.some((r) => from < r.to && to > r.from)
}

function enclosingTerm(
  from: number,
  to: number,
  termRanges: TermRange[],
): TermRange | undefined {
  return termRanges.find((r) => from >= r.from && to <= r.to)
}

function findTermMatches(doc: ProseMirrorNode): TermMatch[] {
  const glossary = collectGlossary(doc)
  if (!glossary.size) return []

  const termRanges = collectTermRanges(doc)
  const codeRanges = collectCodeRanges(doc)
  const titles = Array.from(glossary.keys()).sort((a, b) => b.length - a.length)
  const taken: Array<{ from: number; to: number }> = []
  const matches: TermMatch[] = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    if (node.marks.some((m) => m.type.name === 'code')) return

    const textFrom = pos
    const textTo = pos + node.nodeSize
    if (inRange(textFrom, textTo, codeRanges)) return

    const selfTerm = enclosingTerm(textFrom, textTo, termRanges)
    const text = node.text

    for (const title of titles) {
      // 词条描述内不匹配自身标题
      if (selfTerm && selfTerm.title === title) continue

      const re = titlePattern(title)
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const from = textFrom + m.index
        const to = from + m[0].length
        if (overlaps(from, to, taken)) continue
        taken.push({ from, to })
        matches.push({ from, to, title })
      }
    }
  })

  return matches.sort((a, b) => a.from - b.from)
}


function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const matches = findTermMatches(doc)
  if (!matches.length) return DecorationSet.empty

  const decorations = matches.map((match) =>
    Decoration.inline(match.from, match.to, {
      class: TERM_REF_CLASS,
      'data-term-title': match.title,
      'data-extension': TERM_GLOSSARY_ID,
    }),
  )

  return DecorationSet.create(doc, decorations)
}

/** 点击词条引用时的浮层 */
class TermPopover {
  private el: HTMLDivElement | null = null
  private anchor: HTMLElement | null = null
  private onDocPointerDown: ((e: PointerEvent) => void) | null = null
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null
  private onScroll: (() => void) | null = null

  show(anchor: HTMLElement, description: string) {
    this.hide()
    ensureTermGlossaryStyles()
    const text = description.trim() || '（暂无描述）'
    const el = document.createElement('div')
    el.className = TERM_POPOVER_CLASS
    el.setAttribute('role', 'tooltip')
    el.textContent = text
    document.body.appendChild(el)
    this.el = el
    this.anchor = anchor
    this.place()

    this.onDocPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (this.el?.contains(t) || this.anchor?.contains(t)) return
      this.hide()
    }
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hide()
    }
    this.onScroll = () => this.hide()

    // 下一帧再挂监听，避免本次 click 立刻关掉
    requestAnimationFrame(() => {
      document.addEventListener('pointerdown', this.onDocPointerDown!, true)
      document.addEventListener('keydown', this.onKeyDown!)
      window.addEventListener('scroll', this.onScroll!, true)
    })
  }

  place() {
    if (!this.el || !this.anchor) return
    const rect = this.anchor.getBoundingClientRect()
    const pad = 8
    const el = this.el

    // 先放到视口外量实际尺寸（随内容伸缩）
    el.style.left = '0px'
    el.style.top = '0px'
    const { width, height } = el.getBoundingClientRect()

    // 默认：文案下方、左对齐；右侧放不下则改为与文案右对齐
    let left = rect.left
    if (left + width + pad > window.innerWidth) {
      left = rect.right - width
    }
    if (left < pad) left = pad
    if (left + width + pad > window.innerWidth) {
      left = window.innerWidth - width - pad
    }

    let top = rect.bottom + pad
    // 下方放不下且上方够用 → 改到上方
    if (top + height + pad > window.innerHeight && rect.top - height - pad >= pad) {
      top = rect.top - height - pad
    } else if (top + height + pad > window.innerHeight) {
      top = Math.max(pad, window.innerHeight - height - pad)
    }

    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
  }

  hide() {
    if (this.onDocPointerDown) {
      document.removeEventListener('pointerdown', this.onDocPointerDown, true)
      this.onDocPointerDown = null
    }
    if (this.onKeyDown) {
      document.removeEventListener('keydown', this.onKeyDown)
      this.onKeyDown = null
    }
    if (this.onScroll) {
      window.removeEventListener('scroll', this.onScroll, true)
      this.onScroll = null
    }
    this.el?.remove()
    this.el = null
    this.anchor = null
  }

  destroy() {
    this.hide()
  }
}

function resolveDescription(view: EditorView, title: string): string {
  return collectGlossary(view.state.doc).get(title) ?? ''
}

/**
 * 正文词条提示：匹配已定义标题 → 蓝色 `[标题]`，点击显示描述。
 * 仅编辑态装饰，不改落库 Markdown。
 */
export const TermGlossaryHighlight = Extension.create({
  name: 'termGlossaryHighlight',

  onCreate() {
    ensureTermGlossaryStyles()
  },

  addProseMirrorPlugins() {
    const popover = new TermPopover()

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: (_, state) => buildDecorations(state.doc),
          apply: (tr, old) => {
            if (tr.docChanged) return buildDecorations(tr.doc)
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state)
          },
          handleDOMEvents: {
            click: (view, event) => {
              const target = (event.target as HTMLElement | null)?.closest?.(
                `.${TERM_REF_CLASS}`,
              ) as HTMLElement | null
              if (!target) {
                popover.hide()
                return false
              }
              const title = target.getAttribute('data-term-title') ?? ''
              popover.show(target, resolveDescription(view, title))
              return false
            },
          },
        },
        view() {
          return {
            destroy() {
              popover.destroy()
            },
          }
        },
      }),
    ]
  },
})

export default TermGlossaryHighlight
