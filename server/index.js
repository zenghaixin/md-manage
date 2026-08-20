import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { createFsTree } from './fsTree.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DOCS_ROOT = path.resolve(__dirname, '../md')
const META_FILE = path.join(DOCS_ROOT, '.tabs.json')
const GLOSSARY_DATA_DIR = path.resolve(
  __dirname,
  '../src/editor/extensions/term-glossary/data',
)
/** @deprecated 迁移用；读到后拆入各类型文件并删除 */
const GLOSSARY_LEGACY_FILE = path.join(GLOSSARY_DATA_DIR, 'glossary.json')
/** 项目级 UI 配置（不放 md/，避免混进设定文档） */
const APP_CONFIG_FILE = path.resolve(__dirname, '../.app-config.json')

const DEFAULT_APP_CONFIG = {
  theme: 'system',
  rightPanelActiveModuleId: '',
}

async function readAppConfig() {
  try {
    const raw = await fs.readFile(APP_CONFIG_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return {
      ...DEFAULT_APP_CONFIG,
      ...(data && typeof data === 'object' ? data : {}),
    }
  } catch {
    return { ...DEFAULT_APP_CONFIG }
  }
}

async function writeAppConfig(patch) {
  const current = await readAppConfig()
  const next = {
    ...current,
    ...(patch && typeof patch === 'object' ? patch : {}),
  }
  if (!['system', 'light', 'dark'].includes(next.theme)) {
    next.theme = 'system'
  }
  next.rightPanelActiveModuleId = String(next.rightPanelActiveModuleId || '')
  await fs.writeFile(APP_CONFIG_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf-8')
  return next
}

const TERM_BLOCK_RE =
  /:::[\t ]*term[\t ]*\[([^\]]*)\]\s*([\s\S]*?)\s*:::/gi

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

function isSafeName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 100 &&
    !/[<>:"/\\|?*\x00-\x1f]/.test(name) &&
    name !== '.' &&
    name !== '..' &&
    !name.startsWith('.')
  )
}

function ensureMd(name) {
  return name.endsWith('.md') ? name : `${name}.md`
}

async function ensureDocsRoot() {
  await fs.mkdir(DOCS_ROOT, { recursive: true })
}

const fsTree = createFsTree(DOCS_ROOT, isSafeName, {
  readGlossary: () => readGlossaryFile(),
  writeGlossary: (data) => writeGlossaryFile(data),
})

function sendErr(res, err) {
  const status = err.status || (err.code === 'ENOENT' ? 404 : 500)
  res.status(status).json({ error: err.message || String(err) })
}

/** 项目配置（主题、右栏模块等） */
app.get('/api/app-config', async (_req, res) => {
  try {
    res.json(await readAppConfig())
  } catch (err) {
    sendErr(res, err)
  }
})

app.patch('/api/app-config', async (req, res) => {
  try {
    res.json(await writeAppConfig(req.body || {}))
  } catch (err) {
    sendErr(res, err)
  }
})

/** 文档树 */
app.get('/api/tree', async (_req, res) => {
  try {
    const data = await fsTree.buildTree()
    res.json(data)
  } catch (err) {
    sendErr(res, err)
  }
})

app.post('/api/tree/folders', async (req, res) => {
  try {
    const parentPath = String(req.body?.parentPath ?? '')
    const name = String(req.body?.name ?? '').trim()
    const data = await fsTree.createFolder(parentPath, name)
    res.status(201).json(data)
  } catch (err) {
    sendErr(res, err)
  }
})

app.patch('/api/tree/folders', async (req, res) => {
  try {
    const pathRel = String(req.body?.path ?? '')
    const name = String(req.body?.name ?? '').trim()
    const data = await fsTree.renameEntry(pathRel, name)
    res.json(data)
  } catch (err) {
    sendErr(res, err)
  }
})

app.delete('/api/tree/folders', async (req, res) => {
  try {
    const pathRel = String(req.body?.path ?? req.query?.path ?? '')
    const data = await fsTree.deleteEntry(pathRel)
    res.json(data)
  } catch (err) {
    sendErr(res, err)
  }
})

app.post('/api/tree/files', async (req, res) => {
  try {
    const parentPath = String(req.body?.parentPath ?? '')
    const name = String(req.body?.name ?? '').trim()
    const data = await fsTree.createFile(parentPath, name)
    res.status(201).json(data)
  } catch (err) {
    sendErr(res, err)
  }
})

app.get('/api/tree/file', async (req, res) => {
  try {
    const pathRel = String(req.query?.path ?? '')
    const data = await fsTree.readFileContent(pathRel)
    res.json(data)
  } catch (err) {
    sendErr(res, err)
  }
})

app.put('/api/tree/file', async (req, res) => {
  try {
    const pathRel = String(req.body?.path ?? req.query?.path ?? '')
    const { content } = req.body || {}
    if (typeof content !== 'string') {
      return res.status(400).json({ error: '内容格式错误' })
    }
    const data = await fsTree.writeFileContent(pathRel, content)
    res.json(data)
  } catch (err) {
    sendErr(res, err)
  }
})

app.patch('/api/tree/file', async (req, res) => {
  try {
    const pathRel = String(req.body?.path ?? '')
    const name = String(req.body?.name ?? '').trim()
    const data = await fsTree.renameEntry(pathRel, name)
    res.json(data)
  } catch (err) {
    sendErr(res, err)
  }
})

app.delete('/api/tree/file', async (req, res) => {
  try {
    const pathRel = String(req.body?.path ?? req.query?.path ?? '')
    const data = await fsTree.deleteEntry(pathRel)
    res.json(data)
  } catch (err) {
    sendErr(res, err)
  }
})

