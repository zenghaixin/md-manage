import type {
  ExtensionNode,
  GlobalMatch,
  GlobalMatchRule,
  MarkdownExtension,
} from '../types'
import { TERM_GLOSSARY_ID } from './core/shared/constants'
import { TermGlossaryInteraction } from './core/plugins/interaction'
import { TermGlossaryNode } from './core/model/node'
import { TermRefNode } from './core/model/termRef'
import {
  parseTermMarkdown,
  peelRemarkBraceFromDescription,
  serializeTermMarkdown,
  titlePattern,
} from './core/model/syntax'

export { TERM_GLOSSARY_ID, TERM_NODE_NAME, TERM_REF_NODE_NAME } from './core/shared/constants'
export {
  createTermNode,
  formatTermSource,
  formatTermRef,
  findTitlesInText,
  parseTermMarkdown,
  serializeTermMarkdown,
  titlePattern,
  TERM_BLOCK_RE,
  TERM_REF_RE,
} from './core/model/syntax'
export type { TermGlossaryAttrs } from './core/model/syntax'
export { TermGlossaryNode } from './core/model/node'
export { TermRefNode } from './core/model/termRef'
export { TermGlossaryInteraction } from './core/plugins/interaction'
export { TERM_GLOSSARY_STYLES } from './core/shared/styles'
export {
  normalizeTermType,
  TERM_TYPE_BASIC,
  TERM_TYPE_SPECIALS,
  termTypeLabel,
  isSpecialTermType,
} from './core/shared/termTypes'
export type { TermTypeId, TermTypeSpecialId } from './core/shared/termTypes'
export {
  normalizeTermAttrs,
  termAttrsSummary,
  termAttrFieldsForType,
  TERM_ATTR_FIELDS,
} from './types/termAttrs'
export type { TermAttrs, TermAttrFieldDef } from './types/termAttrs'

function collectEntries(
  nodes?: ExtensionNode[],
): Array<{ title: string; description: string }> {
  if (!nodes?.length) return []
  const byTitle = new Map<string, string>()
  for (const node of nodes) {
    if (node.extensionId !== TERM_GLOSSARY_ID) continue
    const title = String(node.attrs.title ?? '').trim()
    if (!title) continue
    const description = peelRemarkBraceFromDescription(
      String(node.attrs.description ?? node.content ?? ''),
    ).description.trim()
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

      {
        const re = /term\[([^\]]+)\]/g
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const title = m[1].trim()
          if (!title) continue
          const from = m.index
          const to = from + m[0].length
          if (defRanges.some((r) => from >= r.from && to <= r.to)) continue
          if (taken.some((r) => from < r.to && to > r.from)) continue
          const entry = entries.find((e) => e.title === title)
          taken.push({ from, to })
          matches.push({
            from,
            to,
            title,
            extensionId: TERM_GLOSSARY_ID,
            meta: {
              termTitle: title,
              description: entry?.description || '',
              confirmed: true,
            },
          })
        }
      }

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
            meta: {
              termTitle: entry.title,
              description: entry.description,
              confirmed: false,
            },
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
  getTiptapExtensions: () => [
    TermGlossaryNode,
    TermRefNode,
    TermGlossaryInteraction,
  ],
  getGlobalMatchRule,

  /** 启动：加载词库并与全部 .md 校验 */
  async onAppStart() {
    const { useGlossaryStore } = await import('../../../stores/glossary')
    await useGlossaryStore().bootstrap()
    const { bindPendingConflictRestore } = await import('./core/rename/conflictDrawer')
    bindPendingConflictRestore()
    const { bindTermEditorPanel } = await import('./core/panel/termEditorPanel')
    bindTermEditorPanel()
    const { bindNotTermSelectionAction } = await import('./core/panel/notTermAction')
    bindNotTermSelectionAction()
  },

  /** 存盘后：按当前文件同步词条到全局表 */
  async onFileSave({ path, tab, file, markdown }) {
    const { useGlossaryStore } = await import('../../../stores/glossary')
    const sourcePath =
      String(path || '').trim() ||
      (tab && file ? `${tab}/${file}` : String(file || tab || '').trim())
    await useGlossaryStore().syncFileByPath(sourcePath, markdown)
  },
}

export default termGlossaryExtension
