/**
 * 备注扩展：选区气泡「备注」+ 右侧卡片 + remark(id)[文本] 落库。
 * 整块目标（词条等）另挂节点 attrs：`{remark:id}`。
 */
import type { MarkdownExtension } from '../types'
import { collectLiveRemarkIds } from './apply'
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
    const view = getRemarkEditorView()
    if (view && !view.isDestroyed) {
      pruneRemarkDescriptions(collectLiveRemarkIds(view.state.doc))
    }
    return saveRemarksIntoMarkdown(markdown)
  },

  async onAppStart() {
    bindRemarkPanel()
  },
}

export default remarkExtension
export { REMARK_EXTENSION_ID, REMARK_NODE_NAME, REMARK_PANEL_MODULE_ID } from './constants'
export { openRemarkById } from './bridge'
export { openRemarkFloat, closeRemarkFloat } from './remarkFloat'