/** 移动文件/文件夹（整棵子树） */
app.post('/api/tree/move', async (req, res) => {
  try {
    const fromPath = String(req.body?.fromPath ?? '')
    const toParentPath = String(req.body?.toParentPath ?? '')
    const toIndex =
      req.body?.toIndex == null ? -1 : Number(req.body.toIndex)
    const data = await fsTree.moveEntry(fromPath, toParentPath, toIndex)
    res.json(data)
  } catch (err) {
    sendErr(res, err)
  }
})

async function readTabOrder() {
  try {
    const raw = await fs.readFile(META_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.order) ? data.order : []
  } catch {
    return []
  }
}

async function writeTabOrder(order) {
  await fs.writeFile(META_FILE, JSON.stringify({ order }, null, 2), 'utf-8')
}

async function listTabs() {
  await ensureDocsRoot()
  const { tree } = await fsTree.buildTree()
  return tree.filter((n) => n.type === 'folder').map((n) => n.name)
}

function tabDir(tab) {
  return path.join(DOCS_ROOT, tab)
}

function filePath(tab, file) {
  return path.join(DOCS_ROOT, tab, file)
}

app.get('/api/tabs', async (_req, res) => {
  try {
    const tabs = await listTabs()
    res.json({ tabs })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/tabs', async (req, res) => {
  try {
    const { name } = req.body
    if (!isSafeName(name)) {
      return res.status(400).json({ error: '标签名称不合法' })
    }
    await ensureDocsRoot()
    const dir = tabDir(name)
    try {
      await fs.access(dir)
      return res.status(409).json({ error: '标签已存在' })
    } catch {
      // not exists
    }
    await fs.mkdir(dir, { recursive: true })
    const order = await readTabOrder()
    if (!order.includes(name)) {
      order.push(name)
      await writeTabOrder(order)
    }
    res.status(201).json({ name })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/tabs/:tab', async (req, res) => {
  try {
    const { tab } = req.params
    if (!isSafeName(tab)) {
      return res.status(400).json({ error: '标签名称不合法' })
    }
    const dir = tabDir(tab)
    await fs.rm(dir, { recursive: true, force: true })
    const order = (await readTabOrder()).filter((n) => n !== tab)
    await writeTabOrder(order)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** 重命名文件夹（tab） */
app.patch('/api/tabs/:tab', async (req, res) => {
  try {
    const { tab } = req.params
    let { name } = req.body || {}
    if (!isSafeName(tab)) {
      return res.status(400).json({ error: '原文件夹名称不合法' })
    }
    name = String(name ?? '').trim()
    if (!isSafeName(name)) {
      return res.status(400).json({ error: '新文件夹名称不合法' })
    }
    if (name === tab) {
      return res.json({ name: tab })
    }

    const from = tabDir(tab)
    const to = tabDir(name)
    try {
      await fs.access(from)
    } catch {
      return res.status(404).json({ error: '文件夹不存在' })
    }
    try {
      await fs.access(to)
      return res.status(409).json({ error: '目标文件夹已存在' })
    } catch {
      // ok
    }

    await fs.rename(from, to)

    const order = await readTabOrder()
    const nextOrder = order.map((n) => (n === tab ? name : n))
    if (!nextOrder.includes(name)) nextOrder.push(name)
    await writeTabOrder(nextOrder)

    // 同步 glossary 里该文件夹下的 sourcePath
    try {
      const data = await readGlossaryFile()
      const prefix = `${tab}/`
      let changed = false
      const terms = { ...data.terms }
      for (const [key, term] of Object.entries(terms)) {
        const sp = String(term?.sourcePath || '')
        if (!sp.startsWith(prefix) && sp !== tab) continue
        const rest = sp.startsWith(prefix) ? sp.slice(prefix.length) : ''
        terms[key] = {
          ...term,
          sourcePath: rest ? `${name}/${rest}` : name,
        }
        changed = true
      }
      if (changed) await writeGlossaryFile({ terms })
    } catch {
      // glossary 更新失败不阻断改名
    }

    res.json({ name })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/tabs/:tab/files', async (req, res) => {
  try {
    const { tab } = req.params
    if (!isSafeName(tab)) {
      return res.status(400).json({ error: '标签名称不合法' })
    }
    const dir = tabDir(tab)
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && isSafeName(e.name.replace(/\.md$/, '')))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    res.json({ files })
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: '标签不存在' })
    }
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/tabs/:tab/files', async (req, res) => {
  try {
    const { tab } = req.params
    let { name } = req.body
    if (!isSafeName(tab)) {
      return res.status(400).json({ error: '标签名称不合法' })
    }
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: '文件名称不合法' })
    }
    name = name.replace(/\.md$/i, '')
    if (!isSafeName(name)) {
      return res.status(400).json({ error: '文件名称不合法' })
    }
    const file = ensureMd(name)
    const dir = tabDir(tab)
    await fs.access(dir)
    const target = filePath(tab, file)
    try {
      await fs.access(target)
      return res.status(409).json({ error: '文件已存在' })
    } catch {
      // not exists
    }
    const title = name
    await fs.writeFile(target, `# ${title}\n\n`, 'utf-8')
    res.status(201).json({ name: file })
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: '标签不存在' })
    }
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/tabs/:tab/files/:file', async (req, res) => {
  try {
    const { tab, file: rawFile } = req.params
    const file = ensureMd(decodeURIComponent(rawFile))
    const base = file.replace(/\.md$/, '')
    if (!isSafeName(tab) || !isSafeName(base)) {
      return res.status(400).json({ error: '路径不合法' })
    }
    const content = await fs.readFile(filePath(tab, file), 'utf-8')
    res.json({ name: file, content })
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: '文件不存在' })
    }
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/tabs/:tab/files/:file', async (req, res) => {
  try {
    const { tab, file: rawFile } = req.params
    const file = ensureMd(decodeURIComponent(rawFile))
    const base = file.replace(/\.md$/, '')
    if (!isSafeName(tab) || !isSafeName(base)) {
      return res.status(400).json({ error: '路径不合法' })
    }
    const { content } = req.body
    if (typeof content !== 'string') {
      return res.status(400).json({ error: '内容格式错误' })
    }
    await fs.writeFile(filePath(tab, file), content, 'utf-8')
    res.json({ ok: true, savedAt: new Date().toISOString() })
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: '文件不存在' })
    }
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/tabs/:tab/files/:file', async (req, res) => {
  try {
    const { tab, file: rawFile } = req.params
    const file = ensureMd(decodeURIComponent(rawFile))
    const base = file.replace(/\.md$/, '')
    if (!isSafeName(tab) || !isSafeName(base)) {
      return res.status(400).json({ error: '路径不合法' })
    }

    let { name } = req.body
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: '文件名称不合法' })
    }
    name = name.replace(/\.md$/i, '').trim()
    if (!isSafeName(name)) {
      return res.status(400).json({ error: '文件名称不合法' })
    }

    const nextFile = ensureMd(name)
    if (nextFile === file) {
      return res.json({ name: file })
    }

    const from = filePath(tab, file)
    const to = filePath(tab, nextFile)
    try {
      await fs.access(to)
      return res.status(409).json({ error: '文件已存在' })
    } catch {
      // target not exists
    }

    await fs.rename(from, to)
    res.json({ name: nextFile })
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: '文件不存在' })
    }
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/tabs/:tab/files/:file', async (req, res) => {
  try {
    const { tab, file: rawFile } = req.params
    const file = ensureMd(decodeURIComponent(rawFile))
    const base = file.replace(/\.md$/, '')
    if (!isSafeName(tab) || !isSafeName(base)) {
      return res.status(400).json({ error: '路径不合法' })
    }
    await fs.unlink(filePath(tab, file))
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: '文件不存在' })
    }
    res.status(500).json({ error: err.message })
  }
})

