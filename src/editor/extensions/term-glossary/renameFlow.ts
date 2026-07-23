/**
 * 词条改名统一流程：
 * 1) 禁止自动确认（内存）+ 清空 pending，等扫描写入
 * 2) 当前编辑器内同步 termRef 旧名→新名
 * 3) 存盘
 * 4) 全库磁盘同步 term[旧/曾用名]→term[新] 并扫描冲突写入 pending
 * 5) 有冲突则询问后打开抽屉
 */
import { useGlossaryStore } from '../../../stores/glossary'
import {
  requestReloadFilePath,
  requestSaveCurrentFile,
} from '../../../editor/shellEvents'
import { alertError } from '../../../composables/useDialog'
import {
  clearAutoConfirmSuppress,
  suppressAutoConfirmForTitle,
} from './match'
import { rewriteOpenEditorTermRefs } from './renameRefs'
import { sanitizeTermTitle } from './syntax'
import { runRenameSyncAndOpenDrawer } from './conflictDrawer'
import { getActiveTermEditorView } from './editorViewRef'

export interface CommitTermRenameOptions {
  oldTitle: string
  newTitle: string
  description?: string
  sourcePath?: string
  /** 当前 TipTap Editor（用于当场改 termRef）；可不传 */
  editor?: { view: import('@tiptap/pm/view').EditorView } | null
  /**
   * 是否先把当前编辑器内容存盘（正文内改标题时需要）。
   * 弹窗保存若已自行写盘，可传 false。
   */
  saveCurrent?: boolean
}

export async function commitTermRename(
  options: CommitTermRenameOptions,
): Promise<boolean> {
  const oldTitle = sanitizeTermTitle(options.oldTitle)
  const newTitle = sanitizeTermTitle(options.newTitle)
  if (!oldTitle || !newTitle || oldTitle === newTitle) return false

  const store = useGlossaryStore()
  const prev = store.getTerm(oldTitle)
  const description =
    options.description != null
      ? String(options.description)
      : prev?.description || ''
  const sourcePath = options.sourcePath ?? prev?.sourcePath ?? ''
  const formerBefore = [...(prev?.formerTitles || [])]

  // 必须在写入词表 / 存盘 / 重载之前禁止自动确认
  suppressAutoConfirmForTitle(newTitle)

  const prepared = store.prepareRename(
    oldTitle,
    newTitle,
    description,
    sourcePath,
  )
  if (prepared) await store.persistTerms(prepared)

  // 当前打开文档里的已确认引用立刻改名（不要等磁盘 reload）
  const titlesToRewrite = Array.from(
    new Set([oldTitle, ...formerBefore].map((t) => sanitizeTermTitle(t)).filter(Boolean)),
  )
  rewriteOpenEditorTermRefs(
    options.editor?.view ?? getActiveTermEditorView(),
    titlesToRewrite,
    newTitle,
  )

  if (options.saveCurrent !== false) {
    await requestSaveCurrentFile()
  }

  try {
    await runRenameSyncAndOpenDrawer(oldTitle, newTitle, {
      alsoReplace: titlesToRewrite,
    })
  } catch (err) {
    clearAutoConfirmSuppress(newTitle)
    const msg =
      err instanceof Error ? err.message : '全库冲突扫描失败，请确认 API 服务已重启'
    await alertError(
      `${msg}\n\n若刚更新过代码，请重新运行 npm run dev（需同时启动 api 与 web）。`,
      '改名同步失败',
    )
    return false
  }

  if (sourcePath) requestReloadFilePath(sourcePath)
  return true
}
