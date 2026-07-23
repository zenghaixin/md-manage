/**
 * 可插拔自定义 Markdown 语法扩展系统入口。
 *
 * 目录约定：
 *   src/editor/extensions/<extension-id>/index.ts
 *
 * 每个扩展导出符合 `MarkdownExtension` 的对象，并在此处注册。
 * 核心壳（MarkdownEditor / DocsPage / main）只调用 hooks，不 import 具体扩展实现。
 */

import { registerExtension } from './registry'
import termGlossary from './term-glossary'

export type {
  ExtensionNode,
  FileContext,
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
export { runAppStartHooks, runFileSaveHooks } from './hooks'

export { default as termGlossary, TERM_GLOSSARY_ID, TermGlossaryNode } from './term-glossary'

/** 内置扩展：新增扩展时在此 register 即可 */
registerExtension(termGlossary)
