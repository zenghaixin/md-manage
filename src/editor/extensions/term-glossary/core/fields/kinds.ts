/**
 * 通用词条字段形态（编辑值 / 模板定义共用）。
 * text：普通单行输入
 * markdown：备注式多行文本
 * term：左侧多选下拉 + 右侧数据源文件选择
 */
export type TermFieldKind = 'text' | 'markdown' | 'term'

export const TERM_FIELD_KIND_OPTIONS = [
  {
    id: 'text',
    label: '普通文本',
    desc: '单行输入',
  },
  {
    id: 'markdown',
    label: '备注文本',
    desc: '多行备注，与词条描述区分',
  },
  {
    id: 'term',
    label: '词条引用',
    desc: '下拉选词条 + 选择数据源文件',
  },
] as const

export function fieldKindLabel(kind: string): string {
  const hit = TERM_FIELD_KIND_OPTIONS.find((o) => o.id === kind)
  return hit?.label || '普通文本'
}

export function isTermFieldKind(raw: unknown): raw is TermFieldKind {
  return raw === 'text' || raw === 'markdown' || raw === 'term'
}
