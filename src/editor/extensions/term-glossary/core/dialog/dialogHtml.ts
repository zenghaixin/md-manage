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
  refs?: Record<string, string[]>
  refSources?: string[]
  extraFields?: Array<{
    label: string
    type: string
    value: string | string[]
  }>
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
        refs: term.refs || {},
        refSources: term.refSources || [],
        extraFields: term.extraFields || [],
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
    refs: {},
    refSources: [],
    extraFields: [],
  }
}

/**
 * 弹窗预览：裸命中加灰线候选；词库已有整词直接显示为已确认引用；前缀（如 鲁迪→鲁迪乌斯）加灰线。
 */
function collectPrefixStrings(titles: string[], selfTitle: string): string[] {
  const storeTitles = [
    ...new Set(titles.map(sanitizeTermTitle).filter(Boolean)),
  ]
  const titleSet = new Set(storeTitles)
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of storeTitles) {
    if (t === selfTitle) continue
    for (let len = 2; len < t.length; len++) {
      const p = t.slice(0, len)
      if (p === selfTitle || titleSet.has(p) || seen.has(p)) continue
      const longer = storeTitles.filter(
        (x) => x.startsWith(p) && x.length > p.length && x !== selfTitle,
      )
      if (longer.length >= 1) {
        seen.add(p)
        out.push(p)
      }
    }
  }
  return out.sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh'))
}

function longerTitlesWithPrefixForDesc(
  prefix: string,
  titles: string[],
  selfTitle: string,
): string[] {
  const p = String(prefix ?? '').trim()
  if (!p) return []
  return titles
    .filter((t) => t.startsWith(p) && t.length > p.length && t !== selfTitle)
    .sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh'))
}

function highlightCandidatesInElement(
  root: HTMLElement,
  titles: string[],
  selfTitle: string,
): void {
  const sorted = [...titles]
    .filter((t) => t && t !== selfTitle)
    .sort((a, b) => b.length - a.length)
  if (!sorted.length) return

  const prefixStrings = collectPrefixStrings(titles, selfTitle)
  const titleSet = new Set(sorted)

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
    type Hit = {
      from: number
      to: number
      title: string
      candidates: string[]
      /** 词库已有整词 → 蓝色已确认样式 */
      asConfirmed: boolean
    }
    const hits: Hit[] = []
    const taken: Array<{ from: number; to: number }> = []
    const overlaps = (from: number, to: number) =>
      taken.some((r) => from < r.to && to > r.from)

    // 1) 整词命中（长词优先）
    for (const termTitle of sorted) {
      const re = titlePattern(termTitle)
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const from = m.index
        const to = from + m[0].length
        if (overlaps(from, to)) continue
        const candidates = relatedTitlesForMatch(termTitle, titles).filter(
          (t) => t !== selfTitle,
        )
        if (!candidates.length) continue
        taken.push({ from, to })
        hits.push({
          from,
          to,
          title: termTitle,
          candidates,
          asConfirmed: titleSet.has(termTitle) && m[0] === termTitle,
        })
      }
    }

    // 2) 前缀灰线（如 鲁迪 → 鲁迪乌斯）
    for (const prefix of prefixStrings) {
      let from = 0
      while (from <= text.length) {
        const idx = text.indexOf(prefix, from)
        if (idx < 0) break
        const to = idx + prefix.length
        from = idx + 1
        if (overlaps(idx, to)) continue
        const candidates = longerTitlesWithPrefixForDesc(
          prefix,
          titles,
          selfTitle,
        )
        if (!candidates.length) continue
        taken.push({ from: idx, to })
        hits.push({
          from: idx,
          to,
          title: prefix,
          candidates,
          asConfirmed: false,
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
      if (hit.asConfirmed) {
        span.className = TERM_REF_CLASS
        span.setAttribute('data-term-title', hit.title)
        span.setAttribute('data-extension', TERM_GLOSSARY_ID)
      } else {
        span.className = termDashClass('candidate')
        span.setAttribute('data-term-title', hit.title)
        span.setAttribute(
          'data-term-candidates',
          hit.candidates.join('\u0001'),
        )
      }
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
 * 弹窗 / 定义块描述：保护 term[] → Markdown 渲染 → 还原已确认 span → 整词/前缀候选高亮。
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
