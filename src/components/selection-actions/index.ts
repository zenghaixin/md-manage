/**
 * 全局选区动作气泡（与 OpsSidePanel 同属壳层组件能力，非 Markdown 自定义标签扩展）。
 */
export { SelectionActionsExtension } from './plugin'
export { registerSelectionAction, listSelectionActions } from './registry'
export type { SelectionAction, SelectionActionContext } from './types'
