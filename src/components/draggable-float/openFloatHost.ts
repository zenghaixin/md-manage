/**
 * 统一 body 级拖拽浮层挂载：allocateCascadePlace + createApp + registerCascadeFloat + teardown。
 * 扩展浮层应优先使用本模块，避免重复 createApp / 级联登记样板代码。
 */
import { createApp, type App, type Component } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { getActivePinia } from 'pinia'
import {
  allocateCascadePlace,
  registerCascadeFloat,
  unregisterCascadeFloat,
  type CascadeAnchor,
} from './floatCascade'
import { nextFloatZIndex } from './floatZIndex'

export type FloatHostContext = {
  place: { left: number; top: number }
  zIndex: number
}

/** Vue 浮层宿主组件通过 defineExpose 暴露的方法 */
export type FloatHostInstance = {
  flash?: () => void
  setZIndex?: (z: number) => void
  bringFront?: () => number
  setPosition?: (left: number, top: number) => void
  getBoundingClientRect?: () => DOMRect | null
  syncDraftFromStore?: () => void
  syncFromResolved?: (...args: unknown[]) => void
  [key: string]: unknown
}

export interface FloatHostMount {
  vueApp: App
  rootEl: HTMLDivElement
  place: { left: number; top: number }
  zIndex: number
  host: FloatHostInstance
  cascadeId: string
  close: () => void
  /** 预览弹窗改标题等场景：更换级联登记 id */
  setCascadeId: (id: string) => void
}

export interface OpenFloatHostOptions {
  cascadeId: string
  width: number
  height: number
  besideRect?: CascadeAnchor | null
  anchorRect?: CascadeAnchor | null
  rootClassName: string
  component: Component
  props?:
    | Record<string, unknown>
    | ((ctx: FloatHostContext) => Record<string, unknown>)
  zIndex?: number
  /** 默认 true：挂载 pinia + ElementPlus(zhCn) */
  useDefaultPlugins?: boolean
}

export function openFloatHost(opts: OpenFloatHostOptions): FloatHostMount {
  const root = document.createElement('div')
  root.className = opts.rootClassName
  document.body.appendChild(root)

  const place = allocateCascadePlace({
    width: opts.width,
    height: opts.height,
    besideRect: opts.besideRect,
    anchorRect: opts.anchorRect,
  })
  const zIndex = opts.zIndex ?? nextFloatZIndex()

  const ctx: FloatHostContext = { place, zIndex }
  const props =
    typeof opts.props === 'function' ? opts.props(ctx) : (opts.props ?? {})

  const vueApp = createApp(opts.component, props)

  if (opts.useDefaultPlugins !== false) {
    const pinia = getActivePinia()
    if (pinia) vueApp.use(pinia)
    vueApp.use(ElementPlus, { locale: zhCn })
  }

  const instance = vueApp.mount(root) as FloatHostInstance

  let cascadeId = opts.cascadeId
  const getRect = () => instance.getBoundingClientRect?.() ?? null
  registerCascadeFloat(cascadeId, getRect)

  const mount: FloatHostMount = {
    vueApp,
    rootEl: root,
    place,
    zIndex,
    host: instance,
    cascadeId,
    close: () => closeFloatHost(mount),
    setCascadeId: (id: string) => {
      if (id === cascadeId) return
      unregisterCascadeFloat(cascadeId)
      cascadeId = id
      mount.cascadeId = id
      registerCascadeFloat(cascadeId, getRect)
    },
  }

  return mount
}

export function closeFloatHost(mount: FloatHostMount | null | undefined): void {
  if (!mount) return
  unregisterCascadeFloat(mount.cascadeId)
  if (mount.vueApp) {
    try {
      mount.vueApp.unmount()
    } catch {
      // ignore
    }
  }
  mount.rootEl?.remove()
}
