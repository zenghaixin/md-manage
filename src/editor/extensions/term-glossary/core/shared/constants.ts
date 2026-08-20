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

/**
 * 词条虚线高亮：统一基类 + 变体，后续加颜色只加 kind / CSS 变量即可。
 * Decoration / DOM 都走这里，避免每套虚线各写一套 class。
 */
export type TermDashKind = 'candidate' | 'former' | 'invalid'

export const TERM_DASH_BASE_CLASS = 'ext-term-dash'

/** 变体 class（用于 closest / classList.contains） */
export const TERM_DASH_KIND_CLASS: Record<TermDashKind, string> = {
  candidate: 'ext-term-dash--candidate',
  former: 'ext-term-dash--former',
  invalid: 'ext-term-dash--invalid',
}

/** 完整 className：基类 + 变体 */
export function termDashClass(kind: TermDashKind): string {
  return `${TERM_DASH_BASE_CLASS} ${TERM_DASH_KIND_CLASS[kind]}`
}

export function isTermDashEl(
  el: Element | null | undefined,
  kind?: TermDashKind,
): el is Element {
  if (!el?.classList?.contains(TERM_DASH_BASE_CLASS)) return false
  if (!kind) return true
  return el.classList.contains(TERM_DASH_KIND_CLASS[kind])
}

export function closestTermDash(
  el: Element | null | undefined,
  kind?: TermDashKind,
): HTMLElement | null {
  if (!el?.closest) return null
  const sel = kind
    ? `.${TERM_DASH_KIND_CLASS[kind]}`
    : `.${TERM_DASH_BASE_CLASS}`
  return el.closest(sel) as HTMLElement | null
}

/** 未确认候选虚线变体（完整 class 用 termDashClass('candidate')） */
export const TERM_REF_CANDIDATE_CLASS = TERM_DASH_KIND_CLASS.candidate
/** 曾用名虚线变体 */
export const TERM_REF_FORMER_CLASS = TERM_DASH_KIND_CLASS.former
/** 无效引用虚线变体 */
export const TERM_REF_INVALID_CLASS = TERM_DASH_KIND_CLASS.invalid

/** 点击词条引用后的描述对话框 */
export const TERM_POPOVER_CLASS = 'ext-term-popover'
