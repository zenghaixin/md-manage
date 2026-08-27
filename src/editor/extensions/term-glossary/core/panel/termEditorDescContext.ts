/** 词条编辑浮层内的 MarkdownField 描述编辑器 */
export function isTermEditorDescView(
  view: import('@tiptap/pm/view').EditorView,
): boolean {
  return !!view.dom.closest?.('.ext-term-editor-float-root')
}
