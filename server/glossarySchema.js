/**
 * 入口文件级词条字段模板：.glossary/schemas/{entryId}.json
 */
import fs from 'fs/promises'
import path from 'path'

export const SCHEMA_VERSION = 1

/** @typedef {'text' | 'markdown' | 'term'} FieldType */

const FIELD_KINDS = new Set(['text', 'markdown', 'term'])

/** @type {Record<string, Array<{ label: string, type: FieldType, sourcePath?: string }>>} */
export const SCHEMA_PRESETS = {
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

export function emptySchema() {
  return { version: SCHEMA_VERSION, fields: [] }
}

/** 新入口文件默认通用字段：标题 + 备注 */
export function defaultSchema() {
  return normalizeSchema({
    version: SCHEMA_VERSION,
    fields: [
      { label: '标题', type: 'text' },
      { label: '备注', type: 'markdown' },
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
  const label =
    String(raw.label || '').trim() ||
    String(raw.key || '')
      .trim()
      .replace(/\s+/g, '_')
  if (!label) return null
  const sourcePath = normalizeSourcePath(raw.sourcePath)
  let typeRaw = String(raw.type || '').trim()
  if (typeRaw === 'number') typeRaw = 'text'
  let type = FIELD_KINDS.has(typeRaw) ? typeRaw : 'text'
  // 旧数据：未标明类型但有 sourcePath → term
  if (!FIELD_KINDS.has(String(raw.type || '').trim()) && sourcePath) {
    type = 'term'
  }
  /** @type {{ label: string, type: string, sourcePath?: string }} */
  const field = { label, type }
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
    if (!field || seen.has(field.label)) continue
    seen.add(field.label)
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

export function normalizeExtraFields(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const label =
      String(item.label || '').trim() ||
      String(item.id || '').trim() ||
      '自定义字段'
    if (seen.has(label)) continue
    seen.add(label)
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
    const row = { label, type, value }
    if (type === 'term' && sourcePath) row.sourcePath = sourcePath
    out.push(row)
  }
  return out
}
