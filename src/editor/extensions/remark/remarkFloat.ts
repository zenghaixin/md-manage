/**
 * 备注浮层：挂到 body，与词条预览同套 DraggableFloat + cascade 错位。
 */
import { createApp, type App } from 'vue'
import { getActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import {
  allocateCascadePlace,
  registerCascadeFloat,
  unregisterCascadeFloat,
} from '../../../components/floatCascade'
import { nextFloatZIndex } from '../../../components/floatZIndex'
import RemarkFloat from './RemarkFloat.vue'
import { getRemarkDescription } from './storage'

const REMARK_W = 360
const REMARK_H = 320
const CASCADE_ID = 'remark-float'

let vueApp: App | null = null
let rootEl: HTMLDivElement | null = null
let currentId = ''
let hostRef: {
  flash: () => void
  setZIndex: (z: number) => void
  bringFront: () => number
  setPosition: (left: number, top: number) => void
  getBoundingClientRect: () => DOMRect | null
  syncDraftFromStore: () => void
} | null = null

function teardown() {
  unregisterCascadeFloat(CASCADE_ID)
  if (vueApp) {
    try {
      vueApp.unmount()
    } catch {
      // ignore
    }
    vueApp = null
  }
  rootEl?.remove()
  rootEl = null
  currentId = ''
  hostRef = null
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
  if (currentId === id && vueApp && hostRef) {
    hostRef.syncDraftFromStore()
    hostRef.bringFront()
    return
  }

  teardown()

  const root = document.createElement('div')
  root.className = 'ext-remark-float-root'
  document.body.appendChild(root)
  rootEl = root
  currentId = id

  const z = nextFloatZIndex()
  const place = allocateCascadePlace({
    width: REMARK_W,
    height: REMARK_H,
    besideRect: opts.besideRect,
  })
  const initial =
    opts.initialDescription != null
      ? String(opts.initialDescription)
      : getRemarkDescription(id)

  vueApp = createApp(RemarkFloat, {
    remarkId: id,
    label: String(opts.label || ''),
    floatLeft: place.left,
    floatTop: place.top,
    zIndex: z,
    sourcePath: String(opts.sourcePath || ''),
    initialDescription: initial,
    onClose: () => {
      teardown()
    },
    onFocus: () => {
      hostRef?.setZIndex(nextFloatZIndex())
    },
  })
  const pinia = getActivePinia()
  if (pinia) vueApp.use(pinia)
  vueApp.use(ElementPlus, { locale: zhCn })
  const instance = vueApp.mount(root) as {
    flash?: () => void
    setZIndex?: (z: number) => void
    bringFront?: () => number
    setPosition?: (left: number, top: number) => void
    getBoundingClientRect?: () => DOMRect | null
    syncDraftFromStore?: () => void
  }
  hostRef = {
    flash: () => instance.flash?.(),
    setZIndex: (next) => instance.setZIndex?.(next),
    bringFront: () => instance.bringFront?.() ?? nextFloatZIndex(),
    setPosition: (left, top) => instance.setPosition?.(left, top),
    getBoundingClientRect: () => instance.getBoundingClientRect?.() ?? null,
    syncDraftFromStore: () => instance.syncDraftFromStore?.(),
  }
  registerCascadeFloat(CASCADE_ID, () => hostRef?.getBoundingClientRect() ?? null)
}

export function isRemarkFloatOpen(remarkId?: string): boolean {
  if (!vueApp) return false
  if (!remarkId) return true
  return currentId === String(remarkId).trim()
}
