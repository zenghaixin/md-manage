/**
 * 入口文件级词条字段模板（与 server/glossarySchema.js 对齐）。
 * text：普通输入；markdown：多行备注；term：词条引用（需 sourcePath）。
 */
import { api } from '../../../../../api'
import { normalizeDocPath } from './glossaryPaths'
import { isTermFieldKind, type TermFieldKind } from '../fields/kinds'

export type TermFieldType = TermFieldKind

export type TermSchemaField = {
  key: string
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
  id: string
  label: string
  type: TermFieldType
  value: string | string[]
  sourcePath?: string
}

export type TermFieldValues = Record<string, string | string[]>

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
    { key: '标题', label: '标题', type: 'text' },
    { key: '备注', label: '备注', type: 'markdown' },
  ]
}

/** 是否映射到词条标题 */
export function isTitleSchemaField(field: { key?: string; label?: string; type?: string } | null | undefined): boolean {
  if (!field || field.type === 'term' || field.type === 'markdown') return false
  const key = String(field.key || '').trim()
  const label = String(field.label || '').trim()
  return key === '标题' || key === 'title' || label === '标题'
}

/** 是否映射到词条描述/备注 */
export function isRemarkSchemaField(field: { key?: string; label?: string; type?: string } | null | undefined): boolean {
  if (!field || field.type !== 'markdown') return false
  const key = String(field.key || '').trim()
  const label = String(field.label || '').trim()
  return (
    key === '备注' ||
    key === 'remark' ||
    key === 'description' ||
    label === '备注' ||
    label === '描述'
  )
}

/** @deprecated 使用 type === 'term'；保留兼容旧调用 */
export function isSchemaTermRef(field: { type?: string; sourcePath?: string } | null | undefined): boolean {
  if (!field) return false
  if (field.type === 'term') return true
  return !!normalizeDocPath(field.sourcePath || '')
}

export function normalizeSchemaField(raw: unknown): TermSchemaField | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const key = String(obj.key || '')
    .trim()
    .replace(/\s+/g, '_')
  const label = String(obj.label || '').trim() || key
  if (!key) return null
  const sourcePath = normalizeDocPath(String(obj.sourcePath || ''))
  let typeRaw = String(obj.type || '').trim()
  if (typeRaw === 'number') typeRaw = 'text'
  let type: TermFieldType = isTermFieldKind(typeRaw) ? typeRaw : 'text'
  // 旧数据：有 sourcePath 且未标明类型 → 视为 term
  if (!isTermFieldKind(String(obj.type || '').trim()) && sourcePath) {
    type = 'term'
  }
  if (type === 'term' && !sourcePath) {
    // 允许先建 term 再选源；存盘仍写 type=term
  }
  const field: TermSchemaField = { key, label, type }
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
    if (!field || seen.has(field.key)) continue
    seen.add(field.key)
    fields.push(field)
  }
  return { version: 1, fields }
}

export function normalizeFieldValues(
  raw: unknown,
  fields: TermSchemaField[] = [],
): TermFieldValues {
  const out: TermFieldValues = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const fieldMap = new Map(fields.map((f) => [f.key, f]))
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const k = String(key || '').trim()
    if (!k) continue
    const field = fieldMap.get(k)
    const asTerm = field ? field.type === 'term' || isSchemaTermRef(field) : Array.isArray(val)
    if (asTerm) {
      out[k] = Array.isArray(val)
        ? val.map((s) => String(s ?? '').trim()).filter(Boolean)
        : String(val ?? '')
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean)
    } else {
      out[k] = val == null ? '' : String(val)
    }
  }
  return out
}

export function normalizeExtraFields(raw: unknown): TermExtraField[] {
  if (!Array.isArray(raw)) return []
  const out: TermExtraField[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const id =
      String(obj.id || '').trim() ||
      `extra_${Math.random().toString(36).slice(2, 9)}`
    if (seen.has(id)) continue
    seen.add(id)
    const label = String(obj.label || '').trim() || '自定义字段'
    const sourcePath = normalizeDocPath(String(obj.sourcePath || ''))
    let typeRaw = String(obj.type || '').trim()
    if (typeRaw === 'number') typeRaw = 'text'
    let type: TermFieldType = isTermFieldKind(typeRaw) ? typeRaw : 'text'
    if (!isTermFieldKind(String(obj.type || '').trim()) && (sourcePath || Array.isArray(obj.value))) {
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
    const row: TermExtraField = { id, label, type, value }
    if (type === 'term' && sourcePath) row.sourcePath = sourcePath
    out.push(row)
  }
  return out
}

export function newExtraFieldId() {
  return `extra_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function makeFieldKey(label: string, existing: string[] = []) {
  const base =
    String(label || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w\u4e00-\u9fff-]/g, '') || 'field'
  let key = base
  let i = 2
  const set = new Set(existing)
  while (set.has(key)) {
    key = `${base}_${i}`
    i += 1
  }
  return key
}

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
  const data = await api.putGlossarySchema(pathRel, schema)
  return normalizeTermSchema(data?.schema ?? schema)
}

/** 本地预设（与后端 SCHEMA_PRESETS 对齐，离线预览用） */
export function localPresetSchema(name: string): TermFileSchema {
  const map: Record<string, TermSchemaField[]> = {
    武器: [
      { key: 'attack', label: '攻击力', type: 'text' },
      { key: 'bonus', label: '属性加成', type: 'text' },
      { key: 'cost', label: '消耗', type: 'text' },
    ],
    历史事件: [
      { key: 'when', label: '时间节点', type: 'text' },
      {
        key: 'participants',
        label: '参与人物',
        type: 'term',
        sourcePath: '词条/角色/人物.md',
      },
    ],
    人物: [
      {
        key: 'weapons',
        label: '武器',
        type: 'term',
        sourcePath: '词条/物品/武器.md',
      },
      {
        key: 'events',
        label: '参与事件',
        type: 'term',
        sourcePath: '词条/世界观/历史事件.md',
      },
    ],
  }
  const fields = map[String(name || '').trim()]
  return fields ? { version: 1, fields: [...fields] } : {
    version: 1,
    fields: defaultTermSchemaFields(),
  }
}
