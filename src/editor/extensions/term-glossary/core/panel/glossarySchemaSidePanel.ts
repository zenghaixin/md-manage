/**
 * 右侧「通用字段」书签：入口文件级字段模板，与「词条汇总」分离。
 */
import { createApp, type App } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { getActivePinia } from 'pinia'
import { registerRightPanelModule } from '../../../../rightPanelRegistry'
import GlossarySchemaSidePanel from './GlossarySchemaSidePanel.vue'

export const TERM_SCHEMA_PANEL_MODULE_ID = 'term-schema-panel'

let vueApp: App | null = null
let bound = false

export function bindTermSchemaPanel(): void {
  if (bound) return
  bound = true
  registerRightPanelModule({
    id: TERM_SCHEMA_PANEL_MODULE_ID,
    label: '通用字段',
    order: 15,
    defaultWidth: 520,
    isVisible: () => true,
    mount(host) {
      host.replaceChildren()
      const root = document.createElement('div')
      root.className = 'h-full min-h-0'
      host.appendChild(root)
      vueApp = createApp(GlossarySchemaSidePanel)
      const pinia = getActivePinia()
      if (pinia) vueApp.use(pinia)
      // TermRefSourcePicker 依赖 el-popover
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
