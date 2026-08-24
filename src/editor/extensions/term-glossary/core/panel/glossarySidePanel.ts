/**
 * 右侧「词条」书签模块：常驻占位（内容后续补）。
 */
import { registerRightPanelModule } from '../../../../rightPanelRegistry'

export const TERM_GLOSSARY_PANEL_MODULE_ID = 'term-glossary-panel'

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
      root.className =
        'flex h-full min-h-0 flex-col gap-2 p-3 text-sm text-muted'
      root.innerHTML =
        '<p class="m-0 text-ink font-medium">词条</p>' +
        '<p class="m-0 leading-relaxed">词条列表与检索将在此展示（占位）。</p>' +
        '<p class="m-0 text-xs opacity-80">新建：Ctrl+Alt+T</p>'
      host.appendChild(root)
    },
    unmount() {
      // host 由壳层清空
    },
  })
}
