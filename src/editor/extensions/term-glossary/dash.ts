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
