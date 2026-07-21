import type {
  ExtensionNode,
  GlobalMatch,
  GlobalMatchRule,
  MarkdownExtension,
} from '../types'
import { TERM_GLOSSARY_ID } from './constants'
import { TermGlossaryHighlight } from './highlight'
import { TermGlossaryNode } from './node'
import {
  parseTermMarkdown,
  serializeTermMarkdown,
  titlePattern,
} from './syntax'

export { TERM_GLOSSARY_ID, TERM_NODE_NAME } from './constants'
export {
  createTermNode,
  formatTermSource,
  findTitlesInText,
  parseTermMarkdown,
  serializeTermMarkdown,
  titlePattern,
  TERM_BLOCK_RE,
} from './syntax'
export type { TermGlossaryAttrs } from './syntax'
export { TermGlossaryNode } from './node'
export { TermGlossaryHighlight } from './highlight'
export { TERM_GLOSSARY_STYLES } from './styles'

function collectEntries(
  nodes?: ExtensionNode[],
): Array<{ title: string; description: string }> {
  if (!nodes?.length) return []
  const byTitle = new Map<string, string>()
  for (const node of nodes) {
    if (node.extensionId !== TERM_GLOSSARY_ID) continue
    const title = String(node.attrs.title ?? '').trim()
    if (!title) continue
    const description = String(
      node.attrs.description ?? node.content ?? '',
    ).trim()
    byTitle.set(title, description)
  }
  return Array.from(byTitle.entries()).map(([title, description]) => ({
    title,
    description,
  }))
}

function getGlobalMatchRule(): GlobalMatchRule {
  return {
    findMatches(text: string, nodes?: ExtensionNode[]): GlobalMatch[] {
      const entries = collectEntries(nodes)
      if (!entries.length || !text) return []

      const matches: GlobalMatch[] = []
      const defRanges = (nodes ?? [])
        .filter((n) => n.extensionId === TERM_GLOSSARY_ID && n.range)
        .map((n) => n.range!)
      const taken: Array<{ from: number; to: number }> = []

      const sorted = [...entries].sort((a, b) => b.title.length - a.title.length)
      for (const entry of sorted) {
        const re = titlePattern(entry.title)
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const from = m.index
          const to = from + m[0].length
          if (defRanges.some((r) => from >= r.from && to <= r.to)) continue
          if (taken.some((r) => from < r.to && to > r.from)) continue
          taken.push({ from, to })
          matches.push({
            from,
            to,
            title: entry.title,
            extensionId: TERM_GLOSSARY_ID,
            meta: { description: entry.description },
          })
        }
      }

      return matches.sort((a, b) => a.from - b.from)
    },
  }
}

const termGlossaryExtension: MarkdownExtension = {
  id: TERM_GLOSSARY_ID,
  parseMarkdown: parseTermMarkdown,
  serializeMarkdown: serializeTermMarkdown,
  getTiptapExtensions: () => [TermGlossaryNode, TermGlossaryHighlight],
  getGlobalMatchRule,
}

export default termGlossaryExtension
