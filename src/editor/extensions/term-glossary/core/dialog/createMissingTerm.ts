/**
 * 点击无效 term[标题]：提示是否新建词条；确认后插入定义块并写入 Store。
 */
import type { EditorView } from '@tiptap/pm/view'
import { useGlossaryStore } from '../../../../../stores/glossary'
import {
  alertError,
  confirmAction,
  confirmChoice,
} from '../../../../../composables/useDialog'
import { TERM_NODE_NAME } from '../shared/constants'
import { sanitizeTermTitle } from '../model/syntax'

/**
 * @returns 是否已处理（含用户取消）
 */
export async function offerCreateMissingTerm(
  rawTitle: string,
  view?: EditorView | null,
  onOpenExisting?: (title: string) => void,
): Promise<boolean> {
  const title = sanitizeTermTitle(rawTitle)
  if (!title) return false

  try {
    const store = useGlossaryStore()
    if (store.getTerm(title)) return false

    // 撞曾用名
    let ownerOfFormer: string | null = null
    for (const [t, term] of Object.entries(store.terms)) {
      if ((term.formerTitles || []).includes(title)) {
        ownerOfFormer = t
        break
      }
    }
    if (ownerOfFormer) {
      const choice = await confirmChoice(
        `「${title}」是词条「${ownerOfFormer}」的曾用名，请选择：`,
        '曾用名冲突',
        {
          confirmText: '打开已有词条',
          cancelText: '作为新词条',
          type: 'warning',
        },
      )
      if (choice === 'close') return true
      if (choice === 'confirm') {
        onOpenExisting?.(ownerOfFormer)
        return true
      }
      const stripped = store.stripFormerTitle(title)
      await store.persistTerms(stripped)
    } else {
      const ok = await confirmAction(
        `没有对应词条「${title}」，是否新建？`,
        '新建词条',
        { type: 'info', confirmButtonText: '新建', cancelButtonText: '取消' },
      )
      if (!ok) return true
    }

    // 乐观写入 Store，使红线立刻变蓝
    const terms = { ...store.terms }
    terms[title] = {
      title,
      description: '',
      sourcePath: '',
      ignoreContexts: [],
      formerTitles: [],
      pendingManualConfirm: [],
    }
    await store.persistTerms(terms)

    // 当前编辑器内插入定义块
    if (view) {
      const type = view.state.schema.nodes[TERM_NODE_NAME]
      const paragraph = view.state.schema.nodes.paragraph
      if (type && paragraph) {
        const node = type.create(
          { title },
          paragraph.create(),
        )
        const tr = view.state.tr.insert(view.state.doc.content.size, node)
        view.dispatch(tr.scrollIntoView())
      }
    }
  } catch (err) {
    console.warn('[term] create missing term failed:', err)
    await alertError(err instanceof Error ? err.message : '新建词条失败')
  }
  return true
}
