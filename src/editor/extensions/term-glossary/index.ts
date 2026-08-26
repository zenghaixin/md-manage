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
import { isGlossaryDefPath } from './core/shared/glossaryPaths'

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

let globalShortcutBound = false

/** 全局 Ctrl+Alt+T：直接打开新建词条浮层（不依赖编辑器焦点） */
function bindGlobalNewTermShortcut() {
  if (globalShortcutBound || typeof window === 'undefined') return
  globalShortcutBound = true
  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || !e.altKey) return
      if (e.key !== 't' && e.key !== 'T') return
      const t = e.target as HTMLElement | null
      // 允许在输入框外/内均触发新建（产品：全局快捷键）
      if (t?.closest?.('[data-term-editor-float]')) return
      e.preventDefault()
      void import('./core/panel/termEditorPanel').then(({ openTermEditorCreate }) => {
        openTermEditorCreate({})
      })
    },
    true,
  )
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
  getMarkdownFieldLiteExtensions: () => [TermRefNode],
  getGlobalMatchRule,

  /**
   * 非「词条/」路径：打断 ::: term 围栏，使定义块原文显示、不解析成节点。
   * （零宽空格插在 ::: 后，视觉上不可见）
   */
  transformFromStorage(markdown: string, path?: string) {
    if (isGlossaryDefPath(path || '')) return markdown
    return String(markdown || '').replace(
      /:::(\s*)term(\s*)\[/gi,
      ':::\u200B$1term$2[',
    )
  },

  transformToStorage(markdown: string, path?: string) {
    if (isGlossaryDefPath(path || '')) return markdown
    return String(markdown || '').replace(
      /:::\u200B(\s*)term(\s*)\[/gi,
      ':::$1term$2[',
    )
  },

  /** 启动：加载词库并与「词条/」下 .md 校验 */
  async onAppStart() {
    const { useGlossaryStore } = await import('../../../stores/glossary')
    await useGlossaryStore().bootstrap()
    const { bindPendingConflictRestore } = await import('./core/rename/conflictDrawer')
    bindPendingConflictRestore()
    const { bindTermEditorPanel } = await import('./core/panel/termEditorPanel')
    bindTermEditorPanel()
    const { bindNotTermSelectionAction } = await import('./core/panel/notTermAction')
    bindNotTermSelectionAction()
    const { bindSetTermSelectionAction } = await import('./core/panel/setTermAction')
    bindSetTermSelectionAction()
    const { bindTermGlossaryPanel } = await import('./core/panel/glossarySidePanel')
    bindTermGlossaryPanel()
    bindGlobalNewTermShortcut()
  },

  /** 存盘后：按当前文件同步词条到全局表（非词条路径服务端会清空该 path 归属） */
  async onFileSave({ path, tab, file, markdown }) {
    const { useGlossaryStore } = await import('../../../stores/glossary')
    const sourcePath =
      String(path || '').trim() ||
      (tab && file ? `${tab}/${file}` : String(file || tab || '').trim())
    await useGlossaryStore().syncFileByPath(sourcePath, markdown)
  },
}

export default termGlossaryExtension
