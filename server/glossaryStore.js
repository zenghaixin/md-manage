/**
 * 词条数据：落在 md/词条/.glossary/，按下标镜像 md 树。
 * - index.json：key → path
 * - {key}.json：{ list, terms }（terms 无 type/attrs，分类靠文件夹）
 */
import fs from 'fs/promises'
import path from 'path'

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

  function norm(p) {
    return deps.normRel(p)
  }

  function entryAbs(key) {
    return path.join(metaAbs, `${key}.json`)
  }

  async function ensureMetaDir() {
    await fs.mkdir(metaAbs, { recursive: true })
  }

  function emptyEntry() {
    return { list: [], terms: {} }
  }

  function normalizeEntry(raw, sourcePath = '') {
    const data = raw && typeof raw === 'object' ? raw : {}
    const termsIn = data.terms && typeof data.terms === 'object' ? data.terms : {}
    const terms = {}
    for (const [k, term] of Object.entries(termsIn)) {
      const title = String(term?.title ?? k).trim()
      if (!title) continue
      terms[title] = {
        title,
        sourcePath: sourcePath || String(term?.sourcePath ?? ''),
        description: String(term?.description ?? '').trim(),
        ignoreContexts: Array.isArray(term?.ignoreContexts)
          ? term.ignoreContexts
          : [],
        formerTitles: Array.isArray(term?.formerTitles) ? term.formerTitles : [],
        pendingManualConfirm: Array.isArray(term?.pendingManualConfirm)
          ? term.pendingManualConfirm
          : [],
      }
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
      const data = JSON.parse(raw || '{}')
      const entries = Array.isArray(data.entries) ? data.entries : []
      return {
        version: 1,
        entries: entries
          .map((e) => ({
            key: String(e?.key || '').trim(),
            path: norm(e?.path || ''),
          }))
          .filter((e) => e.key && e.path),
      }
    } catch (err) {
      if (err.code === 'ENOENT') return { version: 1, entries: [] }
      throw err
    }
  }

  async function writeIndex(index) {
    await ensureMetaDir()
    const payload = {
      version: 1,
      entries: (index.entries || []).map((e) => ({
        key: e.key,
        path: norm(e.path),
      })),
    }
    await fs.writeFile(indexAbs, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
    return payload
  }

  async function readEntryFile(key) {
    try {
      const raw = await fs.readFile(entryAbs(key), 'utf-8')
      return normalizeEntry(JSON.parse(raw || '{}'))
    } catch (err) {
      if (err.code === 'ENOENT') return emptyEntry()
      throw err
    }
  }

  async function writeEntryFile(key, fileData, sourcePath) {
    await ensureMetaDir()
    const normalized = normalizeEntry(fileData, sourcePath)
    for (const term of Object.values(normalized.terms)) {
      term.sourcePath = sourcePath
    }
    normalized.list = Object.keys(normalized.terms).sort((a, b) =>
      a.localeCompare(b, 'zh'),
    )
    await fs.writeFile(
      entryAbs(key),
      `${JSON.stringify(normalized, null, 2)}\n`,
      'utf-8',
    )
    return normalized
  }

  /** 按下标重建 index，并按 path 把旧 json 迁到新 key */
  async function rebuildIndex() {
    await ensureMetaDir()
    const prev = await readIndex()
    const pathToOldKey = new Map(prev.entries.map((e) => [e.path, e.key]))
    /** @type {Map<string, object>} */
    const contentByPath = new Map()
    for (const e of prev.entries) {
      contentByPath.set(e.path, await readEntryFile(e.key))
    }

    const nextEntries = await deps.listGlossaryMdEntries()
    const usedKeys = new Set(nextEntries.map((e) => e.key))

    for (const e of nextEntries) {
      const payload = contentByPath.get(e.path) || emptyEntry()
      await writeEntryFile(e.key, payload, e.path)
    }

    let diskFiles = []
    try {
      diskFiles = await fs.readdir(metaAbs)
    } catch {
      diskFiles = []
    }
    for (const name of diskFiles) {
      if (name === 'index.json' || !name.endsWith('.json')) continue
      const key = name.replace(/\.json$/i, '')
      if (!usedKeys.has(key)) {
        try {
          await fs.unlink(path.join(metaAbs, name))
        } catch {
          // ignore
        }
      }
    }

    // 清理旧 key 残留（path 已变但内容已迁走）
    void pathToOldKey

    return writeIndex({ version: 1, entries: nextEntries })
  }

  async function listEntryPaths() {
    const index = await rebuildIndex()
    return index.entries.map((e) => ({
      key: e.key,
      path: e.path,
      label: e.path.split('/').pop()?.replace(/\.md$/i, '') || e.path,
    }))
  }

  async function readGlossaryFile() {
    const index = await rebuildIndex()
    const terms = {}
    for (const e of index.entries) {
      const file = await readEntryFile(e.key)
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
        }
      }
    }
    return { lastUpdated: '', terms }
  }

  async function writeGlossaryFile(data) {
    const terms =
      data.terms && typeof data.terms === 'object' ? data.terms : {}
    await ensureDefaultMd()
    let index = await rebuildIndex()
    let keyByPath = new Map(index.entries.map((e) => [e.path, e.key]))

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
      }
    }

    if (!keyByPath.has(GLOSSARY_DEFAULT_FILE)) {
      index = await rebuildIndex()
      keyByPath = new Map(index.entries.map((e) => [e.path, e.key]))
    }

    const lastUpdated = new Date().toISOString()
    for (const [sourcePath, bucket] of byPath) {
      const key = keyByPath.get(sourcePath)
      if (!key) continue
      bucket.list = Object.keys(bucket.terms).sort((a, b) =>
        a.localeCompare(b, 'zh'),
      )
      await writeEntryFile(key, bucket, sourcePath)
    }

    const merged = await readGlossaryFile()
    return { lastUpdated, terms: merged.terms }
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

  return {
    metaAbs,
    rebuildIndex,
    listEntryPaths,
    readGlossaryFile,
    writeGlossaryFile,
    ensureDefaultMd,
    wipeLegacyDataDir,
    GLOSSARY_DEFAULT_FILE,
    GLOSSARY_ROOT,
  }
}
