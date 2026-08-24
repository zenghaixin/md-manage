/**
 * 自动确认插件（convertPluginKey）：
 * 边输入边匹配词条，IME 组字期间不抢确认；停顿时静默确认 + 弹出候选 / 曾用名气泡。
 * 依赖 picker、runtime（气泡运行时）与 convertPluginKey，均由主扩展注入。
 */
import {
  NodeSelection,
  Plugin,
  TextSelection,
  type PluginKey,
} from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { TERM_REF_CLASS, TERM_REF_NODE_NAME } from '../shared/constants'
import {
  buildAutoConfirmTransaction,
  replaceRangeWithTermRef,
  selectionAtEditablePos,
} from '../match/convert'
import {
  findConfirmHitOnMatchBreak,
  findConfirmHitOnMaximalMatch,
  findConfirmHitOnExtendableIdle,
} from '../match/match'
import { setActiveTermEditorView } from '../shared/editorViewRef'
import type { KeyPicker } from '../../../../../components/key-picker'
import type { PromptRuntime } from './prompt'

export function createAutoConfirmPlugin(opts: {
  picker: KeyPicker
  convertPluginKey: PluginKey
  runtime: PromptRuntime
}): Plugin {
  const { picker, convertPluginKey, runtime } = opts

  return new Plugin({
    key: convertPluginKey,
    state: {
      init: () => ({ skipAfterUnconfirm: false }),
      apply(tr, value) {
        if (tr.getMeta('termGlossaryUnconfirm')) {
          return { skipAfterUnconfirm: true }
        }
        // 消费掉一次：后续文档变更再恢复自动确认调度
        if (value.skipAfterUnconfirm && tr.docChanged) {
          return { skipAfterUnconfirm: false }
        }
        return value
      },
    },
    // 边输入边校验：新字无法延续最长匹配时立刻弹窗；停手时补弹「已完整且无法再延长」的匹配
    view(editorView) {
      setActiveTermEditorView(editorView)
      let timer: ReturnType<typeof setTimeout> | null = null
      let composing = false
      let skipSchedule = false

      const coordsForRange = (
        view: EditorView,
        from: number,
        to: number,
      ) => {
        try {
          const a = view.coordsAtPos(from)
          const b = view.coordsAtPos(to)
          return {
            left: Math.min(a.left, b.left),
            right: Math.max(a.right, b.right),
            top: Math.min(a.top, b.top),
            bottom: Math.max(a.bottom, b.bottom),
          }
        } catch {
          return null
        }
      }

      const openFound = (
        view: EditorView,
        found:
          | { kind: 'former'; hit: import('./match').FormerHitMatch }
          | { kind: 'candidate'; hit: import('./match').CandidateMatch },
      ) => {
        const resumeAt = found.hit.to
        const resumeTyping = () => {
          requestAnimationFrame(() => {
            if (view.isDestroyed) return
            try {
              view.focus()
              const pos = Math.min(
                Math.max(1, resumeAt),
                view.state.doc.content.size,
              )
              view.dispatch(
                view.state.tr.setSelection(
                  selectionAtEditablePos(view.state.doc, pos),
                ),
              )
            } catch {
              try {
                view.focus()
              } catch {
                // ignore
              }
            }
          })
        }

        // 弹出即失焦，避免用户继续打字冲掉确认
        try {
          view.dom.blur()
        } catch {
          // ignore
        }

        if (found.kind === 'former') {
          const { hit } = found
          const key = `former:${hit.from}:${hit.to}:${hit.formerTitle}`
          if (picker.currentKey === key && picker.isOpen) return
          const anchor = coordsForRange(view, hit.from, hit.to)
          if (!anchor) {
            resumeTyping()
            return
          }
          runtime.showFormerConfirm(
            anchor,
            hit.formerTitle,
            hit.currentTitles,
            (action, title) => {
              void Promise.resolve(
                runtime.handleFormerAction(
                  view,
                  hit.from,
                  hit.to,
                  hit.formerTitle,
                  hit.currentTitles,
                  action,
                  title,
                ),
              ).finally(resumeTyping)
            },
            key,
            resumeTyping,
          )
          return
        }

        const { hit } = found
        const key = `cand:${hit.from}:${hit.to}:${hit.matchTitle}`
        if (picker.currentKey === key && picker.isOpen) return
        const anchor = coordsForRange(view, hit.from, hit.to)
        if (!anchor) {
          resumeTyping()
          return
        }
        runtime.showCandidateConfirm(
          anchor,
          hit.candidates,
          (title) => {
            const tr = view.state.tr
            if (
              !replaceRangeWithTermRef(
                tr,
                view.state.schema,
                hit.from,
                hit.to,
                title,
              )
            ) {
              resumeTyping()
              return
            }
            tr.setMeta(convertPluginKey, { skip: true })
            view.dispatch(tr)
            resumeTyping()
          },
          key,
          resumeTyping,
        )
      }

      /** 最长且不可延长 → 立刻弹（曾用名 / 抑制自动确认） */
      const tryMaximalPrompt = (view: EditorView): boolean => {
        if (view.isDestroyed) return false
        if (document.activeElement?.closest?.('.ext-term-title')) return false
        if (!view.state.selection.empty) return false
        if (picker.isOpen) return false
        const found = findConfirmHitOnMaximalMatch(
          view.state.doc,
          view.state.selection.from,
        )
        if (!found) return false
        openFound(view, found)
        return true
      }

      const tryBreakPrompt = (view: EditorView): boolean => {
        if (view.isDestroyed) return false
        if (document.activeElement?.closest?.('.ext-term-title')) return false
        if (!view.state.selection.empty) return false
        if (picker.isOpen) return false
        const found = findConfirmHitOnMatchBreak(
          view.state.doc,
          view.state.selection.from,
        )
        if (!found) return false
        openFound(view, found)
        return true
      }

      /** 还可延长（如 暴击→暴击率）→ 停顿后弹相关 */
      const tryExtendablePrompt = (view: EditorView): boolean => {
        if (view.isDestroyed) return false
        if (document.activeElement?.closest?.('.ext-term-title')) return false
        if (!view.state.selection.empty) return false
        if (picker.isOpen) return false
        const found = findConfirmHitOnExtendableIdle(
          view.state.doc,
          view.state.selection.from,
        )
        if (!found) return false
        openFound(view, found)
        return true
      }

      const runIdle = () => {
        if (composing || editorView.isDestroyed) return
        if (convertPluginKey.getState(editorView.state)?.skipAfterUnconfirm) {
          return
        }
        if (document.activeElement?.closest?.('.ext-term-title')) return
        if (picker.isOpen) return

        // 先静默确认已完整且不可延长的正式标题
        const tr = editorView.state.tr
        const next = buildAutoConfirmTransaction(tr, editorView.state.schema)
        if (next) {
          next.setMeta(convertPluginKey, { skip: true })
          skipSchedule = true
          editorView.dispatch(next)
          // focus 后浏览器可能误选中 atom，再校正到后方
          requestAnimationFrame(() => {
            if (editorView.isDestroyed) return
            try {
              const sel = editorView.state.selection
              if (
                sel instanceof NodeSelection &&
                sel.node.type.name === TERM_REF_NODE_NAME
              ) {
                editorView.dispatch(
                  editorView.state.tr.setSelection(
                    selectionAtEditablePos(editorView.state.doc, sel.to),
                  ),
                )
              }
              if (!document.activeElement?.closest?.('.ext-term-title')) {
                editorView.focus()
              }
            } catch {
              // ignore
            }
          })
        }

        tryMaximalPrompt(editorView) ||
          tryBreakPrompt(editorView) ||
          tryExtendablePrompt(editorView)
      }

      const scheduleIdle = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(runIdle, 350)
      }

      const onCompStart = () => {
        composing = true
        if (timer) clearTimeout(timer)
      }
      const onCompEnd = () => {
        composing = false
        // 组字结束：不可延长则立刻弹；否则等停顿
        if (!tryMaximalPrompt(editorView) && !tryBreakPrompt(editorView)) {
          scheduleIdle()
        }
      }
      editorView.dom.addEventListener('compositionstart', onCompStart)
      editorView.dom.addEventListener('compositionend', onCompEnd)
      scheduleIdle()

      return {
        update(view, prevState) {
          if (composing) return
          // 弹窗期间不处理输入驱动的更新（编辑器已失焦）
          if (picker.isOpen) return

          if (view.state.doc.eq(prevState.doc)) return

          if (skipSchedule) {
            skipSchedule = false
            tryMaximalPrompt(view) || tryBreakPrompt(view)
            return
          }
          if (convertPluginKey.getState(view.state)?.skipAfterUnconfirm) {
            if (timer) clearTimeout(timer)
            timer = null
            return
          }

          // 不可延长 → 立刻弹；可延长 → 等停顿
          if (tryMaximalPrompt(view) || tryBreakPrompt(view)) {
            if (timer) clearTimeout(timer)
            return
          }

          scheduleIdle()
        },
        destroy() {
          if (timer) clearTimeout(timer)
          editorView.dom.removeEventListener(
            'compositionstart',
            onCompStart,
          )
          editorView.dom.removeEventListener('compositionend', onCompEnd)
          setActiveTermEditorView(null)
        },
      }
    },
    props: {
      /**
       * 选中整个 termRef（NodeSelection）时直接打字会“没反应”或整颗删掉；
       * 先把光标挪到 atom 后方再插入字符。
       */
      handleKeyDown(view, event) {
        // 确认弹窗打开时禁止继续往正文打字（选词数字 / 固定操作键由弹窗 capture 处理）
        if (picker.isOpen) {
          if (event.key >= '1' && event.key <= '9') return true
          if (
            event.key === '0' ||
            event.key === '-' ||
            event.key === '_' ||
            event.key === 'Escape'
          ) {
            return true
          }
          event.preventDefault()
          return true
        }

        const { selection } = view.state
        if (!(selection instanceof NodeSelection)) return false
        if (selection.node.type.name !== TERM_REF_NODE_NAME) return false
        if (event.ctrlKey || event.metaKey || event.altKey) return false

        // 输入法组字前先把光标挪到 atom 后，避免整颗被替换
        if (event.key === 'Process' || event.isComposing) {
          view.dispatch(
            view.state.tr.setSelection(
              selectionAtEditablePos(view.state.doc, selection.to),
            ),
          )
          return false
        }

        const isPrintable =
          event.key.length === 1 || event.key === 'Enter'
        if (!isPrintable) return false

        const after = selection.to
        const tr = view.state.tr.setSelection(
          selectionAtEditablePos(view.state.doc, after),
        )
        if (event.key === 'Enter') {
          view.dispatch(tr.split(tr.selection.from))
          return true
        }
        if (event.key.length === 1) {
          view.dispatch(tr.insertText(event.key))
          return true
        }
        view.dispatch(tr)
        return false
      },
      /** DOM 选区若误入 contenteditable=false 的 atom，校正回可编辑位置 */
      handleDOMEvents: {
        compositionstart(view) {
          const sel = view.state.selection
          if (
            sel instanceof NodeSelection &&
            sel.node.type.name === TERM_REF_NODE_NAME
          ) {
            view.dispatch(
              view.state.tr.setSelection(
                selectionAtEditablePos(view.state.doc, sel.to),
              ),
            )
          }
          return false
        },
        beforeinput(view, event) {
          const sel = view.state.selection
          if (
            sel instanceof NodeSelection &&
            sel.node.type.name === TERM_REF_NODE_NAME
          ) {
            event.preventDefault()
            const after = sel.to
            const tr = view.state.tr.setSelection(
              selectionAtEditablePos(view.state.doc, after),
            )
            const data = (event as InputEvent).data
            if (data) tr.insertText(data)
            view.dispatch(tr)
            return true
          }
          if (!(sel instanceof TextSelection) || !sel.empty) return false
          const $pos = sel.$from
          if ($pos.nodeAfter?.type.name === TERM_REF_NODE_NAME) {
            // 紧贴 atom 前输入是合法的，不必拦截
            return false
          }
          const anchor = window.getSelection()?.anchorNode as Node | null
          if (!anchor) return false
          const inRef =
            anchor instanceof Element
              ? anchor.closest?.(`.${TERM_REF_CLASS}`)
              : anchor.parentElement?.closest?.(`.${TERM_REF_CLASS}`)
          if (!inRef) return false

          event.preventDefault()
          const pos = view.posAtDOM(inRef, inRef.childNodes.length)
          const tr = view.state.tr.setSelection(
            selectionAtEditablePos(view.state.doc, pos),
          )
          const data = (event as InputEvent).data
          if (data) tr.insertText(data)
          view.dispatch(tr)
          return true
        },
      },
    },
  })
}
