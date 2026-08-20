/**
 * 特殊词条 attrs：normalize / 摘要（消费 registry 各模块字段）。
 */
import {
  normalizeTermType,
  TERM_TYPE_BASIC,
  type TermTypeId,
} from '../core/shared/termTypes'
import { SPECIAL_ATTR_FIELDS } from './registry'
import type {
  TermAttrEnumOption,
  TermAttrFieldDef,
} from './shared'

export type { TermAttrEnumOption, TermAttrFieldDef, TermAttrFieldKind } from './shared'
export type TermAttrs = Record<string, string>

/** 各 type 可编辑字段（含 basic = []） */
export const TERM_ATTR_FIELDS: Record<TermTypeId, TermAttrFieldDef[]> = {
  [TERM_TYPE_BASIC]: [],
  character: [...SPECIAL_ATTR_FIELDS.character],
  faction: [...SPECIAL_ATTR_FIELDS.faction],
  class: [...SPECIAL_ATTR_FIELDS.class],
  skill: [...SPECIAL_ATTR_FIELDS.skill],
  geo: [...SPECIAL_ATTR_FIELDS.geo],
  event: [...SPECIAL_ATTR_FIELDS.event],
  item: [...SPECIAL_ATTR_FIELDS.item],
}

function pickEnum(
  value: unknown,
  options: TermAttrEnumOption[] | undefined,
  fallback: string,
): string {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!options?.length) return fallback
  if (options.some((o) => o.id === raw)) return raw
  const byLabel = options.find((o) => o.label === String(value ?? '').trim())
  if (byLabel) return byLabel.id
  return fallback
}

function enumLabel(
  id: string,
  options: TermAttrEnumOption[] | undefined,
): string {
  return options?.find((o) => o.id === id)?.label || id
}

/**
 * 按 type 规范化 attrs；换类型时只保留新类型字段（旧键丢弃）。
 */
export function normalizeTermAttrs(
  type: unknown,
  raw: unknown,
): TermAttrs {
  const termType = normalizeTermType(type)
  const fields = TERM_ATTR_FIELDS[termType] || []
  if (!fields.length) return {}

  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}

  const out: TermAttrs = {}
  for (const field of fields) {
    if (field.kind === 'enum') {
      out[field.key] = pickEnum(src[field.key], field.options, field.defaultValue)
    } else {
      const text = String(src[field.key] ?? '').trim()
      if (text) out[field.key] = text
    }
  }
  return out
}

/** 定义块一行摘要；无有效展示内容则空串 */
export function termAttrsSummary(type: unknown, attrs: unknown): string {
  const termType = normalizeTermType(type)
  const fields = TERM_ATTR_FIELDS[termType] || []
  if (!fields.length) return ''

  const normalized = normalizeTermAttrs(termType, attrs)
  const parts: string[] = []

  for (const field of fields) {
    if (!field.inSummary) continue
    const value = normalized[field.key]
    if (!value) continue
    if (field.kind === 'enum') {
      if (field.key === 'rarity' && value === 'none') continue
      if (termType === 'character' && field.key === 'status' && value === 'unknown') {
        continue
      }
      parts.push(enumLabel(value, field.options))
    } else {
      parts.push(value)
    }
  }

  return parts.join(' · ')
}

export function termAttrFieldsForType(type: unknown): TermAttrFieldDef[] {
  return TERM_ATTR_FIELDS[normalizeTermType(type)] || []
}
