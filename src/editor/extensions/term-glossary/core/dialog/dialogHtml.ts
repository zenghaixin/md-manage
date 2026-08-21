/**
 * 词条弹窗的数据解析与描述 HTML 渲染。
 * 不含弹窗交互（TermDialog），只负责「解析出要展示什么、渲染成什么 DOM」。
 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { marked } from 'marked'
import { useGlossaryStore } from '../../../../../stores/glossary'
import {
  TERM_GLOSSARY_ID,
  TERM_REF_CLASS,
  TERM_REF_CANDIDATE_CLASS,
  termDashClass,
} from '../shared/constants'
import {
  findTermNodeInDoc,
  getTermRemarkIdFromNode,
  serializeTermDescriptionFromNode,
} from '../model/serializeDesc'
import {
  peelRemarkBraceFromDescription,
  protectTermRefs,
  relatedTitlesForMatch,
  sanitizeTermTitle,
  titlePattern,
} from '../model/syntax'

export interface ResolvedTerm {
  title: string
  description: string
  sourcePath: string
  /** 定义块整块备注 id；当前文档有节点时才能解析 */
  remarkId: string
}

export type OpenSourceFn = (path: string, focusTermTitle?: string) => void
export type OpenTermFn = (title: string, anchor?: HTMLElement | null) => void

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 弹窗描述：当前文档有定义块时优先实时序列化；否则用 Store Markdown。
 * 不用纯文本，避免丢失 # 标题等标记。
 */
export function resolveTerm(
  title: string,
  doc?: ProseMirrorNode | null,
): ResolvedTerm {
  const key = sanitizeTermTitle(title) || String(title ?? '').trim()
  let liveMd = ''
  let remarkId = ''
  if (doc) {
    const node = findTermNodeInDoc(doc, key)
    if (node) {
      liveMd = serializeTermDescriptionFromNode(node)
      remarkId = getTermRemarkIdFromNode(node)
    }
  }

  try {
    const store = useGlossaryStore()
    const term = store.getTerm(key)
    if (term) {
      const peeledStore = peelRemarkBraceFromDescription(term.description || '')
      return {
        title: term.title || key,
        description: liveMd || peeledStore.description || '',
        sourcePath: term.sourcePath || '',
        remarkId: remarkId || peeledStore.remarkId,
      }
    }
  } catch {
    // ignore
  }

  return {
    title: key,
    description: liveMd || '',
    sourcePath: '',
    remarkId,
  }
}

/**
 * 弹窗预览：仅给裸命中加灰线候选（已确认 term[] 在 Markdown 阶 段已变成 span）。
 */
function highlightCandidatesInElement(
  root: HTMLElement,
  titles: string[],
  selfTitle: string,
): void {
  const sorted = [...titles]
    .filter((t) => t && t !== selfTitle)
    .sort((a, b) => b.length - a.length)
  if (!sorted.length) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = (node as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (
        parent.closest(
          `code, pre, .${TERM_REF_CLASS}, .${TERM_REF_CANDIDATE_CLASS}`,
        )
      ) {
        return NodeFilter.FILTER_REJECT
      }
      if (!(node as Text).data.trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  for (const textNode of textNodes) {
    const text = textNode.data
    type Hit = { from: number; to: number; title: string; candidates: string[] }
    const hits: Hit[] = []
    const taken: Array<{ from: number; to: number }> = []

    for (const termTitle of sorted) {
      const re = titlePattern(termTitle)
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const from = m.index
        const to = from + m[0].length
        if (taken.some((r) => from < r.to && to > r.from)) continue
        taken.push({ from, to })
        const candidates = relatedTitlesForMatch(termTitle, titles).filter(
          (t) => t !== selfTitle,
        )
        if (!candidates.length) continue
        hits.push({
          from,
          to,
          title: termTitle,
          candidates,
        })
      }
    }
    if (!hits.length) continue

    hits.sort((a, b) => a.from - b.from)
    const frag = document.createDocumentFragment()
    let cursor = 0
    for (const hit of hits) {
      if (hit.from > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, hit.from)))
      }
      const span = document.createElement('span')
      span.className = termDashClass('candidate')
      span.setAttribute('data-term-title', hit.title)
      span.setAttribute('data-term-candidates', hit.candidates.join('\u0001'))
      span.textContent = text.slice(hit.from, hit.to)
      frag.appendChild(span)
      cursor = hit.to
    }
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)))
    }
    textNode.parentNode?.replaceChild(frag, textNode)
  }
}

/**
 * 弹窗描述：保护 term[] → Markdown 渲染 → 还原为已确认 span → 灰线候选。
 */
export function renderDescriptionHtml(
  description: string,
  titles: string[],
  selfTitle: string,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ext-term-popover-desc'
  const text = description.trim() || '（暂无描述）'
  const { text: protectedMd, titles: refTitles } = protectTermRefs(text)

  try {
    let html = marked.parse(protectedMd, {
      async: false,
      breaks: true,
      gfm: true,
    }) as string

    html = html.replace(/§§TERMREF(\d+)§§/g, (_full, idx: string) => {
      const title = refTitles[Number(idx)] || ''
      if (!title) return ''
      // 描述内与自身同名：保持普通文本
      if (title === selfTitle) return escapeHtml(title)
      const known = titles.includes(title)
      const cls = known
        ? TERM_REF_CLASS
        : `${TERM_REF_CLASS} ${termDashClass('invalid')}`
      const tip = known ? '' : ' title="没有对应词条，点击可新建"'
      return `<span class="${cls}" data-term-title="${escapeHtml(title)}" data-extension="${TERM_GLOSSARY_ID}"${tip}>${escapeHtml(title)}</span>`
    })
    wrap.innerHTML = html
  } catch {
    wrap.textContent = text
  }

  highlightCandidatesInElement(wrap, titles, selfTitle)
  return wrap
}
