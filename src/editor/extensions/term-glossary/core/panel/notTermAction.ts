/**
 * 选区「不是词条」：注册到全局选区气泡。
 */
import { useGlossaryStore } from '../../../../../stores/glossary'
import { registerSelectionAction } from '../../../../../components/selection-actions'
import { pluginKey } from '../plugins/interaction'
import { collectGlossary, collectTermRanges, enclosingTerm, findCandidateMatches } from '../match/match'
import { isTermEditorDescView } from './termEditorDescContext'
import { sanitizeTermTitle, titlesContainedInText } from '../model/syntax'

function allTitles(doc: import('@tiptap/pm/model').Node): string[] {
  return Array.from(collectGlossary(doc).keys())
}

function storeTitlesList(): string[] {
  try {
    const store = useGlossaryStore()
    return Object.keys(store.terms)
      .map((t) => sanitizeTermTitle(t))
      .filter(Boolean)
  } catch {
    return []
  }
}

let bound = false

export function bindNotTermSelectionAction(): void {
  if (bound) return
  bound = true
  registerSelectionAction({
    id: 'term.not-term',
    label: '不是词条',
    order: 10,
    isVisible: (ctx) => {
      const termRanges = collectTermRanges(ctx.view.state.doc)
      if (enclosingTerm(ctx.from, ctx.to, termRanges)) return false
      const trimmed = ctx.text.trim()
      if (!trimmed) return false
      const inDescEditor = isTermEditorDescView(ctx.view)
      const titles = inDescEditor
        ? storeTitlesList()
        : allTitles(ctx.view.state.doc)
      if (titles.includes(trimmed)) return false
      if (inDescEditor) {
        return titlesContainedInText(trimmed, titles).length > 0
      }
      const candidates = findCandidateMatches(ctx.view.state.doc)
      const overlaps = candidates.some(
        (c) => c.from < ctx.to && c.to > ctx.from,
      )
      if (!overlaps) return false
      return titlesContainedInText(trimmed, titles).length > 0
    },
    run: async (ctx) => {
      const trimmed = ctx.text.trim()
      const inDescEditor = isTermEditorDescView(ctx.view)
      const titles = inDescEditor
        ? storeTitlesList()
        : allTitles(ctx.view.state.doc)
      const hitTitles = titlesContainedInText(trimmed, titles)
      if (!hitTitles.length) return
      await useGlossaryStore().addIgnoreContext(trimmed, hitTitles)
      if (!inDescEditor) {
        const tr = ctx.view.state.tr.setMeta(pluginKey, { refresh: true })
        ctx.view.dispatch(tr)
      }
    },
  })
}
