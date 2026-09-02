/**
 * 入口文件级词条字段模板（与 server/glossarySchema.js 对齐）。
 * text：普通输入；markdown：多行备注；term：词条引用（需 sourcePath）。
 * 字段身份只用 label（同入口内唯一），不再使用独立 key。
 */
import { api } from '../../../../../api'
import { normalizeDocPath } from './glossaryPaths'
import { isTermFieldKind, type TermFieldKind } from '../fields/kinds'

export type TermFieldType = TermFieldKind

export type TermSchemaField = {
  label: string
  type: TermFieldType
  /** type=term 时的数据源 path */
  sourcePath?: string
}

export type TermFileSchema = {
  version: number
  fields: TermSchemaField[]
}

export type TermExtraField = {
  /** 字段显示名，同入口内唯一，兼作取值地址 */
  label: string
  type: TermFieldType
  value: string | string[]
  sourcePath?: string
}

export const SCHEMA_PRESET_OPTIONS = [
  { id: 'blank', label: '空白' },
  { id: '武器', label: '武器' },
  { id: '历史事件', label: '历史事件' },
  { id: '人物', label: '人物' },
] as const

export function emptyTermSchema(): TermFileSchema {
  return { version: 1, fields: [] }
}

/** 通用字段默认模板：标题 + 备注 */
export function defaultTermSchemaFields(): TermSchemaField[] {
  return [
    { label: '标题', type: 'text' },
    { label: '备注', type: 'markdown' },
  ]
}

/** 是否映射到词条标题 */
export function isTitleSchemaField(
  field: { label?: string; type?: string; key?: string } | null | undefined,
): boolean {
  if (!field || field.type === 'term' || field.type === 'markdown') return false
  const label = String(field.label || field.key || '').trim()
  return label === '标题' || label === 'title'
}

/** 是否映射到词条描述/备注 */
export function isRemarkSchemaField(
  field: { label?: string; type?: string; key?: string } | null | undefined,
): boolean {
  if (!field || field.type !== 'markdown') return false
  const label = String(field.label || field.key || '').trim()
  return (
    label === '备注' ||
    label === '描述' ||
    label === 'remark' ||
    label === 'description'
  )
}

/** schema 普通文本字段（非标题） */
export function isTextSchemaField(
  field: { label?: string; type?: string; key?: string } | null | undefined,
): boolean {
  return !!field && field.type === 'text' && !isTitleSchemaField(field)
}

/** schema 词条引用字段 → 落盘用 refs / refSources */
export function isTermSchemaField(
  field: { type?: string } | null | undefined,
): boolean {
  return !!field && field.type === 'term'
}

/** @deprecated 使用 type === 'term'；保留兼容旧调用 */
export function isSchemaTermRef(
  field: { type?: string; sourcePath?: string } | null | undefined,
): boolean {
  if (!field) return false
  if (field.type === 'term') return true
  return !!normalizeDocPath(field.sourcePath || '')
}

export function normalizeSchemaField(raw: unknown): TermSchemaField | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  // 兼容旧数据 key；新数据只认 label
  const label =
    String(obj.label || '').trim() ||
    String(obj.key || '')
      .trim()
      .replace(/\s+/g, '_')
  if (!label) return null
  const sourcePath = normalizeDocPath(String(obj.sourcePath || ''))
  let typeRaw = String(obj.type || '').trim()
  if (typeRaw === 'number') typeRaw = 'text'
  let type: TermFieldType = isTermFieldKind(typeRaw) ? typeRaw : 'text'
  if (!isTermFieldKind(String(obj.type || '').trim()) && sourcePath) {
    type = 'term'
  }
  const field: TermSchemaField = { label, type }
  if (type === 'term' && sourcePath) field.sourcePath = sourcePath
  return field
}

export function normalizeTermSchema(raw: unknown): TermFileSchema {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const seen = new Set<string>()
  const fields: TermSchemaField[] = []
  const list = Array.isArray(data.fields) ? data.fields : []
  for (const item of list) {
    const field = normalizeSchemaField(item)
    if (!field || seen.has(field.label)) continue
    seen.add(field.label)
    fields.push(field)
  }
  return { version: 1, fields }
}

export function normalizeExtraFields(raw: unknown): TermExtraField[] {
  if (!Array.isArray(raw)) return []
  const out: TermExtraField[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const label =
      String(obj.label || '').trim() ||
      String(obj.id || '').trim() ||
      '自定义字段'
    if (seen.has(label)) continue
    seen.add(label)
    const sourcePath = normalizeDocPath(String(obj.sourcePath || ''))
    let typeRaw = String(obj.type || '').trim()
    if (typeRaw === 'number') typeRaw = 'text'
    let type: TermFieldType = isTermFieldKind(typeRaw) ? typeRaw : 'text'
    if (
      !isTermFieldKind(String(obj.type || '').trim()) &&
      (sourcePath || Array.isArray(obj.value))
    ) {
      type = 'term'
    }
    let value: string | string[]
    if (type === 'term') {
      value = Array.isArray(obj.value)
        ? obj.value.map((s) => String(s ?? '').trim()).filter(Boolean)
        : []
    } else {
      value = String(obj.value ?? '')
    }
    const row: TermExtraField = { label, type, value }
    if (type === 'term' && sourcePath) row.sourcePath = sourcePath
    out.push(row)
  }
  return out
}

/** 同入口内生成不重复的字段名 */
export function makeUniqueFieldLabel(label: string, existing: string[] = []) {
  const base =
    String(label || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w\u4e00-\u9fff-]/g, '') || '新字段'
  let name = base
  let i = 2
  const set = new Set(existing)
  while (set.has(name)) {
    name = `${base}_${i}`
    i += 1
  }
  return name
}

/** @deprecated 使用 makeUniqueFieldLabel */
export const makeFieldKey = makeUniqueFieldLabel

export async function fetchTermSchema(pathRel: string): Promise<{
  entryId: string
  path: string
  fileName: string
  schema: TermFileSchema
  presets: string[]
}> {
  const data = await api.getGlossarySchema(pathRel)
  return {
    entryId: String(data?.entryId || ''),
    path: normalizeDocPath(data?.path || pathRel),
    fileName: String(data?.fileName || ''),
    schema: normalizeTermSchema(data?.schema),
    presets: Array.isArray(data?.presets) ? data.presets.map(String) : [],
  }
}

export async function saveTermSchema(
  pathRel: string,
  schema: TermFileSchema,
): Promise<TermFileSchema> {
  const data = await api.saveGlossarySchema(pathRel, normalizeTermSchema(schema))
  return normalizeTermSchema(data?.schema)
}

/** 本地预设（与后端 SCHEMA_PRESETS 对齐，离线预览用） */
export function localPresetSchema(name: string): TermFileSchema {
  const map: Record<string, TermSchemaField[]> = {
    武器: [
      { label: '攻击力', type: 'text' },
      { label: '属性加成', type: 'text' },
      { label: '消耗', type: 'text' },
    ],
    历史事件: [
      { label: '时间节点', type: 'text' },
      {
        label: '参与人物',
        type: 'term',
        sourcePath: '词条/角色/人物.md',
      },
    ],
    人物: [
      {
        label: '武器',
        type: 'term',
        sourcePath: '词条/物品/武器.md',
      },
      {
        label: '参与事件',
        type: 'term',
        sourcePath: '词条/世界观/历史事件.md',
      },
    ],
  }
  const fields = map[String(name || '').trim()]
  return fields
    ? { version: 1, fields: [...fields] }
    : {
        version: 1,
        fields: defaultTermSchemaFields(),
      }
}
