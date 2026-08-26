/**
 * 候选 / 曾用名气泡的共享运行时：两个 ProseMirror 插件（自动确认、点击装饰）共用。
 * 通过工厂注入 picker 与 pluginKey，避免与主扩展 / 各插件循环依赖。
 */
import type { PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { useGlossaryStore } from '../../../../../stores/glossary'
import { TERM_GLOSSARY_ID } from '../shared/constants'
import { buildShortIgnoreContext } from '../match/match'
import { replaceRangeWithTermRef } from '../match/convert'
import {
  KeyPicker,
  type KeyPickerAnchor,
  type KeyPickerSecondary,
} from '../../../../../components/key-picker'

export type FormerPickerAction = 'switch' | 'once' | 'never'

export interface PromptRuntime {
  showCandidateConfirm: (
    anchor: KeyPickerAnchor,
    titles: string[],
    onPick: (title: string) => void,
    promptKey?: string,
    onDismiss?: () => void,
  ) => void
  showFormerConfirm: (
    anchor: KeyPickerAnchor,
    formerTitle: string,
    currentTitles: string[],
    onAction: (action: FormerPickerAction, title?: string) => void,
    promptKey?: string,
    onDismiss?: () => void,
  ) => void
  handleFormerAction: (
    view: EditorView,
    from: number,
    to: number,
    formerTitle: string,
    currentTitles: string[],
    action: FormerPickerAction,
    pickedTitle?: string,
  ) => Promise<void>
  refreshDecorations: (view: EditorView) => void
}

export function createPromptRuntime(opts: {
  picker: KeyPicker
  convertPluginKey: PluginKey
  pluginKey: PluginKey
}): PromptRuntime {
  const { picker, convertPluginKey, pluginKey } = opts

  const formerSecondary = (
    onAction: (action: FormerPickerAction, title?: string) => void,
  ): KeyPickerSecondary[] => [
    {
      key: '0',
      label: '保存原样',
      onSelect: () => onAction('once'),
    },
    {
      key: '-',
      label: '忽略',
      onSelect: () => onAction('never'),
    },
  ]

  const showCandidateConfirm: PromptRuntime['showCandidateConfirm'] = (
    anchor,
    titles,
    onPick,
    promptKey = '',
    onDismiss,
  ) => {
    picker.show({
      anchor,
      titles,
      onPick,
      promptKey,
      onDismiss,
      sourceId: TERM_GLOSSARY_ID,
      selectMode: 'tab',
      passive: true,
    })
  }

  const showFormerConfirm: PromptRuntime['showFormerConfirm'] = (
    anchor,
    formerTitle,
    currentTitles,
    onAction,
    promptKey = '',
    onDismiss,
  ) => {
    picker.show({
      anchor,
      label: `「${formerTitle}」是否修改为以下词条？`,
      titles: currentTitles,
      onPick: (title) => onAction('switch', title),
      secondary: formerSecondary(onAction),
      promptKey,
      onDismiss,
      sourceId: TERM_GLOSSARY_ID,
    })
  }

  const refreshDecorations = (view: EditorView) => {
    view.dispatch(view.state.tr.setMeta(pluginKey, { refresh: true }))
  }

  const handleFormerAction: PromptRuntime['handleFormerAction'] = async (
    view,
    from,
    to,
    formerTitle,
    currentTitles,
    action,
    pickedTitle,
  ) => {
    const store = useGlossaryStore()
    if (action === 'switch' && pickedTitle) {
      const tr = view.state.tr
      if (
        !replaceRangeWithTermRef(
          tr,
          view.state.schema,
          from,
          to,
          pickedTitle,
        )
      ) {
        return
      }
      tr.setMeta(convertPluginKey, { skip: true })
      view.dispatch(tr)
      const others = currentTitles.filter((t) => t !== pickedTitle)
      if (others.length) {
        await store.removeFormerTitleFrom(formerTitle, others)
      }
      refreshDecorations(view)
      return
    }
    if (action === 'once') {
      const ctx = buildShortIgnoreContext(
        view.state.doc,
        from,
        to,
        formerTitle,
      )
      if (ctx) await store.addIgnoreContext(ctx, currentTitles)
      refreshDecorations(view)
      return
    }
    if (action === 'never') {
      await store.removeFormerTitleFrom(formerTitle, currentTitles)
      refreshDecorations(view)
    }
  }

  return {
    showCandidateConfirm,
    showFormerConfirm,
    handleFormerAction,
    refreshDecorations,
  }
}
