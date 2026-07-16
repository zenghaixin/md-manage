import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DOCS_ROOT = path.resolve(__dirname, '../docs')
const META_FILE = path.join(DOCS_ROOT, '.tabs.json')

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
  const entries = await fs.readdir(DOCS_ROOT, { withFileTypes: true })
  const folders = entries
    .filter((e) => e.isDirectory() && isSafeName(e.name))
    .map((e) => e.name)

  const prevOrder = await readTabOrder()
  let order = prevOrder.filter((name) => folders.includes(name))
  for (const name of folders) {
    if (!order.includes(name)) order.push(name)
  }
  // 仅在顺序变化时写入，避免每次 GET 都触发 Vite 整页刷新
  if (JSON.stringify(order) !== JSON.stringify(prevOrder)) {
    await writeTabOrder(order)
  }
  return order
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

await ensureDocsRoot()
app.listen(PORT, () => {
  console.log(`文档 API 已启动: http://localhost:${PORT}`)
  console.log(`文档存储目录: ${DOCS_ROOT}`)
})