function emptyGlossary() {
  return { lastUpdated: '', terms: {} }
}

/** 含 basic + 全部特殊类型（与 TERM_TYPE_SPECIAL_IDS 对齐） */
const GLOSSARY_TYPE_IDS = [
  'basic',
  'character',
  'faction',
  'class',
  'skill',
  'geo',
  'event',
  'item',
]

function glossaryTypeIds() {
  return GLOSSARY_TYPE_IDS
}

function glossaryTypeFilePath(typeId) {
  return path.join(GLOSSARY_DATA_DIR, `${typeId}.json`)
}

function emptyTypeFile() {
  return { list: [], terms: {} }
}

/**
 * 单类型文件：{ list: string[], terms: Record<title, term> }
 * list = 本文件词条名称索引（与 terms 的 key 对齐）
 */
function normalizeTypeFile(typeId, raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  const termsIn = data.terms && typeof data.terms === 'object' ? data.terms : {}
  const terms = {}
  for (const [key, term] of Object.entries(termsIn)) {
    const title = String(term?.title ?? key).trim()
    if (!title) continue
    terms[title] = {
      ...term,
      title,
      type: typeId,
    }
  }
  let list = Array.isArray(data.list)
    ? data.list.map((t) => String(t ?? '').trim()).filter(Boolean)
    : []
  // list 与 terms 对齐：缺的补上，多余的丢掉，去重保序
  const seen = new Set()
  const nextList = []
  for (const title of list) {
    if (!terms[title] || seen.has(title)) continue
    seen.add(title)
    nextList.push(title)
  }
  for (const title of Object.keys(terms)) {
    if (seen.has(title)) continue
    seen.add(title)
    nextList.push(title)
  }
  return { list: nextList, terms }
}

async function readTypeFile(typeId) {
  try {
    const raw = await fs.readFile(glossaryTypeFilePath(typeId), 'utf-8')
    return normalizeTypeFile(typeId, JSON.parse(raw || '{}'))
  } catch (err) {
    if (err.code === 'ENOENT') return emptyTypeFile()
    throw err
  }
}

async function writeTypeFile(typeId, fileData) {
  const normalized = normalizeTypeFile(typeId, fileData)
  await fs.mkdir(GLOSSARY_DATA_DIR, { recursive: true })
  await fs.writeFile(
    glossaryTypeFilePath(typeId),
    `${JSON.stringify(normalized, null, 2)}\n`,
    'utf-8',
  )
  return normalized
}

