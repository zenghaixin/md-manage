/**
 * 词条类型：basic + 特殊类型 id 的规范化（core 能力锚点）。
 * 特殊类型清单 / 字段在 types/<name>/，经 types/registry 聚合。
 */
import {
  TERM_TYPE_SPECIALS,
  type TermTypeSpecialId,
} from '../../types/registry'

export { TERM_TYPE_SPECIALS }
export type { TermTypeSpecialId }

export const TERM_TYPE_BASIC = 'basic' as const

export type TermTypeId = typeof TERM_TYPE_BASIC | TermTypeSpecialId

const SPECIAL_IDS = new Set<string>(TERM_TYPE_SPECIALS.map((t) => t.id))

export function normalizeTermType(value: unknown): TermTypeId {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!raw || raw === 'basic' || raw === 'generic' || raw === '普通') {
    return TERM_TYPE_BASIC
  }
  if (SPECIAL_IDS.has(raw)) return raw as TermTypeSpecialId
  const byLabel = TERM_TYPE_SPECIALS.find((t) => t.label === String(value ?? '').trim())
  if (byLabel) return byLabel.id
  return TERM_TYPE_BASIC
}

export function termTypeLabel(type: unknown): string {
  const id = normalizeTermType(type)
  if (id === TERM_TYPE_BASIC) return '普通'
  return TERM_TYPE_SPECIALS.find((t) => t.id === id)?.label || '普通'
}

export function isSpecialTermType(type: unknown): boolean {
  return normalizeTermType(type) !== TERM_TYPE_BASIC
}
