/**
 * MarkdownField lite：点击描述里的 termRef 打开词条预览。
 * 主文档已有 clickPlugin；lite 不含交互插件，需单独挂。
 */
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import {
  TERM_REF_CANDIDATE_CLASS,
  TERM_REF_CLASS,
  TERM_REF_INVALID_CLASS,
} from '../shared/constants'
import { offerCreateMissingTerm } from '../dialog/createMissingTerm'
import { openTermPreview } from '../dialog/openPreview'

export const TermRefPreviewClick = Extension.create({
  name: 'termRefPreviewClick',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click(view, event) {
              const target = event.target as HTMLElement | null
              if (target?.closest?.('.ext-term-ref-close')) return false
              const ref = target?.closest?.(
                `.${TERM_REF_CLASS}`,
              ) as HTMLElement | null
              if (!ref || !view.dom.contains(ref)) return false
              if (ref.classList.contains(TERM_REF_CANDIDATE_CLASS)) return false

              event.preventDefault()
              event.stopPropagation()
              const title = (
                ref.getAttribute('data-term-title') ||
                ref.querySelector('.ext-term-ref-text')?.textContent ||
                ref.textContent ||
                ''
              ).trim()
              if (!title) return true

              if (
                ref.classList.contains(TERM_REF_INVALID_CLASS) ||
                ref.classList.contains('ext-term-ref-invalid')
              ) {
                void offerCreateMissingTerm(title, view)
                return true
              }
              openTermPreview(title, ref)
              return true
            },
          },
        },
      }),
    ]
  },
})

export default TermRefPreviewClick