/** 旧版单文件 glossary.json → 按类型拆分（一次性） */
async function migrateLegacyGlossaryIfNeeded() {
  let legacy
  try {
    const raw = await fs.readFile(GLOSSARY_LEGACY_FILE, 'utf-8')
    legacy = JSON.parse(raw || '{}')
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
  const terms =
    legacy?.terms && typeof legacy.terms === 'object' ? legacy.terms : {}
  await writeGlossaryFile({
    lastUpdated: legacy?.lastUpdated || new Date().toISOString(),
    terms,
  })
  try {
    await fs.unlink(GLOSSARY_LEGACY_FILE)
  } catch {
    // ignore
  }
  try {
    await fs.rm(path.join(GLOSSARY_DATA_DIR, 'catalog'), {
      recursive: true,
      force: true,
    })
  } catch {
    // ignore
  }
  try {
    await fs.unlink(path.join(GLOSSARY_DATA_DIR, '_meta.json'))
  } catch {
    // ignore
  }
  console.log('[glossary] migrated legacy glossary.json → data/<type>.json')
  return true
}

async function readGlossaryFile() {
  await migrateLegacyGlossaryIfNeeded()
  const terms = {}
  for (const typeId of glossaryTypeIds()) {
    const file = await readTypeFile(typeId)
    for (const [title, term] of Object.entries(file.terms)) {
      terms[title] = { ...term, title, type: typeId }
    }
  }
  return {
    lastUpdated: '',
    terms,
  }
}

async function writeGlossaryFile(data) {
  const terms = scrubIgnoreContexts(
    data.terms && typeof data.terms === 'object' ? data.terms : {},
  )
  const lastUpdated = new Date().toISOString()
  /** @type {Record<string, { list: string[], terms: Record<string, object> }>} */
  const byType = Object.create(null)
  for (const typeId of glossaryTypeIds()) {
    byType[typeId] = { list: [], terms: {} }
  }

  for (const [key, term] of Object.entries(terms)) {
    const title = String(term?.title ?? key).trim()
    if (!title) continue
    const typeId = normalizeTermType(term?.type)
    const bucket = byType[typeId] || byType.basic
    bucket.terms[title] = {
      ...term,
      title,
      type: typeId,
    }
  }
  for (const typeId of glossaryTypeIds()) {
    const bucket = byType[typeId]
    bucket.list = Object.keys(bucket.terms).sort((a, b) =>
      a.localeCompare(b, 'zh'),
    )
    await writeTypeFile(typeId, bucket)
  }
  return { lastUpdated, terms }
}

function normalizeIgnoreContexts(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    const s = String(item ?? '').trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

function normalizeFormerTitles(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    const s = String(item ?? '').trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

const TERM_TYPE_SPECIAL_IDS = new Set([
  'character',
  'faction',
  'class',
  'skill',
  'geo',
  'event',
  'item',
])

function normalizeTermType(value) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!raw || raw === 'basic' || raw === 'generic' || raw === '普通') return 'basic'
  if (TERM_TYPE_SPECIAL_IDS.has(raw)) return raw
  return 'basic'
}

/** 与前端 termAttrs.ts 同语义；换 type 时只保留新类型字段 */
const TERM_ATTR_SCHEMA = {
  character: {
    status: { kind: 'enum', def: 'unknown', ids: ['alive', 'dead', 'unknown'] },
    summary: { kind: 'text' },
  },
  faction: {
    scale: { kind: 'enum', def: 'other', ids: ['org', 'nation', 'force', 'other'] },
  },
  class: {
    kind: { kind: 'enum', def: 'other', ids: ['combat', 'support', 'craft', 'other'] },
  },
  skill: {
    kind: { kind: 'enum', def: 'other', ids: ['active', 'passive', 'other'] },
  },
  geo: {
    kind: {
      kind: 'enum',
      def: 'other',
      ids: ['region', 'settlement', 'landmark', 'other'],
    },
  },
  event: {
    timeLabel: { kind: 'text' },
    status: {
      kind: 'enum',
      def: 'past',
      ids: ['past', 'ongoing', 'future', 'myth'],
    },
  },
  item: {
    slot: {
      kind: 'enum',
      def: 'other',
      ids: ['weapon', 'armor', 'accessory', 'consumable', 'other'],
    },
    rarity: {
      kind: 'enum',
      def: 'none',
      ids: [
        'common',
        'uncommon',
        'rare',
        'epic',
        'legendary',
        'unique',
        'none',
      ],
    },
  },
}

function normalizeTermAttrs(type, raw) {
  const termType = normalizeTermType(type)
  const schema = TERM_ATTR_SCHEMA[termType]
  if (!schema) return {}
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const out = {}
  for (const [key, field] of Object.entries(schema)) {
    if (field.kind === 'enum') {
      const v = String(src[key] ?? '')
        .trim()
        .toLowerCase()
      out[key] = field.ids.includes(v) ? v : field.def
    } else {
      const text = String(src[key] ?? '').trim()
      if (text) out[key] = text
    }
  }
  return out
}

/**
 * 旧版 boolean → []；数组则规范化为冲突项列表。
 */
function normalizePendingManualConfirm(value) {
  if (!Array.isArray(value)) return []
  const out = []
  const seen = new Set()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const id = String(raw.id ?? '').trim()
    const sourcePath = String(raw.sourcePath ?? '').trim()
    const hit = String(raw.hit ?? '').trim()
    if (!id || !sourcePath || !hit || seen.has(id)) continue
    const from = Number(raw.from)
    const to = Number(raw.to)
    seen.add(id)
    out.push({
      id,
      sourcePath,
      kind: String(raw.kind ?? '').trim() || 'new-title',
      hit,
      context: String(raw.context ?? '').trim() || hit,
      from: Number.isFinite(from) ? from : 0,
      to: Number.isFinite(to) ? to : 0,
    })
  }
  return out
}

/** 文案本身已成为词条标题时，从 ignore / former 中移除冲突项 */
function scrubIgnoreContexts(terms) {
  const titles = new Set(Object.keys(terms || {}))
  const next = {}
  for (const [key, term] of Object.entries(terms || {})) {
    const type = normalizeTermType(term?.type)
    next[key] = {
      ...term,
      type,
      attrs: normalizeTermAttrs(type, term?.attrs),
      ignoreContexts: normalizeIgnoreContexts(term?.ignoreContexts).filter(
        (c) => c === key || !titles.has(c),
      ),
      formerTitles: normalizeFormerTitles(term?.formerTitles).filter(
        (f) => f !== key && !titles.has(f),
      ),
      pendingManualConfirm: normalizePendingManualConfirm(
        term?.pendingManualConfirm,
      ),
    }
  }
  return next
}

