/**
 * 右侧「备注」书签模块：当前页有备注时才显示。
 */
import { createApp, type App } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { registerRightPanelModule } from '../../../editor/rightPanelRegistry'
import { hasRemarksInEditor } from './bridge'
import { REMARK_PANEL_MODULE_ID } from './constants'
import RemarkSidePanel from './RemarkSidePanel.vue'

let vueApp: App | null = null
let bound = false

export function bindRemarkPanel(): void {
  if (bound) return
  bound = true
  registerRightPanelModule({
    id: REMARK_PANEL_MODULE_ID,
    label: '备注',
    order: 20,
    isVisible: () => hasRemarksInEditor(),
    mount(host) {
      host.replaceChildren()
      const root = document.createElement('div')
      root.className = 'h-full min-h-0'
      host.appendChild(root)
      vueApp = createApp(RemarkSidePanel)
      vueApp.use(ElementPlus, { locale: zhCn })
      vueApp.mount(root)
    },
    unmount() {
      try {
        vueApp?.unmount()
      } catch {
        // ignore
      }
      vueApp = null
    },
  })
}
