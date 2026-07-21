import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * 标题行首 Backspace → 降为普通段落（文字保留）。
 * 用高优先级 handleKeyDown，避免被 TipTap 内置 Backspace（仅处理空标题）抢走。
 */
export const HeadingBackspace = Extension.create({
  name: 'headingBackspace',
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('headingBackspace'),
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== 'Backspace') return false

            const { state } = view
            const { selection } = state
            if (!selection.empty) return false

            const { $from } = selection
            if ($from.parent.type.name !== 'heading') return false
            if ($from.parentOffset !== 0) return false

            const paragraph = state.schema.nodes.paragraph
            if (!paragraph) return false

            const from = $from.before()
            const to = $from.after()
            const tr = state.tr.setBlockType(from, to, paragraph)
            view.dispatch(tr.scrollIntoView())
            return true
          },
        },
      }),
    ]
  },
})

export default HeadingBackspace