/**
 * 扫描全部 Markdown，得到 title → term。
 * 保留已有 ignoreContexts / formerTitles。
 */
async function scanMarkdownTerms(existingTerms = {}) {
  /** @type {Record<string, object>} */
  const terms = {}
  const paths = await fsTree.listAllMarkdownPaths()

  for (const sourcePath of paths) {
    let content
    try {
      content = await fs.readFile(fsTree.absOf(sourcePath), 'utf-8')
    } catch {
      continue
    }

    TERM_BLOCK_RE.lastIndex = 0
    let match
    while ((match = TERM_BLOCK_RE.exec(content)) !== null) {
      const title = match[1].trim()
      if (!title) continue
      const prev = existingTerms[title]
      const type = normalizeTermType(prev?.type)
      terms[title] = {
        title,
        description: match[2].replace(/\r\n/g, '\n').trim(),
        sourcePath,
        type,
        attrs: normalizeTermAttrs(type, prev?.attrs),
        ignoreContexts: normalizeIgnoreContexts(prev?.ignoreContexts),
        formerTitles: normalizeFormerTitles(prev?.formerTitles),
        pendingManualConfirm: normalizePendingManualConfirm(
          prev?.pendingManualConfirm,
        ),
      }
    }
  }

  return scrubIgnoreContexts(terms)
}

function glossaryEqual(a, b) {
  return JSON.stringify(a?.terms || {}) === JSON.stringify(b?.terms || {})
}

