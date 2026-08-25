/**
 * 右侧「词条」书签模块：按定义 .md 文件名分组列出词条，可搜索与跳转。
 */
import { createApp, type App } from 'vue'
import { getActivePinia } from 'pinia'
import { registerRightPanelModule } from '../../../../rightPanelRegistry'
import GlossarySidePanel from './GlossarySidePanel.vue'

export const TERM_GLOSSARY_PANEL_MODULE_ID = 'term-glossary-panel'

let vueApp: App | null = null
let bound = false

export function bindTermGlossaryPanel(): void {
  if (bound) return
  bound = true
  registerRightPanelModule({
    id: TERM_GLOSSARY_PANEL_MODULE_ID,
    label: '词条',
    order: 10,
    isVisible: () => true,
    mount(host) {
      host.replaceChildren()
      const root = document.createElement('div')
      root.className = 'h-full min-h-0'
      host.appendChild(root)
      vueApp = createApp(GlossarySidePanel)
      const pinia = getActivePinia()
      if (pinia) vueApp.use(pinia)
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
