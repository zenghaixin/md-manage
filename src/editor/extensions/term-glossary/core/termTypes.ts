/**
 * 词条类型枚举（系统能力锚点；展示字段可后续按 type 扩展）。
 * `basic` = 普通词条；其余为快捷键 1–n 可选的特殊类型。
 */
export const TERM_TYPE_BASIC = 'basic' as const

export const TERM_TYPE_SPECIALS = [
  { id: 'character', label: '角色', key: '1' },
  { id: 'faction', label: '阵营', key: '2' },
  { id: 'class', label: '职业', key: '3' },
  { id: 'skill', label: '技能', key: '4' },
  { id: 'geo', label: '地理', key: '5' },
  { id: 'event', label: '历史事件', key: '6' },
] as const

export type TermTypeSpecialId = (typeof TERM_TYPE_SPECIALS)[number]['id']
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
  // 兼容中文标签误写入
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
