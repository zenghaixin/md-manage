/**
 * 词条高亮：生成候选 / 曾用名的虚线 Decoration。
 * 只负责「画虚线」，不涉及弹窗 / 确认 / 插件装配（见 interaction.ts）。
 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { TERM_GLOSSARY_ID, termDashClass } from '../shared/constants'
import { scanTermMatches } from './match'

export function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const { fallback, formerHits } = scanTermMatches(doc)
  const decorations: ReturnType<typeof Decoration.inline>[] = []

  for (const hit of formerHits) {
    decorations.push(
      Decoration.inline(hit.from, hit.to, {
        class: termDashClass('former'),
        'data-term-former': hit.formerTitle,
        'data-term-current-titles': hit.currentTitles.join('\u0001'),
        'data-extension': TERM_GLOSSARY_ID,
      }),
    )
  }

  for (const match of fallback) {
    decorations.push(
      Decoration.inline(match.from, match.to, {
        class: termDashClass('candidate'),
        'data-term-title': match.matchTitle,
        'data-term-candidates': match.candidates.join('\u0001'),
        'data-extension': TERM_GLOSSARY_ID,
      }),
    )
  }

  if (!decorations.length) return DecorationSet.empty
  return DecorationSet.create(doc, decorations)
}
