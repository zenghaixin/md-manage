/**
 * 词条幽灵补全：唯一前缀匹配时在光标后展示灰色后缀，Tab 写入 term[]。
 * 多候选时不显示（由气泡处理）；继续输入偏离完整标题时自动消失。
 */
import { Plugin, PluginKey, TextSelection, type PluginKey as PluginKeyType } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { getKeyPicker } from '../../../../../components/key-picker'
import { findUniquePrefixGhost } from '../match/match'
import { replaceRangeWithTermRef } from '../match/convert'
import { TERM_GHOST_SUFFIX_CLASS } from '../shared/constants'

export const ghostPluginKey = new PluginKey('termGlossaryGhost')

function buildGhostDecorations(
  doc: import('@tiptap/pm/model').Node,
  cursor: number,
  composing: boolean,
): DecorationSet {
  if (composing) return DecorationSet.empty

  const hit = findUniquePrefixGhost(doc, cursor)
  if (!hit?.suffix) return DecorationSet.empty

  return DecorationSet.create(doc, [
    Decoration.widget(
      hit.to,
      () => {
        const span = document.createElement('span')
        span.className = TERM_GHOST_SUFFIX_CLASS
        span.textContent = hit.suffix
        span.setAttribute('aria-hidden', 'true')
        return span
      },
      {
        side: 1,
        key: `ghost:${hit.from}:${hit.to}:${hit.title}`,
      },
    ),
  ])
}

export function createGhostPlugin(opts: {
  convertPluginKey: PluginKeyType
}): Plugin {
  const { convertPluginKey } = opts

  return new Plugin({
    key: ghostPluginKey,
    state: {
      init: () => ({ composing: false }),
      apply(tr, value) {
        const meta = tr.getMeta(ghostPluginKey)
        if (meta?.composing != null) {
          return { composing: !!meta.composing }
        }
        return value
      },
    },
    props: {
      decorations(state) {
        const pluginState = ghostPluginKey.getState(state) as {
          composing: boolean
        }
        const { selection } = state
        if (!(selection instanceof TextSelection) || !selection.empty) {
          return DecorationSet.empty
        }
        return buildGhostDecorations(
          state.doc,
          selection.from,
          pluginState?.composing ?? false,
        )
      },
      handleKeyDown(view, event) {
        if (
          event.key !== 'Tab' ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        ) {
          return false
        }
        const picker = getKeyPicker()
        if (picker.isOpen) return false

        const { selection } = view.state
        if (!(selection instanceof TextSelection) || !selection.empty) {
          return false
        }

        const hit = findUniquePrefixGhost(view.state.doc, selection.from)
        if (!hit) return false

        event.preventDefault()
        const tr = view.state.tr
        if (
          !replaceRangeWithTermRef(
            tr,
            view.state.schema,
            hit.from,
            hit.to,
            hit.title,
          )
        ) {
          return true
        }
        tr.setMeta(convertPluginKey, { skip: true })
        view.dispatch(tr)
        return true
      },
      handleDOMEvents: {
        compositionstart(view) {
          view.dispatch(
            view.state.tr.setMeta(ghostPluginKey, { composing: true }),
          )
          return false
        },
        compositionend(view) {
          view.dispatch(
            view.state.tr.setMeta(ghostPluginKey, { composing: false }),
          )
          return false
        },
      },
    },
  })
}
