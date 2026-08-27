/**
 * .glossary/index.json v2 与词条引用（refs / refSources）规范化。
 */
import crypto from 'crypto'

export const GLOSSARY_INDEX_VERSION = 2

/** 第一版写死槽位 id → md path（迁移用） */
export const LEGACY_REF_SLOT_PATHS = {
  weapons: '词条/物品/武器.md',
  events: '词条/世界观/历史事件.md',
}

export function generateEntryId() {
  return crypto.randomUUID()
}

export function fileNameFromPath(sourcePath) {
  const base = String(sourcePath || '')
    .trim()
    .split('/')
    .pop()
  return base ? base.replace(/\.md$/i, '') : ''
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  )
}

/**
 * @param {unknown} raw
 * @param {(p: string) => string} normRel
 */
export function normalizeIndexEntry(raw, normRel) {
  const e = raw && typeof raw === 'object' ? raw : {}
  const path = normRel(String(e.path || ''))
  const order = String(e.order || e.key || '').trim()
  const id = String(e.id || '').trim() || generateEntryId()
  const fileName =
    String(e.fileName || '').trim() || fileNameFromPath(path)
  if (!path || !order) return null
  return { id, order, path, fileName }
}

/**
 * @param {unknown} raw
 * @param {(p: string) => string} normRel
 */
export function readIndexPayload(raw, normRel) {
  const data = raw && typeof raw === 'object' ? raw : {}
  const version = Number(data.version) || 1
  const entriesIn = Array.isArray(data.entries) ? data.entries : []
  /** @type {Array<{ id: string, order: string, path: string, fileName: string }>} */
  const entries = []
  for (const item of entriesIn) {
    if (version >= GLOSSARY_INDEX_VERSION) {
      const normalized = normalizeIndexEntry(item, normRel)
      if (normalized) entries.push(normalized)
      continue
    }
    const path = normRel(String(item?.path || ''))
    const order = String(item?.key || '').trim()
    if (!path || !order) continue
    entries.push({
      id: generateEntryId(),
      order,
      path,
      fileName: fileNameFromPath(path),
    })
  }
  return { version: GLOSSARY_INDEX_VERSION, entries }
}

/**
 * @param {{ version?: number, entries: Array<{ id: string, order: string, path: string, fileName: string }> }} index
 * @param {(p: string) => string} normRel
 */
export function writeIndexPayload(index, normRel) {
  return {
    version: GLOSSARY_INDEX_VERSION,
    entries: (index.entries || []).map((e) => ({
      id: String(e.id || '').trim(),
      order: String(e.order || '').trim(),
      path: normRel(String(e.path || '')),
      fileName: String(e.fileName || '').trim() || fileNameFromPath(e.path),
    })),
  }
}

/**
 * @param {unknown} raw
 * @param {string[]} refSourceIds
 */
export function normalizeTermRefs(raw, refSourceIds = []) {
  const out = {}
  if (raw && typeof raw === 'object') {
    for (const [key, val] of Object.entries(raw)) {
      const id = String(key || '').trim()
      if (!id || !Array.isArray(val)) continue
      out[id] = val
        .map((s) => String(s ?? '').trim())
        .filter(Boolean)
    }
  }
  for (const id of refSourceIds) {
    const sid = String(id || '').trim()
    if (!sid || Object.prototype.hasOwnProperty.call(out, sid)) continue
    out[sid] = []
  }
  return out
}

/**
 * 将 refSources 规范为 source 文件 uuid 数组。
 * @param {unknown} raw
 * @param {{
 *   idByPath?: Map<string, string>
 *   pathById?: Map<string, string>
 * }} [ctx]
 */
export function normalizeRefSources(raw, ctx = {}) {
  const { idByPath = new Map(), pathById = new Map() } = ctx
  const seen = new Set()
  const out = []

  const pushId = (id) => {
    const sid = String(id || '').trim()
    if (!sid || seen.has(sid)) return
    seen.add(sid)
    out.push(sid)
  }

  const pathToId = (path) => {
    const p = String(path || '').trim()
    if (!p) return ''
    if (idByPath.has(p)) return idByPath.get(p)
    return ''
  }

  const keyToId = (key, val) => {
    const k = String(key || '').trim()
    if (!k) return ''
    if (isUuidLike(k) && (pathById.has(k) || !LEGACY_REF_SLOT_PATHS[k])) {
      return k
    }
    if (LEGACY_REF_SLOT_PATHS[k]) return pathToId(LEGACY_REF_SLOT_PATHS[k])
    const asPath = String(val ?? '').trim()
    if (asPath.includes('/') && asPath.endsWith('.md')) {
      return pathToId(asPath)
    }
    return ''
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = String(item ?? '').trim()
      if (isUuidLike(id)) pushId(id)
      else pushId(pathToId(id))
    }
    return out
  }

  if (raw && typeof raw === 'object') {
    for (const [key, val] of Object.entries(raw)) {
      pushId(keyToId(key, val))
    }
  }
  return out
}

/**
 * 迁移 term 上的 refs / refSources（legacy 槽位、path 键 → uuid）。
 * @param {object} term
 * @param {{
 *   idByPath?: Map<string, string>
 *   pathById?: Map<string, string>
 * }} ctx
 */
export function migrateTermRefs(term, ctx = {}) {
  const { idByPath = new Map(), pathById = new Map() } = ctx
  const refSources = normalizeRefSources(term?.refSources, { idByPath, pathById })

  /** @type {Record<string, string[]>} */
  const refsIn = term?.refs && typeof term.refs === 'object' ? term.refs : {}
  /** @type {Record<string, string[]>} */
  const refsNext = {}

  for (const [key, val] of Object.entries(refsIn)) {
    if (!Array.isArray(val)) continue
    let id = ''
    if (isUuidLike(key) && pathById.has(key)) id = key
    else if (LEGACY_REF_SLOT_PATHS[key]) {
      id = idByPath.get(LEGACY_REF_SLOT_PATHS[key]) || ''
    } else if (String(key).includes('/') && String(key).endsWith('.md')) {
      id = idByPath.get(String(key).trim()) || ''
    } else if (refSources.length === 1 && LEGACY_REF_SLOT_PATHS[key]) {
      id = idByPath.get(LEGACY_REF_SLOT_PATHS[key]) || ''
    }
    if (!id) continue
    refsNext[id] = val
      .map((s) => String(s ?? '').trim())
      .filter(Boolean)
  }

  return {
    refs: normalizeTermRefs(refsNext, refSources),
    refSources,
  }
}
