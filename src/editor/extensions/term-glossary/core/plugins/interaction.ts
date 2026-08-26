import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ensureTermGlossaryStyles } from '../shared/styles'
import { getKeyPicker } from '../../../../../components/key-picker'
import { buildDecorations } from '../match/highlight'
import { TermDialogManager } from '../dialog/dialogManager'
import { createPromptRuntime } from './prompt'
import { createAutoConfirmPlugin } from './autoConfirmPlugin'
import { createClickPlugin } from './clickPlugin'
import { createGhostPlugin } from './ghostPlugin'
import { setActiveTermEditor } from '../shared/editorViewRef'

export const pluginKey = new PluginKey('termGlossaryHighlight')
const convertPluginKey = new PluginKey('termGlossaryAutoConfirm')

export const TermGlossaryInteraction = Extension.create({
  name: 'termGlossaryInteraction',

  onCreate() {
    ensureTermGlossaryStyles()
    setActiveTermEditor(this.editor)
  },

  onDestroy() {
    setActiveTermEditor(null)
  },

  addProseMirrorPlugins() {
    const manager = new TermDialogManager()
    const picker = getKeyPicker()
    const runtime = createPromptRuntime({
      picker,
      convertPluginKey,
      pluginKey,
    })

    return [
      createGhostPlugin({ convertPluginKey }),
      createAutoConfirmPlugin({
        picker,
        convertPluginKey,
        runtime,
      }),
      createClickPlugin({
        manager,
        picker,
        convertPluginKey,
        pluginKey,
        runtime,
        buildDecorations,
      }),
    ]
  },
})

export default TermGlossaryInteraction
