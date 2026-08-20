/**
 * 装饰 + 点击插件（pluginKey）：
 * 挂候选 / 曾用名 Decoration，处理点击（候选、曾用名、已确认引用、失效引用），
 * 管理词条弹窗（TermDialogManager）并绑定 flash 与 store 刷新。
 * 依赖 manager、picker、convertPluginKey、pluginKey 与 runtime，均由主扩展注入。
 */
import { Plugin, type PluginKey } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { DecorationSet, EditorView } from '@tiptap/pm/view'
import { useGlossaryStore } from '../../../../../stores/glossary'
import {
  TERM_REF_CLASS,
  TERM_REF_CANDIDATE_CLASS,
  TERM_REF_FORMER_CLASS,
  TERM_REF_INVALID_CLASS,
  TERM_POPOVER_CLASS,
} from '../shared/constants'
import {
  KEY_PICKER_CLASS,
  type KeyPicker,
} from '../../../../components/key-picker'
import { bindTermFlashView } from '../shared/flashTerm'
import { replaceRangeWithTermRef } from '../match/convert'
import { offerCreateMissingTerm } from '../dialog/createMissingTerm'
import type { TermDialogManager } from '../dialog/dialogManager'
import type { PromptRuntime } from './prompt'

export function createClickPlugin(opts: {
  manager: TermDialogManager
  picker: KeyPicker
  convertPluginKey: PluginKey
  pluginKey: PluginKey
  runtime: PromptRuntime
  buildDecorations: (doc: ProseMirrorNode) => DecorationSet
}): Plugin {
  const {
    manager,
    picker,
    convertPluginKey,
    pluginKey,
    runtime,
    buildDecorations,
  } = opts

  return new Plugin({
    key: pluginKey,
    state: {
      init: (_, state) => {
        manager.setDoc(state.doc, false)
        return buildDecorations(state.doc)
      },
      apply: (tr, old, _oldState, newState) => {
        manager.setDoc(newState.doc, tr.docChanged)
        if (tr.docChanged || tr.getMeta(pluginKey)?.refresh) {
          return buildDecorations(newState.doc)
        }
        return old.map(tr.mapping, tr.doc)
      },
    },
    props: {
      decorations(state) {
        return pluginKey.getState(state)
      },
      handleDOMEvents: {
        mousedown: (_view, event) => {
          const t = event.target as HTMLElement | null
          if (
            t?.closest?.(`.${KEY_PICKER_CLASS}`) ||
            t?.closest?.('.ext-selection-bubble')
          ) {
            return false
          }
          if (
            !t?.closest?.(`.${TERM_REF_CANDIDATE_CLASS}`) &&
            !t?.closest?.(`.${TERM_REF_FORMER_CLASS}`) &&
            !t?.closest?.(`.${KEY_PICKER_CLASS}`)
          ) {
            picker.hide()
          }
          return false
        },
        click: (view, event) => {
          const target = event.target as HTMLElement | null
          if (target?.closest?.('.ext-term-ref-close')) return false
          if (target?.closest?.(`.${TERM_POPOVER_CLASS}`)) return false
          if (target?.closest?.(`.${KEY_PICKER_CLASS}`)) return false

          const formerEl = target?.closest?.(
            `.${TERM_REF_FORMER_CLASS}`,
          ) as HTMLElement | null
          if (formerEl) {
            event.preventDefault()
            event.stopPropagation()
            const formerTitle =
              formerEl.getAttribute('data-term-former') || ''
            const currentTitles = (
              formerEl.getAttribute('data-term-current-titles') || ''
            )
              .split('\u0001')
              .map((s) => s.trim())
              .filter(Boolean)
            if (!formerTitle || !currentTitles.length) return true
            const pos = view.posAtDOM(formerEl, 0)
            const end = view.posAtDOM(formerEl, formerEl.childNodes.length)
            const from = Math.min(pos, end)
            const to = Math.max(pos, end)
            runtime.showFormerConfirm(
              formerEl,
              formerTitle,
              currentTitles,
              (action, title) => {
                void runtime.handleFormerAction(
                  view,
                  from,
                  to,
                  formerTitle,
                  currentTitles,
                  action,
                  title,
                )
              },
            )
            return true
          }

          const candidate = target?.closest?.(
            `.${TERM_REF_CANDIDATE_CLASS}`,
          ) as HTMLElement | null
          if (candidate) {
            event.preventDefault()
            event.stopPropagation()
            const matchTitle =
              candidate.getAttribute('data-term-title') || ''
            const raw =
              candidate.getAttribute('data-term-candidates') || matchTitle
            const candidates = raw
              .split('\u0001')
              .map((s) => s.trim())
              .filter(Boolean)
            const pos = view.posAtDOM(candidate, 0)
            const end = view.posAtDOM(candidate, candidate.childNodes.length)
            const from = Math.min(pos, end)
            const to = Math.max(pos, end)
            runtime.showCandidateConfirm(candidate, candidates, (title) => {
              const tr = view.state.tr
              if (
                !replaceRangeWithTermRef(
                  tr,
                  view.state.schema,
                  from,
                  to,
                  title,
                )
              ) {
                return
              }
              tr.setMeta(convertPluginKey, { skip: true })
              view.dispatch(tr)
            })
            return true
          }

          const ref = target?.closest?.(
            `.${TERM_REF_CLASS}`,
          ) as HTMLElement | null
          if (!ref) return false

          const termTitle = (
            ref.getAttribute('data-term-title') ||
            ref.querySelector('.ext-term-ref-text')?.textContent ||
            ref.textContent ||
            ''
          ).trim()

          if (
            ref.classList.contains(TERM_REF_INVALID_CLASS) ||
            ref.classList.contains('ext-term-ref-invalid')
          ) {
            event.preventDefault()
            event.stopPropagation()
            void offerCreateMissingTerm(termTitle, view, (existing) => {
              manager.setDoc(view.state.doc)
              manager.open(
                existing,
                (path, focusTermTitle) => {
                  try {
                    useGlossaryStore().requestOpenSource(
                      path,
                      focusTermTitle || existing,
                    )
                  } catch {
                    // ignore
                  }
                },
                ref,
              )
            })
            return true
          }
          if (ref.classList.contains(TERM_REF_CANDIDATE_CLASS)) return false

          manager.setDoc(view.state.doc)
          manager.open(
            termTitle,
            (path, focusTermTitle) => {
              try {
                useGlossaryStore().requestOpenSource(
                  path,
                  focusTermTitle || termTitle,
                )
              } catch {
                // Pinia 未就绪
              }
            },
            ref,
          )
          return true
        },
      },
    },
    view(editorView) {
      manager.setDoc(editorView.state.doc)
      bindTermFlashView(editorView)
      let unsubscribe: (() => void) | null = null
      try {
        unsubscribe = useGlossaryStore().$subscribe(() => {
          const tr = editorView.state.tr.setMeta(pluginKey, { refresh: true })
          editorView.dispatch(tr)
        })
      } catch {
        // Pinia 尚未就绪
      }

      const onDocClick = (e: MouseEvent) => {
        const t = e.target as HTMLElement | null
        if (
          t?.closest?.(`.${KEY_PICKER_CLASS}`) ||
          t?.closest?.('.ext-selection-bubble') ||
          t?.closest?.(`.${TERM_REF_CANDIDATE_CLASS}`)
        ) {
          return
        }
        picker.hide()
      }
      document.addEventListener('mousedown', onDocClick)

      return {
        update(view) {
          manager.setDoc(view.state.doc)
          bindTermFlashView(view)
        },
        destroy() {
          document.removeEventListener('mousedown', onDocClick)
          unsubscribe?.()
          bindTermFlashView(null)
          manager.destroy()
          picker.destroy()
        },
      }
    },
  })
}
