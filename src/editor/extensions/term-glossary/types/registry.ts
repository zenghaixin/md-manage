/**
 * 特殊词条注册表：聚合各 types/<name>/ 模块。
 * 新增特殊类型：建文件夹 → 在此数组登记一行。
 * 不依赖 core，供 core/termTypes 安全引用。
 */
import { characterSpecial } from './character'
import { factionSpecial } from './faction'
import { classSpecial } from './class'
import { skillSpecial } from './skill'
import { geoSpecial } from './geo'
import { eventSpecial } from './event'
import { itemSpecial } from './item'
import type { TermAttrFieldDef } from './shared'

/**
 * 登记顺序 = 快捷键 1…n 顺序。
 * 只导出 id/label/key 给气泡与 normalize；fields 另表。
 */
export const TERM_TYPE_SPECIALS = [
  {
    id: characterSpecial.id,
    label: characterSpecial.label,
    key: characterSpecial.key,
  },
  {
    id: factionSpecial.id,
    label: factionSpecial.label,
    key: factionSpecial.key,
  },
  {
    id: classSpecial.id,
    label: classSpecial.label,
    key: classSpecial.key,
  },
  {
    id: skillSpecial.id,
    label: skillSpecial.label,
    key: skillSpecial.key,
  },
  {
    id: geoSpecial.id,
    label: geoSpecial.label,
    key: geoSpecial.key,
  },
  {
    id: eventSpecial.id,
    label: eventSpecial.label,
    key: eventSpecial.key,
  },
  {
    id: itemSpecial.id,
    label: itemSpecial.label,
    key: itemSpecial.key,
  },
] as const

export type TermTypeSpecialId = (typeof TERM_TYPE_SPECIALS)[number]['id']

/** 各特殊类型字段（不含 basic） */
export const SPECIAL_ATTR_FIELDS: Record<
  TermTypeSpecialId,
  readonly TermAttrFieldDef[]
> = {
  character: characterSpecial.fields,
  faction: factionSpecial.fields,
  class: classSpecial.fields,
  skill: skillSpecial.fields,
  geo: geoSpecial.fields,
  event: eventSpecial.fields,
  item: itemSpecial.fields,
}
