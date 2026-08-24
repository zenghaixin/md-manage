/**
 * 备注浮层：挂到 body，与词条预览同套 DraggableFloat + cascade 错位。
 */
import {
  closeFloatHost,
  openFloatHost,
  nextFloatZIndex,
  type FloatHostMount,
} from '../../../components/draggable-float'
import RemarkFloat from './RemarkFloat.vue'
import { getRemarkDescription } from './storage'

const REMARK_W = 360
const REMARK_H = 320
const CASCADE_ID = 'remark-float'

let floatMount: FloatHostMount | null = null
let currentId = ''

function teardown() {
  closeFloatHost(floatMount)
  floatMount = null
  currentId = ''
}

export function closeRemarkFloat() {
  teardown()
}

/** 打开 / 聚焦备注浮层 */
export function openRemarkFloat(opts: {
  remarkId: string
  label?: string
  /** 当前弹窗 / 锚点：贴其右侧打开 */
  besideRect?: {
    left: number
    right: number
    top: number
    bottom: number
  } | null
  /** @deprecated 使用 besideRect */
  place?: { left: number; top: number }
  /** 跨页写回定义文件 */
  sourcePath?: string
  initialDescription?: string | null
}): void {
  const id = String(opts.remarkId || '').trim()
  if (!id) return

  // 同一条已打开：置顶 + 闪烁
  if (currentId === id && floatMount) {
    floatMount.host.syncDraftFromStore?.()
    floatMount.host.bringFront?.()
    return
  }

  teardown()
  currentId = id

  const initial =
    opts.initialDescription != null
      ? String(opts.initialDescription)
      : getRemarkDescription(id)

  let mount!: FloatHostMount
  mount = openFloatHost({
    cascadeId: CASCADE_ID,
    width: REMARK_W,
    height: REMARK_H,
    besideRect: opts.besideRect,
    rootClassName: 'ext-remark-float-root',
    component: RemarkFloat,
    props: ({ place, zIndex }) => ({
      remarkId: id,
      label: String(opts.label || ''),
      floatLeft: place.left,
      floatTop: place.top,
      zIndex,
      sourcePath: String(opts.sourcePath || ''),
      initialDescription: initial,
      onClose: () => {
        teardown()
      },
      onFocus: () => {
        mount.host.setZIndex?.(nextFloatZIndex())
      },
    }),
  })
  floatMount = mount
}

export function isRemarkFloatOpen(remarkId?: string): boolean {
  if (!floatMount) return false
  if (!remarkId) return true
  return currentId === String(remarkId).trim()
}
