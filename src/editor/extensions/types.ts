/**
 * 编辑器自定义语法扩展的统一契约。
 * 每个扩展独占 `src/editor/extensions/<id>/`，并通过 `index.ts` 导出符合此接口的对象。
 */

import type { AnyExtension } from '@tiptap/core'

/** 扩展解析后的内部节点（与落库 Markdown 文本解耦） */
export interface ExtensionNode {
  /** 节点类型，通常与扩展 id 一致或为其子类型 */
  type: string
  /** 所属扩展 id */
  extensionId: string
  /** 扩展自定义属性 */
  attrs: Record<string, unknown>
  /** 节点正文 / 描述等文本内容 */
  content?: string
  /** 匹配到的原文片段（便于调试与往返校验） */
  raw?: string
  /** 在原文中的起止偏移（可选） */
  range?: { from: number; to: number }
}

/** 全局正文匹配结果（用于在非定义处高亮「标题」等） */
export interface GlobalMatch {
  from: number
  to: number
  /** 命中的标题 / 关键词 */
  title: string
  extensionId: string
  meta?: Record<string, unknown>
}

/**
 * 全局匹配规则：在正文其他位置匹配扩展定义过的「标题」。
 * 由扩展自行决定如何收集标题、如何扫描文本。
 */
export interface GlobalMatchRule {
  /**
   * 在 `text` 中查找匹配。
   * @param text 当前文档全文
   * @param nodes 可选：当前文档已解析出的扩展节点（用于提取标题列表）
   */
  findMatches(text: string, nodes?: ExtensionNode[]): GlobalMatch[]
}

/**
 * 统一扩展接口。
 * 每个扩展文件夹内的 `index.ts` 必须导出符合此形状的默认或命名对象。
 */
export interface MarkdownExtension {
  /** 扩展唯一标识，如 `"term-glossary"` */
  readonly id: string

  /**
   * 将落库的自定义 Markdown 文本解析为编辑器内部节点。
   * 只负责本扩展语法；未识别部分应忽略。
   */
  parseMarkdown(text: string): ExtensionNode[]

  /**
   * 将编辑器内部节点还原为落库的自定义 Markdown 文本。
   * 例如：`::: term [标题] 描述 :::`
   */
  serializeMarkdown(node: ExtensionNode): string

  /**
   * 返回本扩展贡献的 TipTap Extension / Node / Mark 列表。
   */
  getTiptapExtensions(): AnyExtension[]

  /**
   * 返回用于全局文本匹配的规则（在正文其他地方匹配「标题」）。
   */
  getGlobalMatchRule(): GlobalMatchRule
}