/** 读取 glossary.json */
app.get('/api/glossary', async (_req, res) => {
  try {
    res.json(await readGlossaryFile())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** 整表写回 glossary.json */
app.put('/api/glossary', async (req, res) => {
  try {
    const terms = req.body?.terms
    if (!terms || typeof terms !== 'object') {
      return res.status(400).json({ error: 'terms 格式错误' })
    }
    const normalized = {}
    for (const [key, term] of Object.entries(terms)) {
      const title = String(term?.title ?? key).trim()
      if (!title) continue
      const type = normalizeTermType(term?.type)
      normalized[title] = {
        title,
        description: String(term?.description ?? '').trim(),
        sourcePath: String(term?.sourcePath ?? ''),
        type,
        attrs: normalizeTermAttrs(type, term?.attrs),
        ignoreContexts: normalizeIgnoreContexts(term?.ignoreContexts),
        formerTitles: normalizeFormerTitles(term?.formerTitles),
        pendingManualConfirm: normalizePendingManualConfirm(
          term?.pendingManualConfirm,
        ),
      }
    }
    res.json(await writeGlossaryFile({ terms: normalized }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * 启动校验：扫描全部 .md 的 ::: term，与 glossary.json 比对，有变动则写回。
 */
app.post('/api/glossary/sync', async (_req, res) => {
  try {
    const current = await readGlossaryFile()
    const fromMd = await scanMarkdownTerms(current.terms || {})
    const next = { lastUpdated: current.lastUpdated, terms: fromMd }
    if (!glossaryEqual(current, next)) {
      res.json(await writeGlossaryFile(next))
    } else {
      res.json(current)
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * 单文件保存后同步：更新该 sourcePath 下的词条。
 * 保留 ignoreContexts / formerTitles。
 */
app.patch('/api/glossary/file', async (req, res) => {
  try {
    const sourcePath = String(req.body?.sourcePath || '').trim()
    const fileTerms = Array.isArray(req.body?.terms) ? req.body.terms : null
    if (!sourcePath || !fileTerms) {
      return res.status(400).json({ error: 'sourcePath / terms 格式错误' })
    }

    const data = await readGlossaryFile()
    const nextTerms = { ...data.terms }
    /** @type {Record<string, { ignoreContexts: string[], formerTitles: string[], pendingManualConfirm: object[], type: string, attrs: object }>} */
    const preserved = {}

    for (const [key, term] of Object.entries(nextTerms)) {
      if (term?.sourcePath === sourcePath) {
        const type = normalizeTermType(term.type)
        preserved[key] = {
          type,
          attrs: normalizeTermAttrs(type, term.attrs),
          ignoreContexts: normalizeIgnoreContexts(term.ignoreContexts),
          formerTitles: normalizeFormerTitles(term.formerTitles),
          pendingManualConfirm: normalizePendingManualConfirm(
            term.pendingManualConfirm,
          ),
        }
        delete nextTerms[key]
      }
    }

    const newTitles = fileTerms
      .map((item) => String(item?.title ?? '').trim())
      .filter(Boolean)
    const removedTitles = Object.keys(preserved).filter((t) => !newTitles.includes(t))
    const addedTitles = newTitles.filter((t) => !preserved[t])
    /** 同一文件内一对一改名：迁移旧条目的 ignore / former / pending，但不自动把中间名写入 formerTitles（正式曾用名由 commitTermRename 写入） */
    const renameMap = new Map()
    if (removedTitles.length === 1 && addedTitles.length === 1) {
      renameMap.set(addedTitles[0], removedTitles[0])
    }

    for (const item of fileTerms) {
      const title = String(item?.title ?? '').trim()
      if (!title) continue
      const fromPrev = preserved[title]
      const fromData = data.terms[title]
      const renamedFrom = renameMap.get(title)
      const fromOld = renamedFrom ? preserved[renamedFrom] : null
      const former = normalizeFormerTitles([
        ...(fromPrev?.formerTitles || []),
        ...(fromData && !renamedFrom
          ? normalizeFormerTitles(fromData.formerTitles)
          : []),
        ...(fromOld?.formerTitles || []),
      ]).filter((f) => f !== title)
      const type = normalizeTermType(
        fromPrev?.type || fromData?.type || fromOld?.type || item?.type,
      )
      nextTerms[title] = {
        title,
        description: String(item?.description ?? '').trim(),
        sourcePath,
        type,
        attrs: normalizeTermAttrs(
          type,
          fromPrev?.attrs || fromData?.attrs || fromOld?.attrs,
        ),
        // 改名时保留旧词条的 ignore（「不需要修改」回改后仍应生效）
        ignoreContexts: normalizeIgnoreContexts(
          fromPrev?.ignoreContexts ||
            fromData?.ignoreContexts ||
            fromOld?.ignoreContexts,
        ),
        formerTitles: former,
        // 改名后 pending 由 rename-sync 重新写入；此处先清空
        pendingManualConfirm: renamedFrom
          ? []
          : normalizePendingManualConfirm(
              fromPrev?.pendingManualConfirm || fromData?.pendingManualConfirm,
            ),
      }
    }

    res.json(await writeGlossaryFile({ terms: nextTerms }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 正文行内已确认引用 term[title]（不含 ::: term [title] 定义块） */
function hasInlineConfirmedTermRef(markdown, title) {
  const needle = String(title || '').trim()
  if (!needle || !markdown) return false
  const blockRe = /:::[\t ]*term[\t ]*\[[^\]]*\]\s*([\s\S]*?)\s*:::/gi
  const masked = String(markdown).replace(blockRe, (block) =>
    ' '.repeat(block.length),
  )
  const re = new RegExp(`term\\[\\s*${escapeRegExp(needle)}\\s*\\]`)
  return re.test(masked)
}

/** 全库是否存在某标题的行内已确认引用 */
async function anyFileHasInlineConfirmedTermRef(title) {
  const needle = String(title || '').trim()
  if (!needle) return false
  const mdPaths = await fsTree.listAllMarkdownPaths()
  for (const sourcePath of mdPaths) {
    const fp = fsTree.absOf(sourcePath)
    let content
    try {
      content = await fs.readFile(fp, 'utf-8')
    } catch {
      continue
    }
    if (hasInlineConfirmedTermRef(content, needle)) return true
  }
  return false
}

/** 全库把已确认 term[old] 替换为 term[new] */
function replaceConfirmedRefs(markdown, oldTitle, newTitle) {
  const re = new RegExp(`term\\[\\s*${escapeRegExp(oldTitle)}\\s*\\]`, 'g')
  return markdown.replace(re, `term[${newTitle}]`)
}

/**
 * 冲突展示上下文：取命中所在行；过长则保留命中前后各 pad 字并加省略号。
 * （写入 ignore 仍由前端短上下文处理，不共用此串。）
 */
function extractLineContext(text, from, to, { maxLen = 40, pad = 15 } = {}) {
  const lineStart = text.lastIndexOf('\n', Math.max(0, from - 1)) + 1
  let lineEnd = text.indexOf('\n', to)
  if (lineEnd < 0) lineEnd = text.length
  const line = text.slice(lineStart, lineEnd)
  if (!line) return text.slice(from, to)

  const hitFrom = from - lineStart
  const hitTo = to - lineStart
  if (line.length <= maxLen) return line

  let ctxStart = Math.max(0, hitFrom - pad)
  let ctxEnd = Math.min(line.length, hitTo + pad)
  // 尽量凑满 maxLen，便于阅读
  const need = maxLen - (ctxEnd - ctxStart)
  if (need > 0) {
    const extraLeft = Math.min(ctxStart, Math.floor(need / 2))
    ctxStart -= extraLeft
    ctxEnd = Math.min(line.length, ctxEnd + (need - extraLeft))
    ctxStart = Math.max(0, ctxEnd - maxLen)
  }
  const prefix = ctxStart > 0 ? '…' : ''
  const suffix = ctxEnd < line.length ? '…' : ''
  return `${prefix}${line.slice(ctxStart, ctxEnd)}${suffix}`
}

/** 命中是否落在某条 ignore 短上下文内（与前端 isIgnoredInText 一致） */
function isIgnoredInText(text, matchFrom, matchTo, ignoreContexts) {
  for (const ctx of ignoreContexts || []) {
    if (!ctx) continue
    let from = 0
    while (from <= text.length) {
      const idx = text.indexOf(ctx, from)
      if (idx < 0) break
      const ctxTo = idx + ctx.length
      if (matchFrom >= idx && matchTo <= ctxTo) return true
      from = idx + 1
    }
  }
  return false
}

/**
 * 全库是否存在某标题的行内已确认引用 term[title]（不含定义块）。
 * 用于改名时决定是否把旧名写入 formerTitles。
 */
app.get('/api/glossary/has-confirmed-ref', async (req, res) => {
  try {
    const title = String(req.query?.title || '').trim()
    if (!title) {
      return res.status(400).json({ error: 'title 必填' })
    }
    const has = await anyFileHasInlineConfirmedTermRef(title)
    res.json({ title, has })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * 改名后：同步已确认引用，并扫描裸新名/曾用名冲突。
 * body: { oldTitle, newTitle, alsoReplace?, recordAsFormer? }
 */
app.post('/api/glossary/rename-sync', async (req, res) => {
  try {
    const oldTitle = String(req.body?.oldTitle || '').trim()
    const newTitle = String(req.body?.newTitle || '').trim()
    if (!oldTitle || !newTitle) {
      return res.status(400).json({ error: 'oldTitle / newTitle 必填' })
    }

    const alsoReplace = Array.isArray(req.body?.alsoReplace)
      ? req.body.alsoReplace.map((t) => String(t || '').trim()).filter(Boolean)
      : []
    const replaceTitles = Array.from(
      new Set([oldTitle, ...alsoReplace].filter((t) => t && t !== newTitle)),
    )
    const recordAsFormer = req.body?.recordAsFormer === true

    const conflicts = []
    let refUpdatedFiles = 0

    const glossary = await readGlossaryFile()
    const ignoreContexts = normalizeIgnoreContexts(
      glossary.terms?.[newTitle]?.ignoreContexts,
    )

    const mdPaths = await fsTree.listAllMarkdownPaths()
    for (const sourcePath of mdPaths) {
        const fp = fsTree.absOf(sourcePath)
        let content
        try {
          content = await fs.readFile(fp, 'utf-8')
        } catch {
          continue
        }
        let next = content
        if (oldTitle !== newTitle) {
          let replaced = content
          for (const t of replaceTitles) {
            replaced = replaceConfirmedRefs(replaced, t, newTitle)
          }
          if (replaced !== content) {
            next = replaced
            await fs.writeFile(fp, replaced, 'utf-8')
            refUpdatedFiles += 1
          }
        }

        // 扫描裸冲突：去掉 term[] 与定义块后再找
        let scanText = next.replace(
          /:::[\t ]*term[\t ]*\[[^\]]*\][\s\S]*?:::/gi,
          (block) => ' '.repeat(block.length),
        )
        scanText = scanText.replace(/term\[[^\]]+\]/g, (m) => ' '.repeat(m.length))

        const pushHits = (needle, kind) => {
          if (!needle) return
          let from = 0
          while (from <= scanText.length) {
            const idx = scanText.indexOf(needle, from)
            if (idx < 0) break
            const to = idx + needle.length
            from = idx + 1
            // 已「不需要修改」的上下文不再进冲突抽屉（含回改后的曾用名命中）
            if (isIgnoredInText(scanText, idx, to, ignoreContexts)) continue
            conflicts.push({
              id: `${sourcePath}:${idx}:${kind}:${needle}`,
              sourcePath,
              kind,
              hit: needle,
              context: extractLineContext(scanText, idx, to),
              from: idx,
              to,
            })
          }
        }

        if (oldTitle !== newTitle) {
          // 只扫新名裸文本。曾用名正文若在「新名冲突」时已「不需要修改」，
          // 再扫曾用名会把同一批内容再次推进抽屉（例如 能量→气 又弹出能量）。
          pushHits(newTitle, 'new-title')
        }
    }

    console.log(
      `[glossary/rename-sync] ${oldTitle} → ${newTitle}: refs=${refUpdatedFiles}, conflicts=${conflicts.length}, replace=[${replaceTitles.join(',')}], recordFormer=${recordAsFormer}`,
    )

    // 扫描结果整表写入 pendingManualConfirm；曾用名按「是否承认过旧名」落库
    const latest = await readGlossaryFile()
    const terms = { ...latest.terms }
    const prevTerm = terms[newTitle]
    const baseFormer = normalizeFormerTitles([
      ...(prevTerm?.formerTitles || []),
    ]).filter((f) => f !== newTitle && f !== oldTitle)
    const formerTitles = normalizeFormerTitles(
      recordAsFormer ? [...baseFormer, oldTitle] : baseFormer,
    ).filter((f) => f !== newTitle)

    if (prevTerm) {
      terms[newTitle] = {
        ...prevTerm,
        formerTitles,
        pendingManualConfirm: normalizePendingManualConfirm(conflicts),
      }
    } else {
      terms[newTitle] = {
        title: newTitle,
        description: '',
        sourcePath: '',
        type: 'basic',
        attrs: {},
        ignoreContexts: [],
        formerTitles,
        pendingManualConfirm: normalizePendingManualConfirm(conflicts),
      }
    }
    const saved = await writeGlossaryFile({ terms })

    res.json({
      refUpdatedFiles,
      conflicts,
      recordAsFormer,
      lastUpdated: saved.lastUpdated,
      terms: saved.terms,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * 批量应用冲突处理。
 * body: {
 *   newTitle,
 *   confirms: [{ id, sourcePath, from, to, title, hit }],
 *   ignores: [{ sourcePath, from, to, context, termTitle }],
 *   resolvedIds: string[]  // 从 pendingManualConfirm 中删除
 * }
 */
app.post('/api/glossary/apply-conflicts', async (req, res) => {
  try {
    const newTitle = String(req.body?.newTitle || '').trim()
    const confirms = Array.isArray(req.body?.confirms) ? req.body.confirms : []
    const ignores = Array.isArray(req.body?.ignores) ? req.body.ignores : []
    const resolvedIds = new Set(
      (Array.isArray(req.body?.resolvedIds) ? req.body.resolvedIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    )
    /** 兜底：按 path|hit|title 清 pending，避免旧 id 格式对不上 */
    const resolvedKeys = new Set()

    /** 把定义块与已确认 term[] 掩成空格，避免命中写进 term 内部 */
    function maskProtected(content) {
      let masked = String(content || '').replace(
        /:::[\t ]*term[\t ]*\[[^\]]*\]\s*([\s\S]*?)\s*:::/gi,
        (block) => ' '.repeat(block.length),
      )
      masked = masked.replace(/term\[[^\]]*\]/g, (m) => ' '.repeat(m.length))
      return masked
    }

    /** 仅在裸文本中定位 hit（绝不落入 term[...] 内） */
    function locateHit(content, from, to, hit, title) {
      const needle = String(hit || title || '').trim()
      if (!needle) return null
      const masked = maskProtected(content)
      const start = Number(from)
      const end = Number(to)

      const spanOk = (a, b) => {
        if (a < 0 || b > content.length || b <= a) return false
        if (content.slice(a, b) !== needle) return false
        // 掩码后对应区间必须仍等于 needle（说明不在 term[] / 定义块内）
        if (masked.slice(a, b) !== needle) return false
        return true
      }

      if (Number.isFinite(start) && Number.isFinite(end) && spanOk(start, end)) {
        return { from: start, to: end }
      }

      const hint = Number.isFinite(start) ? Math.max(0, start - 32) : 0
      let idx = masked.indexOf(needle, hint)
      if (idx < 0) idx = masked.indexOf(needle)
      if (idx < 0) return null
      if (!spanOk(idx, idx + needle.length)) return null
      return { from: idx, to: idx + needle.length }
    }

    // 按文件聚合 confirms
    /** @type {Map<string, Array<{ from: number, to: number, title: string, hit: string, id: string }>>} */
    const byFile = new Map()
    for (const item of confirms) {
      const sourcePath = String(item?.sourcePath || '').trim()
      const title = String(item?.title || newTitle).trim()
      const hit = String(item?.hit || title).trim()
      const from = Number(item?.from)
      const to = Number(item?.to)
      const id = String(item?.id || '').trim()
      if (!sourcePath || !title || !hit) continue
      if (!byFile.has(sourcePath)) byFile.set(sourcePath, [])
      byFile.get(sourcePath).push({ from, to, title, hit, id })
      if (id) resolvedIds.add(id)
      resolvedKeys.add(`${sourcePath}\0${hit}\0${title}`)
    }

    for (const [sourcePath, ops] of byFile) {
      const fp = fsTree.absOf(sourcePath)
      let content = await fs.readFile(fp, 'utf-8')
      // 每次在当前正文上选最靠后的「裸文本」命中
      const pending = [...ops]
      while (pending.length) {
        let bestI = -1
        let bestSpan = null
        for (let i = 0; i < pending.length; i += 1) {
          const op = pending[i]
          const span = locateHit(content, op.from, op.to, op.hit, op.title)
          if (!span) continue
          if (!bestSpan || span.from > bestSpan.from) {
            bestSpan = span
            bestI = i
          }
        }
        if (bestI < 0 || !bestSpan) {
          // 剩余项无法安全定位：仍视为已处理（清 pending），避免反复点坏正文
          break
        }
        const [op] = pending.splice(bestI, 1)
        content =
          content.slice(0, bestSpan.from) +
          `term[${op.title}]` +
          content.slice(bestSpan.to)
        if (op.id) resolvedIds.add(op.id)
        resolvedKeys.add(`${sourcePath}\0${op.hit}\0${op.title}`)
      }
      await fs.writeFile(fp, content, 'utf-8')
    }

    const data = await readGlossaryFile()
    const terms = { ...data.terms }

    // ignores → glossary（词条缺失时补建）
    for (const item of ignores) {
      const termTitle = String(item?.termTitle || newTitle).trim()
      const ctx = String(item?.context || '').trim()
      const sourcePath = String(item?.sourcePath || '').trim()
      const hit = String(item?.hit || '').trim()
      if (!termTitle || !ctx) continue
      const prev = terms[termTitle]
      const list = normalizeIgnoreContexts(prev?.ignoreContexts)
      if (!list.includes(ctx)) list.push(ctx)
      const type = normalizeTermType(prev?.type)
      terms[termTitle] = {
        title: termTitle,
        description: String(prev?.description ?? '').trim(),
        sourcePath: String(prev?.sourcePath || sourcePath || '').trim(),
        type,
        attrs: normalizeTermAttrs(type, prev?.attrs),
        ignoreContexts: list,
        formerTitles: normalizeFormerTitles(prev?.formerTitles),
        pendingManualConfirm: normalizePendingManualConfirm(
          prev?.pendingManualConfirm,
        ),
      }
      const id = String(item?.id || '').trim()
      if (id) resolvedIds.add(id)
      if (sourcePath && (hit || termTitle)) {
        resolvedKeys.add(`${sourcePath}\0${hit || termTitle}\0${termTitle}`)
      }
    }

    // 从所有词条的 pending 中删除已处理项（id 或 path+hit+title）
    if (resolvedIds.size || resolvedKeys.size) {
      for (const [key, prev] of Object.entries(terms)) {
        const pending = normalizePendingManualConfirm(prev?.pendingManualConfirm)
        if (!pending.length) continue
        const termTitle = String(prev?.title || key || '').trim()
        const next = pending.filter((c) => {
          if (resolvedIds.has(c.id)) return false
          const k1 = `${c.sourcePath}\0${c.hit}\0${termTitle}`
          const k2 = `${c.sourcePath}\0${c.hit}\0${c.hit}`
          if (resolvedKeys.has(k1) || resolvedKeys.has(k2)) return false
          return true
        })
        if (next.length !== pending.length) {
          terms[key] = { ...prev, pendingManualConfirm: next }
        }
      }
    }

    res.json(await writeGlossaryFile({ terms }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

await ensureDocsRoot()

// Express 5：端口占用等错误会进回调第一个参数；若忽略会导致假「已启动」后立刻退出
const server = app.listen(PORT, (err) => {
  if (err) {
    console.error(`[api] 启动失败: ${err.message}`)
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[api] 端口 ${PORT} 已被占用。请先结束旧进程后再运行 npm run dev：\n` +
          `  Windows: netstat -ano | findstr :${PORT}  →  taskkill /PID <pid> /F`,
      )
    }
    process.exit(1)
  }
  console.log(`文档 API 已启动: http://localhost:${PORT}`)
  console.log(`文档存储目录: ${DOCS_ROOT}`)
})

server.on('error', (err) => {
  console.error(`[api] 服务错误: ${err.message}`)
  process.exit(1)
})
