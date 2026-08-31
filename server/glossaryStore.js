/**
 * 词条数据：落在 md/词条/.glossary/，按下标镜像 md 树。
 * - index.json v2：{ id, order, path, fileName }
 * - {order}.json：{ list, terms }
 */
import fs from 'fs/promises'
import path from 'path'
import {
  GLOSSARY_INDEX_VERSION,
  fileNameFromPath,
  generateEntryId,
  migrateTermRefs,
  normalizeTermRefs,
  normalizeRefSources,
  readIndexPayload,
  writeIndexPayload,
} from './glossaryIndex.js'
import {
  createSchemaStore,
  normalizeExtraFields,
  normalizeFieldValues,
} from './glossarySchema.js'

export const GLOSSARY_ROOT = '词条'
export const GLOSSARY_META_DIR = '.glossary'
export const GLOSSARY_DEFAULT_MD = '默认词条.md'
export const GLOSSARY_DEFAULT_FILE = `${GLOSSARY_ROOT}/${GLOSSARY_DEFAULT_MD}`

/**
 * @param {string} docsRoot
 * @param {{
 *   normRel: (p: string) => string
 *   listGlossaryMdEntries: () => Promise<Array<{ key: string, path: string }>>
 * }} deps
 */
export function createGlossaryStore(docsRoot, deps) {
  const metaAbs = path.join(docsRoot, GLOSSARY_ROOT, GLOSSARY_META_DIR)
  const indexAbs = path.join(metaAbs, 'index.json')
  const schemaStore = createSchemaStore(metaAbs)

  function norm(p) {
    return deps.normRel(p)
  }

  function entryAbs(order) {
    return path.join(metaAbs, `${order}.json`)
  }

  async function ensureMetaDir() {
    await fs.mkdir(metaAbs, { recursive: true })
  }

  function buildIndexLookup(entries) {
    const idByPath = new Map()
    const pathById = new Map()
    for (const e of entries || []) {
      idByPath.set(e.path, e.id)
      pathById.set(e.id, e.path)
    }
    return { idByPath, pathById }
  }

  function normalizeTermRecord(raw, sourcePath, ctx) {
    const term = raw && typeof raw === 'object' ? raw : {}
    const { refs, refSources } = migrateTermRefs(term, ctx)
    return {
      title: String(term?.title ?? '').trim(),
      sourcePath: sourcePath || String(term?.sourcePath ?? ''),
      description: String(term?.description ?? '').trim(),
      ignoreContexts: Array.isArray(term?.ignoreContexts)
        ? term.ignoreContexts
        : [],
      formerTitles: Array.isArray(term?.formerTitles) ? term.formerTitles : [],
      pendingManualConfirm: Array.isArray(term?.pendingManualConfirm)
        ? term.pendingManualConfirm
        : [],
      refs,
      refSources,
      fieldValues: normalizeFieldValues(term?.fieldValues),
      extraFields: normalizeExtraFields(term?.extraFields),
    }
  }

  function emptyEntry() {
    return { list: [], terms: {} }
  }

  function normalizeEntry(raw, sourcePath = '', ctx = {}) {
    const data = raw && typeof raw === 'object' ? raw : {}
    const termsIn = data.terms && typeof data.terms === 'object' ? data.terms : {}
    const terms = {}
    for (const [k, term] of Object.entries(termsIn)) {
      const title = String(term?.title ?? k).trim()
      if (!title) continue
      const normalized = normalizeTermRecord(term, sourcePath, ctx)
      terms[title] = { ...normalized, title }
    }
    let list = Array.isArray(data.list)
      ? data.list.map((t) => String(t ?? '').trim()).filter(Boolean)
      : []
    const seen = new Set()
    const nextList = []
    for (const title of list) {
      if (!terms[title] || seen.has(title)) continue
      seen.add(title)
      nextList.push(title)
    }
    for (const title of Object.keys(terms)) {
      if (seen.has(title)) continue
      nextList.push(title)
    }
    return { list: nextList, terms }
  }

  async function readIndex() {
    try {
      const raw = await fs.readFile(indexAbs, 'utf-8')
      const parsed = JSON.parse(raw || '{}')
      const payload = readIndexPayload(parsed, norm)
      if (Number(parsed.version) < GLOSSARY_INDEX_VERSION) {
        await writeIndex(payload)
      }
      return payload
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { version: GLOSSARY_INDEX_VERSION, entries: [] }
      }
      throw err
    }
  }

  async function writeIndex(index) {
    await ensureMetaDir()
    const payload = writeIndexPayload(index, norm)
    await fs.writeFile(indexAbs, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
    return payload
  }

  async function readEntryFile(order) {
    try {
      const raw = await fs.readFile(entryAbs(order), 'utf-8')
      return JSON.parse(raw || '{}')
    } catch (err) {
      if (err.code === 'ENOENT') return emptyEntry()
      throw err
    }
  }

  async function writeEntryFile(order, fileData, sourcePath, ctx = {}) {
    await ensureMetaDir()
    const normalized = normalizeEntry(fileData, sourcePath, ctx)
    for (const term of Object.values(normalized.terms)) {
      term.sourcePath = sourcePath
    }
    normalized.list = Object.keys(normalized.terms).sort((a, b) =>
      a.localeCompare(b, 'zh'),
    )
    await fs.writeFile(
      entryAbs(order),
      `${JSON.stringify(normalized, null, 2)}\n`,
      'utf-8',
    )
    return normalized
  }

  /** 按下标重建 index，按 id 迁移 {order}.json 内容 */
  async function rebuildIndex() {
    await ensureMetaDir()
    const prev = await readIndex()
    const prevByPath = new Map(prev.entries.map((e) => [e.path, e]))

    /** @type {Map<string, object>} */
    const contentById = new Map()
    for (const e of prev.entries) {
      contentById.set(e.id, await readEntryFile(e.order))
    }

    const nextOrders = await deps.listGlossaryMdEntries()
    const usedOrders = new Set(nextOrders.map((e) => e.key))

    /** @type {Array<{ id: string, order: string, path: string, fileName: string }>} */
    const nextEntries = []

    for (const item of nextOrders) {
      const order = String(item.key || '').trim()
      const sourcePath = norm(item.path || '')
      if (!order || !sourcePath) continue

      const prevMeta = prevByPath.get(sourcePath)
      const id = prevMeta?.id || generateEntryId()
      const fileName =
        String(prevMeta?.fileName || '').trim() || fileNameFromPath(sourcePath)
      const payload = contentById.get(id) || emptyEntry()
      const lookup = buildIndexLookup([
        ...prev.entries,
        { id, order, path: sourcePath, fileName },
      ])
      await writeEntryFile(order, payload, sourcePath, lookup)
      nextEntries.push({ id, order, path: sourcePath, fileName })
    }

    let diskFiles = []
    try {
      diskFiles = await fs.readdir(metaAbs)
    } catch {
      diskFiles = []
    }
    for (const name of diskFiles) {
      if (name === 'index.json' || !name.endsWith('.json')) continue
      const order = name.replace(/\.json$/i, '')
      if (!usedOrders.has(order)) {
        try {
          await fs.unlink(path.join(metaAbs, name))
        } catch {
          // ignore
        }
      }
    }

    return writeIndex({ version: GLOSSARY_INDEX_VERSION, entries: nextEntries })
  }

  async function readGlossaryIndex() {
    return rebuildIndex()
  }

  /**
   * 文件/文件夹重命名或移动时更新 index 中的 path（id 不变）。
   * @param {(path: string) => string | null | undefined} remapFn
   */
  async function remapIndexPaths(remapFn) {
    const index = await readIndex()
    let changed = false
    const entries = []
    for (const e of index.entries) {
      const nextPath = remapFn(e.path)
      if (nextPath === '') {
        changed = true
        continue
      }
      if (nextPath != null && nextPath !== e.path) {
        changed = true
        entries.push({
          ...e,
          path: norm(nextPath),
          fileName: fileNameFromPath(nextPath),
        })
        continue
      }
      entries.push(e)
    }
    if (changed) await writeIndex({ version: GLOSSARY_INDEX_VERSION, entries })
  }

  async function listEntryPaths() {
    const index = await rebuildIndex()
    return index.entries.map((e) => ({
      id: e.id,
      order: e.order,
      path: e.path,
      fileName: e.fileName,
      label: e.fileName || e.path.split('/').pop()?.replace(/\.md$/i, '') || e.path,
    }))
  }

  async function readGlossaryFile() {
    const index = await rebuildIndex()
    const lookup = buildIndexLookup(index.entries)
    const terms = {}
    for (const e of index.entries) {
      const file = normalizeEntry(await readEntryFile(e.order), e.path, lookup)
      for (const [title, term] of Object.entries(file.terms)) {
        terms[title] = {
          title,
          description: String(term?.description ?? '').trim(),
          sourcePath: e.path,
          ignoreContexts: Array.isArray(term?.ignoreContexts)
            ? term.ignoreContexts
            : [],
          formerTitles: Array.isArray(term?.formerTitles)
            ? term.formerTitles
            : [],
          pendingManualConfirm: Array.isArray(term?.pendingManualConfirm)
            ? term.pendingManualConfirm
            : [],
          refs: normalizeTermRefs(term?.refs, term?.refSources || []),
          refSources: normalizeRefSources(term?.refSources, lookup),
          fieldValues: normalizeFieldValues(term?.fieldValues),
          extraFields: normalizeExtraFields(term?.extraFields),
        }
      }
    }
    return { lastUpdated: '', terms, index }
  }

  async function writeGlossaryFile(data) {
    const terms =
      data.terms && typeof data.terms === 'object' ? data.terms : {}
    await ensureDefaultMd()
    const index = await rebuildIndex()
    const orderByPath = new Map(index.entries.map((e) => [e.path, e.order]))
    const lookup = buildIndexLookup(index.entries)

    /** @type {Map<string, { list: string[], terms: Record<string, object> }>} */
    const byPath = new Map()
    for (const e of index.entries) {
      byPath.set(e.path, emptyEntry())
    }

    for (const [key, term] of Object.entries(terms)) {
      const title = String(term?.title ?? key).trim()
      if (!title) continue
      let sourcePath = norm(term?.sourcePath || '')
      if (!sourcePath.startsWith(`${GLOSSARY_ROOT}/`) || !sourcePath.endsWith('.md')) {
        sourcePath = GLOSSARY_DEFAULT_FILE
      }
      if (!byPath.has(sourcePath)) {
        sourcePath = GLOSSARY_DEFAULT_FILE
        if (!byPath.has(sourcePath)) byPath.set(sourcePath, emptyEntry())
      }
      const refSources = normalizeRefSources(term?.refSources, lookup)
      const bucket = byPath.get(sourcePath)
      bucket.terms[title] = {
        title,
        description: String(term?.description ?? '').trim(),
        sourcePath,
        ignoreContexts: Array.isArray(term?.ignoreContexts)
          ? term.ignoreContexts
          : [],
        formerTitles: Array.isArray(term?.formerTitles) ? term.formerTitles : [],
        pendingManualConfirm: Array.isArray(term?.pendingManualConfirm)
          ? term.pendingManualConfirm
          : [],
        refs: normalizeTermRefs(term?.refs, refSources),
        refSources,
        fieldValues: normalizeFieldValues(term?.fieldValues),
        extraFields: normalizeExtraFields(term?.extraFields),
      }
    }

    if (!orderByPath.has(GLOSSARY_DEFAULT_FILE)) {
      await rebuildIndex()
    }

    const latestIndex = await readIndex()
    const latestOrderByPath = new Map(latestIndex.entries.map((e) => [e.path, e.order]))
    const latestLookup = buildIndexLookup(latestIndex.entries)

    const lastUpdated = new Date().toISOString()
    for (const [sourcePath, bucket] of byPath) {
      const order = latestOrderByPath.get(sourcePath)
      if (!order) continue
      bucket.list = Object.keys(bucket.terms).sort((a, b) =>
        a.localeCompare(b, 'zh'),
      )
      await writeEntryFile(order, bucket, sourcePath, latestLookup)
    }

    const merged = await readGlossaryFile()
    return { lastUpdated, terms: merged.terms, index: merged.index }
  }

  async function ensureDefaultMd() {
    const folder = path.join(docsRoot, GLOSSARY_ROOT)
    await fs.mkdir(folder, { recursive: true })
    const defaultAbs = path.join(docsRoot, ...GLOSSARY_DEFAULT_FILE.split('/'))
    try {
      await fs.access(defaultAbs)
    } catch {
      await fs.writeFile(defaultAbs, `# 默认词条\n\n`, 'utf-8')
    }
  }

  /** 删除旧版 src/.../data 目录（测试数据，直接删） */
  async function wipeLegacyDataDir(legacyDir) {
    if (!legacyDir) return
    try {
      await fs.rm(legacyDir, { recursive: true, force: true })
      console.log('[glossary] removed legacy data dir:', legacyDir)
    } catch (err) {
      console.warn('[glossary] wipe legacy failed:', err?.message || err)
    }
  }

  async function resolveEntryByPath(sourcePath) {
    const want = norm(sourcePath)
    if (!want) return null
    const index = await rebuildIndex()
    return index.entries.find((e) => e.path === want) || null
  }

  async function readSchemaByPath(sourcePath) {
    const entry = await resolveEntryByPath(sourcePath)
    if (!entry) {
      throw Object.assign(new Error('入口文件不在词条索引中'), { status: 404 })
    }
    const schema = await schemaStore.readSchema(entry.id)
    return {
      entryId: entry.id,
      path: entry.path,
      fileName: entry.fileName,
      schema,
      presets: schemaStore.listPresetNames(),
      suggested: schemaStore.presetByFileName(entry.fileName),
    }
  }

  async function writeSchemaByPath(sourcePath, schema) {
    const entry = await resolveEntryByPath(sourcePath)
    if (!entry) {
      throw Object.assign(new Error('入口文件不在词条索引中'), { status: 404 })
    }
    const saved = await schemaStore.writeSchema(entry.id, schema)
    return {
      entryId: entry.id,
      path: entry.path,
      fileName: entry.fileName,
      schema: saved,
    }
  }

  return {
    metaAbs,
    rebuildIndex,
    readGlossaryIndex,
    remapIndexPaths,
    listEntryPaths,
    readGlossaryFile,
    writeGlossaryFile,
    ensureDefaultMd,
    wipeLegacyDataDir,
    readSchemaByPath,
    writeSchemaByPath,
    schemaStore,
    GLOSSARY_DEFAULT_FILE,
    GLOSSARY_ROOT,
    normalizeTermRefs,
    normalizeRefSources,
    buildIndexLookup,
  }
}
