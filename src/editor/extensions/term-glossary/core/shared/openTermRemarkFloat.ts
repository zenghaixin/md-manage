/**
 * 从预览 / 编辑浮层打开词条备注（支持定义在其它文件）。
 */
import { alertError } from '../../../../../composables/useDialog'
import type { CascadeAnchor } from '../../../../../components/floatCascade'
import { openRemarkFloat } from '../../../remark/remarkFloat'
import { resolveTermRemarkForTitle } from './remoteTermRemark'

export async function openTermRemarkFloat(opts: {
  title: string
  sourcePath?: string
  /** 当前弹窗矩形：新备注贴其右侧 */
  besideRect?: CascadeAnchor | null
  /** @deprecated 使用 besideRect */
  place?: { left: number; top: number }
}): Promise<void> {
  const title = String(opts.title || '').trim()
  if (!title) return

  try {
    const resolved = await resolveTermRemarkForTitle(title, opts.sourcePath)
    if (!resolved?.remarkId) {
      await alertError('找不到该词条的定义，无法打开备注')
      return
    }
    openRemarkFloat({
      remarkId: resolved.remarkId,
      label: title,
      besideRect: opts.besideRect,
      sourcePath: resolved.sourcePath || undefined,
      initialDescription: resolved.description,
    })
  } catch (err) {
    console.warn('[term-remark] open failed:', err)
    await alertError(err instanceof Error ? err.message : '打开备注失败')
  }
}
