/**
 * 可插拔自定义 Markdown 语法扩展系统入口。
 *
 * 目录约定：
 *   src/editor/extensions/<extension-id>/index.ts
 *
 * 每个扩展导出符合 `MarkdownExtension` 的对象，并在此处注册。
 */

import { registerExtension } from './registry'
import termGlossary from './term-glossary'

export type {
  ExtensionNode,
  GlobalMatch,
  GlobalMatchRule,
  MarkdownExtension,
} from './types'

export {
  getAllExtensions,
  getAllGlobalMatchRules,
  getExtension,
  parseAllMarkdown,
  registerExtension,
  serializeNode,
  unregisterExtension,
} from './registry'

export { getAllTiptapExtensions, readEditorMarkdown } from './mount'

export { default as termGlossary, TERM_GLOSSARY_ID, TermGlossaryNode } from './term-glossary'

/** 内置扩展：新增扩展时在此 register 即可 */
registerExtension(termGlossary)
