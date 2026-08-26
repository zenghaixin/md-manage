/**
 * 各处打开词条预览浮层（正文引用、定义块内引用、描述编辑器、预览弹窗嵌套）。
 * 与主编辑器 clickPlugin 共用同一个 TermDialogManager，避免叠两套。
 */
import { useGlossaryStore } from '../../../../../stores/glossary'
import { getActiveTermEditor } from '../shared/editorViewRef'
import { TermDialogManager } from './dialogManager'

let live: TermDialogManager | null = null
let fallback: TermDialogManager | null = null

export function setLiveTermDialogManager(manager: TermDialogManager | null) {
  live = manager
}

function manager(): TermDialogManager {
  if (live) return live
  if (!fallback) fallback = new TermDialogManager()
  return fallback
}

export function openTermPreview(
  title: string,
  anchor?: HTMLElement | null,
) {
  const key = String(title ?? '').trim()
  if (!key) return
  const mgr = manager()
  const editor = getActiveTermEditor()
  if (editor && !editor.isDestroyed) {
    mgr.setDoc(editor.state.doc)
  }
  mgr.open(
    key,
    (path, focusTermTitle) => {
      try {
        useGlossaryStore().requestOpenSource(path, focusTermTitle || key)
      } catch {
        // Pinia 未就绪
      }
    },
    anchor,
  )
}
