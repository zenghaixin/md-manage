/**
 * 特殊词条共享类型（各 types/<name>/ 模块使用）。
 * 不依赖 core，避免循环引用。
 */

export type TermAttrFieldKind = 'enum' | 'text'

export interface TermAttrEnumOption {
  id: string
  label: string
}

export interface TermAttrFieldDef {
  key: string
  label: string
  kind: TermAttrFieldKind
  /** enum 默认值；text 缺省为空串 */
  defaultValue: string
  options?: TermAttrEnumOption[]
  /** 摘要行是否展示（text 空则跳过） */
  inSummary?: boolean
}

/** 单个特殊词条模块约定；后续可在同目录加 styles 等 */
export interface TermSpecialDef<Id extends string = string> {
  id: Id
  label: string
  /** 类型快捷键数字（历史气泡；现已改为 Ctrl+Alt+T 直开新建） */
  key: string
  fields: TermAttrFieldDef[]
}
