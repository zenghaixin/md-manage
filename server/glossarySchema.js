/**
 * 入口文件级词条字段模板：.glossary/schemas/{entryId}.json
 */
import fs from 'fs/promises'
import path from 'path'

export const SCHEMA_VERSION = 1

/** @typedef {'text' | 'markdown' | 'term'} FieldType */

const FIELD_KINDS = new Set(['text', 'markdown', 'term'])

/** @type {Record<string, Array<{ key: string, label: string, type: FieldType, sourcePath?: string }>>} */
export const SCHEMA_PRESETS = {
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

export function emptySchema() {
  return { version: SCHEMA_VERSION, fields: [] }
}

/** 新入口文件默认通用字段：标题 + 备注 */
export function defaultSchema() {
  return normalizeSchema({
    version: SCHEMA_VERSION,
    fields: [
      { key: '标题', label: '标题', type: 'text' },
      { key: '备注', label: '备注', type: 'markdown' },
    ],
  })
}

function normalizeSourcePath(raw) {
  return String(raw || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
}

export function normalizeSchemaField(raw) {
  if (!raw || typeof raw !== 'object') return null
  const key = String(raw.key || '')
    .trim()
    .replace(/\s+/g, '_')
  const label = String(raw.label || '').trim() || key
  if (!key) return null
  const sourcePath = normalizeSourcePath(raw.sourcePath)
  let typeRaw = String(raw.type || '').trim()
  if (typeRaw === 'number') typeRaw = 'text'
  let type = FIELD_KINDS.has(typeRaw) ? typeRaw : 'text'
  // 旧数据：未标明类型但有 sourcePath → term
  if (!FIELD_KINDS.has(String(raw.type || '').trim()) && sourcePath) {
    type = 'term'
  }
  /** @type {{ key: string, label: string, type: string, sourcePath?: string }} */
  const field = { key, label, type }
  if (type === 'term' && sourcePath) field.sourcePath = sourcePath
  return field
}

export function normalizeSchema(raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  const seen = new Set()
  const fields = []
  const list = Array.isArray(data.fields) ? data.fields : []
  for (const item of list) {
    const field = normalizeSchemaField(item)
    if (!field || seen.has(field.key)) continue
    seen.add(field.key)
    fields.push(field)
  }
  return { version: SCHEMA_VERSION, fields }
}

export function presetByFileName(fileName) {
  const name = String(fileName || '')
    .replace(/\.md$/i, '')
    .trim()
  const fields = SCHEMA_PRESETS[name]
  if (!fields) return defaultSchema()
  return normalizeSchema({ version: SCHEMA_VERSION, fields })
}

export function listPresetNames() {
  return Object.keys(SCHEMA_PRESETS)
}

/**
 * @param {string} metaAbs `.glossary` 绝对路径
 */
export function createSchemaStore(metaAbs) {
  const schemasDir = path.join(metaAbs, 'schemas')

  function schemaAbs(entryId) {
    return path.join(schemasDir, `${entryId}.json`)
  }

  async function ensureDir() {
    await fs.mkdir(schemasDir, { recursive: true })
  }

  async function readSchema(entryId) {
    const id = String(entryId || '').trim()
    if (!id) return emptySchema()
    try {
      const raw = await fs.readFile(schemaAbs(id), 'utf-8')
      return normalizeSchema(JSON.parse(raw || '{}'))
    } catch (err) {
      if (err.code === 'ENOENT') return defaultSchema()
      throw err
    }
  }

  async function writeSchema(entryId, schema) {
    const id = String(entryId || '').trim()
    if (!id) throw Object.assign(new Error('entryId 无效'), { status: 400 })
    await ensureDir()
    const payload = normalizeSchema(schema)
    await fs.writeFile(
      schemaAbs(id),
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf-8',
    )
    return payload
  }

  /** 新入口：无文件或空 fields 时写入标题+备注默认模板 */
  async function ensureDefaultSchema(entryId) {
    const id = String(entryId || '').trim()
    if (!id) return null
    try {
      const raw = await fs.readFile(schemaAbs(id), 'utf-8')
      const current = normalizeSchema(JSON.parse(raw || '{}'))
      if (current.fields.length > 0) return null
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    return writeSchema(id, defaultSchema())
  }

  async function deleteSchema(entryId) {
    const id = String(entryId || '').trim()
    if (!id) return
    try {
      await fs.unlink(schemaAbs(id))
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  return {
    readSchema,
    writeSchema,
    ensureDefaultSchema,
    deleteSchema,
    emptySchema,
    defaultSchema,
    normalizeSchema,
    presetByFileName,
    listPresetNames,
  }
}

export function normalizeFieldValues(raw, fields = []) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const fieldMap = new Map(
    (fields || []).map((f) => [f.key, f]).filter((x) => x[0]),
  )
  for (const [key, val] of Object.entries(raw)) {
    const k = String(key || '').trim()
    if (!k) continue
    const field = fieldMap.get(k)
    const asTerm = field
      ? field.type === 'term' || !!normalizeSourcePath(field.sourcePath)
      : Array.isArray(val)
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

export function normalizeExtraFields(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const id =
      String(item.id || '').trim() ||
      `extra_${Math.random().toString(36).slice(2, 9)}`
    if (seen.has(id)) continue
    seen.add(id)
    const label = String(item.label || '').trim() || '自定义字段'
    const sourcePath = normalizeSourcePath(item.sourcePath)
    let typeRaw = String(item.type || '').trim()
    if (typeRaw === 'number') typeRaw = 'text'
    let type = FIELD_KINDS.has(typeRaw) ? typeRaw : 'text'
    if (!FIELD_KINDS.has(String(item.type || '').trim()) && (sourcePath || Array.isArray(item.value))) {
      type = 'term'
    }
    let value
    if (type === 'term') {
      value = Array.isArray(item.value)
        ? item.value.map((s) => String(s ?? '').trim()).filter(Boolean)
        : []
    } else {
      value = String(item.value ?? '')
    }
    const row = { id, label, type, value }
    if (type === 'term' && sourcePath) row.sourcePath = sourcePath
    out.push(row)
  }
  return out
}
