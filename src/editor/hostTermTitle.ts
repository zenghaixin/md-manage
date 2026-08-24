/**
 * 嵌套 Markdown 编辑器的宿主词条标题上下文。
 * 描述内同名不触发词条确认/灰线；由 MarkdownField 写入，扩展 match 读取。
 */

let hostTermTitle: string | null = null

export function setHostTermTitle(title: string | null): void {
  const t = String(title ?? '').trim()
  hostTermTitle = t || null
}

export function getHostTermTitle(): string | null {
  return hostTermTitle
}
