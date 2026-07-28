/**
 * 备注扩展：选区气泡「备注」+ 右侧卡片 + remark(id)[文本] 落库。
 */
import type { MarkdownExtension } from '../types'
import { RemarkBridgeExtension } from './bridgeExtension'
import { REMARK_EXTENSION_ID, REMARK_NODE_NAME } from './constants'
import { RemarkNode } from './node'
import { bindRemarkPanel } from './panel'
import {
  loadRemarksFromMarkdown,
  pruneRemarkDescriptions,
  saveRemarksIntoMarkdown,
} from './storage'
import { getRemarkEditorView } from './bridge'

const remarkExtension: MarkdownExtension = {
  id: REMARK_EXTENSION_ID,

  parseMarkdown() {
    return []
  },

  serializeMarkdown() {
    return ''
  },

  getTiptapExtensions: () => [RemarkNode, RemarkBridgeExtension],

  getGlobalMatchRule: () => ({ findMatches: () => [] }),

  transformFromStorage(markdown: string, path?: string) {
    return loadRemarksFromMarkdown(path || '', markdown)
  },

  transformToStorage(markdown: string) {
    // 裁剪正文中已不存在的 id
    const view = getRemarkEditorView()
    if (view && !view.isDestroyed) {
      const live = new Set<string>()
      view.state.doc.descendants((node) => {
        if (node.type.name === REMARK_NODE_NAME) {
          const id = String(node.attrs.id || '').trim()
          if (id) live.add(id)
        }
      })
      pruneRemarkDescriptions(live)
    }
    return saveRemarksIntoMarkdown(markdown)
  },

  async onAppStart() {
    bindRemarkPanel()
  },
}

export default remarkExtension
export { REMARK_EXTENSION_ID, REMARK_NODE_NAME, REMARK_PANEL_MODULE_ID } from './constants'
