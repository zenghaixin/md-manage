export const TERM_GLOSSARY_ID = 'term-glossary'

/** TipTap 词条定义节点名（camelCase） */
export const TERM_NODE_NAME = 'termGlossary'

/** TipTap 已确认行内引用节点 */
export const TERM_REF_NODE_NAME = 'termRef'

export const TERM_NODE_CLASS = 'ext-term-node'
export const TERM_TITLE_CLASS = 'ext-term-title'
export const TERM_DESC_CLASS = 'ext-term-desc'
export const TERM_HEADER_CLASS = 'ext-term-header'

/** 已确认引用高亮 */
export const TERM_REF_CLASS = 'ext-term-ref'

import { TERM_DASH_KIND_CLASS } from './dash'

/** 未确认候选虚线变体（完整 class 用 termDashClass('candidate')） */
export const TERM_REF_CANDIDATE_CLASS = TERM_DASH_KIND_CLASS.candidate
/** 曾用名虚线变体 */
export const TERM_REF_FORMER_CLASS = TERM_DASH_KIND_CLASS.former
/** 无效引用虚线变体 */
export const TERM_REF_INVALID_CLASS = TERM_DASH_KIND_CLASS.invalid

/** 点击词条引用后的描述对话框 */
export const TERM_POPOVER_CLASS = 'ext-term-popover'
/** 候选选择 / 不是词条 / 曾用名 浮层 */
export const TERM_PICKER_CLASS = 'ext-term-picker'
