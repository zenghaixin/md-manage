import type { ExtensionNode, MarkdownExtension } from './types'

const extensions = new Map<string, MarkdownExtension>()

/** 注册一个扩展；同 id 重复注册会覆盖 */
export function registerExtension(extension: MarkdownExtension): void {
  if (!extension?.id) {
    throw new Error('[extensions] extension.id is required')
  }
  extensions.set(extension.id, extension)
}

export function unregisterExtension(id: string): boolean {
  return extensions.delete(id)
}

export function getExtension(id: string): MarkdownExtension | undefined {
  return extensions.get(id)
}

export function getAllExtensions(): MarkdownExtension[] {
  return Array.from(extensions.values())
}

/** 用所有已注册扩展解析全文，按 range.from 排序 */
export function parseAllMarkdown(text: string): ExtensionNode[] {
  const nodes: ExtensionNode[] = []
  for (const ext of extensions.values()) {
    nodes.push(...ext.parseMarkdown(text))
  }
  return nodes.sort((a, b) => (a.range?.from ?? 0) - (b.range?.from ?? 0))
}

/** 将节点序列化回自定义 Markdown（按扩展 id 分发） */
export function serializeNode(node: ExtensionNode): string {
  const ext = extensions.get(node.extensionId)
  if (!ext) {
    throw new Error(`[extensions] unknown extension: ${node.extensionId}`)
  }
  return ext.serializeMarkdown(node)
}

/** 收集所有扩展的全局匹配规则 */
export function getAllGlobalMatchRules() {
  return getAllExtensions().map((ext) => ({
    id: ext.id,
    rule: ext.getGlobalMatchRule(),
  }))
}

