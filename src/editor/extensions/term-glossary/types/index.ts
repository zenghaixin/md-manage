/**
 * 特殊词条层入口。
 * 每个特殊类型一个文件夹（character / item / …）；在 registry 登记即可扩展。
 * 匹配、改名、确认等能力一律在 core。
 */
export {
  TERM_TYPE_SPECIALS,
  SPECIAL_ATTR_FIELDS,
  type TermTypeSpecialId,
} from './registry'
export {
  normalizeTermAttrs,
  termAttrsSummary,
  termAttrFieldsForType,
  TERM_ATTR_FIELDS,
  type TermAttrs,
  type TermAttrFieldDef,
  type TermAttrEnumOption,
  type TermAttrFieldKind,
} from './termAttrs'
export type { TermSpecialDef } from './shared'
