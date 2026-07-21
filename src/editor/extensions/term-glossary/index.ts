import type {
  ExtensionNode,
  GlobalMatch,
  GlobalMatchRule,
  MarkdownExtension,
} from '../types'
import { TERM_GLOSSARY_ID } from './constants'
import { TermGlossaryNode } from './node'
import {
  escapeRegExp,
  parseTermMarkdown,
  serializeTermMarkdown,
} from './syntax'

export { TERM_GLOSSARY_ID, TERM_NODE_NAME } from './constants'
export {
  createTermNode,
  formatTermSource,
  parseTermMarkdown,
  serializeTermMarkdown,
  TERM_BLOCK_RE,
} from './syntax'
export type { TermGlossaryAttrs } from './syntax'
export { TermGlossaryNode } from './node'
export { TERM_GLOSSARY_STYLES } from './styles'

function collectTitles(nodes?: ExtensionNode[]): string[] {
  if (!nodes?.length) return []
  const titles = new Set<string>()
  for (const node of nodes) {
    if (node.extensionId !== TERM_GLOSSARY_ID) continue
    const title = String(node.attrs.title ?? '').trim()
    if (title) titles.add(title)
  }
  return Array.from(titles)
}

function getGlobalMatchRule(): GlobalMatchRule {
  return {
    findMatches(text: string, nodes?: ExtensionNode[]): GlobalMatch[] {
      const titles = collectTitles(nodes)
      if (!titles.length || !text) return []

      const matches: GlobalMatch[] = []
      const defRanges = (nodes ?? [])
        .filter((n) => n.extensionId === TERM_GLOSSARY_ID && n.range)
        .map((n) => n.range!)

      const sorted = [...titles].sort((a, b) => b.length - a.length)
      for (const title of sorted) {
        const re = new RegExp(escapeRegExp(title), 'g')
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const from = m.index
          const to = from + m[0].length
          if (defRanges.some((r) => from >= r.from && to <= r.to)) continue
          matches.push({
            from,
            to,
            title,
            extensionId: TERM_GLOSSARY_ID,
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
  getTiptapExtensions: () => [TermGlossaryNode],
  getGlobalMatchRule,
}

export default termGlossaryExtension
