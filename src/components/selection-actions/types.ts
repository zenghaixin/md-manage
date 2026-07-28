/**
 * 全局选区动作：各扩展注册，共享气泡展示。
 */
export type SelectionActionContext = {
  view: import('@tiptap/pm/view').EditorView
  from: number
  to: number
  text: string
  coords: DOMRect
}

export type SelectionAction = {
  id: string
  label: string
  order?: number
  isVisible: (ctx: SelectionActionContext) => boolean
  run: (ctx: SelectionActionContext) => void | Promise<void>
}
