/**
 * 文档树：嵌套文件夹 + 顺序持久化 + 移动/重名。
 * 路径均为相对 DOCS_ROOT、正斜杠，如 `A/B`、`A/B/x.md`；根为 `''`。
 */
import fs from 'fs/promises'
import path from 'path'
import {
  GLOSSARY_ROOT as GLOSSARY_ROOT_FOLDER,
  GLOSSARY_DEFAULT_FILE,
  GLOSSARY_DEFAULT_MD,
} from './glossaryStore.js'

const META_TREE = '.tree.json'
const META_TABS = '.tabs.json'

/**
 * @param {string} docsRoot
 * @param {(name: string) => boolean} isSafeName
 * @param {{
 *   readGlossary: () => Promise<any>
 *   writeGlossary: (data: any) => Promise<any>
 *   onGlossaryTreeChanged?: () => Promise<void>
 *   remapIndexPaths?: (remapFn: (path: string) => string | null | undefined) => Promise<void>
 * }} glossary
 */
export function createFsTree(docsRoot, isSafeName, glossary) {
  const treeMetaPath = path.join(docsRoot, META_TREE)

  function isGlossarySystemFolder(rel) {
    return normRel(rel) === GLOSSARY_ROOT_FOLDER
  }

  function isGlossaryDefPath(rel) {
    const p = normRel(rel)
    return p === GLOSSARY_ROOT_FOLDER || p.startsWith(`${GLOSSARY_ROOT_FOLDER}/`)
  }

  async function notifyGlossaryTreeChanged() {
    try {
      await glossary.onGlossaryTreeChanged?.()
    } catch (err) {
      console.warn('[fsTree] glossary tree sync failed:', err?.message || err)
    }
  }

  /** 确保系统文件夹与默认落盘文件存在，并置顶 */
  async function ensureGlossarySystem() {
    await ensureRoot()
    const folderAbs = path.join(docsRoot, GLOSSARY_ROOT_FOLDER)
    await fs.mkdir(folderAbs, { recursive: true })
    const defaultAbs = path.join(docsRoot, ...GLOSSARY_DEFAULT_FILE.split('/'))
    try {
      await fs.access(defaultAbs)
    } catch {
      await fs.writeFile(defaultAbs, `# 默认词条\n\n`, 'utf-8')
    }
    const orderMap = await readOrderMap()
    await syncDirOrder('', orderMap)
    const list = orderMap[''] || []
    if (!list.includes(GLOSSARY_ROOT_FOLDER)) {
      list.unshift(GLOSSARY_ROOT_FOLDER)
      orderMap[''] = list
    } else if (list[0] !== GLOSSARY_ROOT_FOLDER) {
      orderMap[''] = [
        GLOSSARY_ROOT_FOLDER,
        ...list.filter((n) => n !== GLOSSARY_ROOT_FOLDER),
      ]
    }
    const childKey = GLOSSARY_ROOT_FOLDER
    await syncDirOrder(childKey, orderMap)
    const kids = orderMap[childKey] || []
    const defaultName = GLOSSARY_DEFAULT_MD
    let nextKids = [...kids]
    if (!nextKids.includes(defaultName)) {
      nextKids = [defaultName, ...nextKids]
    } else if (nextKids[0] !== defaultName) {
      nextKids = [defaultName, ...nextKids.filter((n) => n !== defaultName)]
    }
    orderMap[childKey] = nextKids
    await writeOrderMap(orderMap)
    await notifyGlossaryTreeChanged()
  }

  function normRel(p) {
    return String(p ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
  }

  function segmentsOf(rel) {
    const n = normRel(rel)
    return n ? n.split('/').filter(Boolean) : []
  }

  function joinRel(...parts) {
    return parts
      .map(normRel)
      .filter(Boolean)
      .join('/')
  }

  function parentRel(rel) {
    const segs = segmentsOf(rel)
    if (segs.length <= 1) return ''
    return segs.slice(0, -1).join('/')
  }

  function baseName(rel) {
    const segs = segmentsOf(rel)
    return segs[segs.length - 1] || ''
  }

  function absOf(rel) {
    const segs = segmentsOf(rel)
    for (const s of segs) {
      const base = s.endsWith('.md') ? s.replace(/\.md$/i, '') : s
      if (!isSafeName(base)) throw new Error(`路径不合法: ${rel}`)
    }
    const abs = path.resolve(docsRoot, ...segs)
    const root = path.resolve(docsRoot)
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      throw new Error('路径越界')
    }
    return abs
  }

  function ensureMd(name) {
    const n = String(name || '').replace(/\.md$/i, '').trim()
    return `${n}.md`
  }

  async function ensureRoot() {
    await fs.mkdir(docsRoot, { recursive: true })
  }

  async function readOrderMap() {
    try {
      const raw = await fs.readFile(treeMetaPath, 'utf-8')
      const data = JSON.parse(raw)
      if (data?.order && typeof data.order === 'object') return data.order
    } catch {
      // migrate from .tabs.json
    }
    try {
      const raw = await fs.readFile(path.join(docsRoot, META_TABS), 'utf-8')
      const data = JSON.parse(raw)
      const tabs = Array.isArray(data.order) ? data.order : []
      return { '': tabs }
    } catch {
      return { '': [] }
    }
  }

  async function writeOrderMap(order) {
    await fs.writeFile(
      treeMetaPath,
      `${JSON.stringify({ order }, null, 2)}\n`,
      'utf-8',
    )
  }

  async function listRawChildren(relDir) {
    const abs = absOf(relDir)
    let entries
    try {
      entries = await fs.readdir(abs, { withFileTypes: true })
    } catch (err) {
      if (err.code === 'ENOENT') return { folders: [], files: [] }
      throw err
    }
    const folders = []
    const files = []
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      if (e.isDirectory() && isSafeName(e.name)) folders.push(e.name)
      if (
        e.isFile() &&
        e.name.endsWith('.md') &&
        isSafeName(e.name.replace(/\.md$/i, ''))
      ) {
        files.push(e.name)
      }
    }
    return { folders, files }
  }

  async function syncDirOrder(relDir, orderMap) {
    const key = normRel(relDir)
    const { folders, files } = await listRawChildren(key)
    const existing = new Set([...folders, ...files])
    const prev = Array.isArray(orderMap[key]) ? orderMap[key] : []
    let next = prev.filter((n) => existing.has(n))
    for (const n of [...folders.sort((a, b) => a.localeCompare(b, 'zh')), ...files.sort((a, b) => a.localeCompare(b, 'zh'))]) {
      if (!next.includes(n)) next.push(n)
    }
    // 根级「词条」系统文件夹始终置顶
    if (key === '' && next.includes(GLOSSARY_ROOT_FOLDER)) {
      next = [
        GLOSSARY_ROOT_FOLDER,
        ...next.filter((n) => n !== GLOSSARY_ROOT_FOLDER),
      ]
    }
    orderMap[key] = next
    return next
  }

  async function buildTree() {
    await ensureGlossarySystem()
    const orderMap = await readOrderMap()
    let changed = false

    async function walk(relDir) {
      const before = JSON.stringify(orderMap[normRel(relDir)] || [])
      const names = await syncDirOrder(relDir, orderMap)
      if (JSON.stringify(names) !== before) changed = true
      const { folders, files } = await listRawChildren(relDir)
      const folderSet = new Set(folders)
      const fileSet = new Set(files)
      /** @type {any[]} */
      const children = []
      for (const name of names) {
        if (folderSet.has(name)) {
          const childPath = joinRel(relDir, name)
          const system = !relDir && name === GLOSSARY_ROOT_FOLDER
          children.push({
            type: 'folder',
            name,
            path: childPath,
            system: system || undefined,
            protected: system || undefined,
            children: await walk(childPath),
          })
        } else if (fileSet.has(name)) {
          children.push({
            type: 'file',
            name,
            path: joinRel(relDir, name),
          })
        }
      }
      return children
    }

    const tree = await walk('')
    // prune missing keys
    const live = new Set([''])
    function collect(nodes) {
      for (const n of nodes) {
        if (n.type === 'folder') {
          live.add(n.path)
          collect(n.children || [])
        }
      }
    }
    collect(tree)
    for (const k of Object.keys(orderMap)) {
      if (!live.has(k)) {
        delete orderMap[k]
        changed = true
      }
    }
    if (changed) await writeOrderMap(orderMap)
    return { tree, order: orderMap }
  }

  async function existsRel(rel) {
    try {
      await fs.access(absOf(rel))
      return true
    } catch {
      return false
    }
  }

  /**
   * Windows 风格：name → name (1) → name (2)
   * @param {string} parentRel
   * @param {string} desiredName folder name or file.md
   * @param {'folder'|'file'} kind
   */
  async function uniqueChildName(parentRel, desiredName, kind) {
    let name =
      kind === 'file' ? ensureMd(desiredName) : String(desiredName || '').trim()
    if (kind === 'file') {
      const base = name.replace(/\.md$/i, '')
      if (!isSafeName(base)) throw new Error('名称不合法')
    } else if (!isSafeName(name)) {
      throw new Error('名称不合法')
    }

    const parentAbs = absOf(parentRel)
    const stem = kind === 'file' ? name.replace(/\.md$/i, '') : name
    const ext = kind === 'file' ? '.md' : ''

    let candidate = kind === 'file' ? `${stem}${ext}` : stem
    let i = 0
    while (true) {
      try {
        await fs.access(path.join(parentAbs, candidate))
        i += 1
        candidate =
          kind === 'file' ? `${stem} (${i})${ext}` : `${stem} (${i})`
        if (kind === 'file') {
          const b = candidate.replace(/\.md$/i, '')
          if (!isSafeName(b)) throw new Error('无法生成可用名称')
        } else if (!isSafeName(candidate)) {
          throw new Error('无法生成可用名称')
        }
      } catch (err) {
        if (err.code === 'ENOENT') return candidate
        throw err
      }
    }
  }

  async function createFolder(parentPath, name) {
    await ensureRoot()
    const parent = normRel(parentPath)
    if (parent && !(await existsRel(parent))) {
      throw Object.assign(new Error('父文件夹不存在'), { status: 404 })
    }
    const finalName = await uniqueChildName(parent, name, 'folder')
    const rel = joinRel(parent, finalName)
    await fs.mkdir(absOf(rel), { recursive: true })
    const orderMap = await readOrderMap()
    await syncDirOrder(parent, orderMap)
    const list = orderMap[parent] || []
    if (!list.includes(finalName)) {
      list.push(finalName)
      orderMap[parent] = list
    }
    orderMap[rel] = orderMap[rel] || []
    await writeOrderMap(orderMap)
    if (isGlossaryDefPath(rel) || isGlossaryDefPath(parent)) {
      await notifyGlossaryTreeChanged()
    }
    return { path: rel, name: finalName }
  }

  async function createFile(parentPath, name) {
    await ensureRoot()
    const parent = normRel(parentPath)
    if (parent && !(await existsRel(parent))) {
      throw Object.assign(new Error('父文件夹不存在'), { status: 404 })
    }
    if (!parent) {
      throw Object.assign(new Error('不能在根目录直接新建文件，请先选择文件夹'), {
        status: 400,
      })
    }
    const finalName = await uniqueChildName(parent, name, 'file')
    const rel = joinRel(parent, finalName)
    const title = finalName.replace(/\.md$/i, '')
    await fs.writeFile(absOf(rel), `# ${title}\n\n`, 'utf-8')
    const orderMap = await readOrderMap()
    await syncDirOrder(parent, orderMap)
    const list = orderMap[parent] || []
    if (!list.includes(finalName)) {
      list.push(finalName)
      orderMap[parent] = list
      await writeOrderMap(orderMap)
    }
    if (isGlossaryDefPath(rel) || isGlossaryDefPath(parent)) {
      await notifyGlossaryTreeChanged()
    }
    return { path: rel, name: finalName }
  }

  async function readFileContent(relPath) {
    const rel = normRel(relPath)
    if (!rel.endsWith('.md')) throw Object.assign(new Error('不是 Markdown 文件'), { status: 400 })
    const content = await fs.readFile(absOf(rel), 'utf-8')
    return { path: rel, name: baseName(rel), content }
  }

  async function writeFileContent(relPath, content) {
    const rel = normRel(relPath)
    if (!rel.endsWith('.md')) throw Object.assign(new Error('不是 Markdown 文件'), { status: 400 })
    await fs.writeFile(absOf(rel), content, 'utf-8')
    return { ok: true, savedAt: new Date().toISOString() }
  }

  async function remapGlossaryPaths(remapFn) {
    try {
      await glossary.remapIndexPaths?.(remapFn)
      const data = await glossary.readGlossary()
      let changed = false
      const terms = { ...(data.terms || {}) }
      for (const [key, term] of Object.entries(terms)) {
        const sp = String(term?.sourcePath || '')
        if (!sp) continue
        const next = remapFn(sp)
        if (next != null && next !== sp) {
          terms[key] = { ...term, sourcePath: next }
          changed = true
        }
      }
      if (changed) await glossary.writeGlossary({ terms })
    } catch (err) {
      console.warn('[fsTree] remap glossary sourcePath failed:', err)
    }
  }

  function remapPrefix(oldPath, newPath) {
    const oldP = normRel(oldPath)
    const newP = normRel(newPath)
    return (sp) => {
      const s = normRel(sp)
      if (s === oldP) return newP
      if (s.startsWith(oldP + '/')) return newP + s.slice(oldP.length)
      return null
    }
  }

  async function renameEntry(relPath, newName) {
    const rel = normRel(relPath)
    if (isGlossarySystemFolder(rel)) {
      throw Object.assign(new Error('系统文件夹「词条」不可重命名'), {
        status: 403,
      })
    }
    const parent = parentRel(rel)
    const oldBase = baseName(rel)
    const isFile = oldBase.endsWith('.md')
    const desired = isFile ? ensureMd(newName) : String(newName || '').trim()
    if (desired === oldBase) return { path: rel, name: oldBase }

    const finalName = await uniqueChildName(parent, desired.replace(/\.md$/i, ''), isFile ? 'file' : 'folder')
    // uniqueChildName always finds free name; if desired free it returns desired
    // but we passed stem without forcing conflict with self — unique checks access; self exists so would get (1)
    // Fix: if only conflict is self, allow
    let targetName = isFile ? ensureMd(newName) : String(newName || '').trim()
    if (isFile) {
      const b = targetName.replace(/\.md$/i, '')
      if (!isSafeName(b)) throw new Error('名称不合法')
    } else if (!isSafeName(targetName)) {
      throw new Error('名称不合法')
    }
    const targetRel = joinRel(parent, targetName)
    if (targetRel !== rel && (await existsRel(targetRel))) {
      targetName = await uniqueChildName(parent, targetName.replace(/\.md$/i, ''), isFile ? 'file' : 'folder')
    }
    const nextRel = joinRel(parent, targetName)
    if (nextRel === rel) return { path: rel, name: oldBase }

    await fs.rename(absOf(rel), absOf(nextRel))

    const orderMap = await readOrderMap()
    const list = orderMap[parent] || []
    orderMap[parent] = list.map((n) => (n === oldBase ? targetName : n))
    if (!isFile) {
      // rewrite order keys under this folder
      const keys = Object.keys(orderMap)
      for (const k of keys) {
        if (k === rel) {
          orderMap[nextRel] = orderMap[k]
          delete orderMap[k]
        } else if (k.startsWith(rel + '/')) {
          orderMap[nextRel + k.slice(rel.length)] = orderMap[k]
          delete orderMap[k]
        }
      }
    }
    await writeOrderMap(orderMap)
    await remapGlossaryPaths(remapPrefix(rel, nextRel))
    if (
      isGlossaryDefPath(rel) ||
      isGlossaryDefPath(nextRel) ||
      isGlossaryDefPath(parent)
    ) {
      await notifyGlossaryTreeChanged()
    }
    return { path: nextRel, name: targetName }
  }

  async function deleteEntry(relPath) {
    const rel = normRel(relPath)
    if (!rel) throw Object.assign(new Error('不能删除根'), { status: 400 })
    if (isGlossarySystemFolder(rel)) {
      throw Object.assign(new Error('系统文件夹「词条」不可删除'), {
        status: 403,
      })
    }
    const abs = absOf(rel)
    const st = await fs.stat(abs)
    await fs.rm(abs, { recursive: true, force: true })
    const parent = parentRel(rel)
    const base = baseName(rel)
    const orderMap = await readOrderMap()
    orderMap[parent] = (orderMap[parent] || []).filter((n) => n !== base)
    for (const k of Object.keys(orderMap)) {
      if (k === rel || k.startsWith(rel + '/')) delete orderMap[k]
    }
    await writeOrderMap(orderMap)
    await remapGlossaryPaths((sp) => {
      const s = normRel(sp)
      if (s === rel || s.startsWith(rel + '/')) return ''
      return null
    })
    if (isGlossaryDefPath(rel) || isGlossaryDefPath(parent)) {
      await notifyGlossaryTreeChanged()
    }
    return { ok: true, wasDirectory: st.isDirectory() }
  }

  function isDescendant(ancestor, maybeChild) {
    const a = normRel(ancestor)
    const c = normRel(maybeChild)
    if (!a) return true // everything is under root
    return c === a || c.startsWith(a + '/')
  }

  /**
   * @param {string} fromPath
   * @param {string} toParentPath
   * @param {number} toIndex -1 = append
   */
  async function moveEntry(fromPath, toParentPath, toIndex = -1) {
    const from = normRel(fromPath)
    const toParent = normRel(toParentPath)
    if (!from) throw Object.assign(new Error('不能移动根'), { status: 400 })
    if (isGlossarySystemFolder(from)) {
      throw Object.assign(new Error('系统文件夹「词条」不可移动或调序'), {
        status: 403,
      })
    }
    if (!(await existsRel(from))) {
      throw Object.assign(new Error('源不存在'), { status: 404 })
    }
    if (toParent && !(await existsRel(toParent))) {
      throw Object.assign(new Error('目标文件夹不存在'), { status: 404 })
    }

    const fromBase = baseName(from)
    const isFile = fromBase.endsWith('.md')
    const fromParent = parentRel(from)

    // cycle: moving folder into itself or descendant
    if (!isFile && isDescendant(from, toParent)) {
      throw Object.assign(new Error('不能将文件夹移动到自身或其子文件夹内'), {
        status: 400,
      })
    }

    let destName = fromBase
    let destRel = joinRel(toParent, destName)
    if (destRel !== from && (await existsRel(destRel))) {
      destName = await uniqueChildName(
        toParent,
        isFile ? fromBase.replace(/\.md$/i, '') : fromBase,
        isFile ? 'file' : 'folder',
      )
      destRel = joinRel(toParent, destName)
    }

    if (destRel !== from) {
      await fs.rename(absOf(from), absOf(destRel))
    }

    const orderMap = await readOrderMap()
    const oldSiblingList = [...(orderMap[fromParent] || [])]
    const oldIdx = oldSiblingList.indexOf(fromBase)

    // remove from old parent
    orderMap[fromParent] = oldSiblingList.filter((n) => n !== fromBase)
    // rewrite nested order keys if folder moved/renamed
    if (!isFile && from !== destRel) {
      for (const k of Object.keys(orderMap)) {
        if (k === from) {
          orderMap[destRel] = orderMap[k]
          delete orderMap[k]
        } else if (k.startsWith(from + '/')) {
          orderMap[destRel + k.slice(from.length)] = orderMap[k]
          delete orderMap[k]
        }
      }
    }

    // 同步磁盘上的新/旧目录成员，但插入位置以客户端「含源项」下标为准
    await syncDirOrder(fromParent, orderMap)
    if (toParent !== fromParent) {
      await syncDirOrder(toParent, orderMap)
    }

    // 两侧都去掉将要插入的名字，再按校正后的下标插入
    orderMap[fromParent] = (orderMap[fromParent] || []).filter(
      (n) => n !== fromBase && n !== destName,
    )
    let list = [...(orderMap[toParent] || [])].filter(
      (n) => n !== fromBase && n !== destName,
    )

    let idx
    if (toIndex == null || Number.isNaN(Number(toIndex)) || Number(toIndex) < 0) {
      idx = list.length
    } else {
      idx = Number(toIndex)
      // 同级：客户端 index 相对「含源项的原列表」；源项已移除时，落在源项后方的下标要 -1
      if (fromParent === toParent && oldIdx >= 0 && idx > oldIdx) {
        idx -= 1
      }
      if (idx < 0) idx = 0
      if (idx > list.length) idx = list.length
    }

    list.splice(idx, 0, destName)
    orderMap[toParent] = list
    // 根级系统文件夹始终置顶
    if (toParent === '' || fromParent === '') {
      const rootList = orderMap[''] || []
      if (
        rootList.includes(GLOSSARY_ROOT_FOLDER) &&
        rootList[0] !== GLOSSARY_ROOT_FOLDER
      ) {
        orderMap[''] = [
          GLOSSARY_ROOT_FOLDER,
          ...rootList.filter((n) => n !== GLOSSARY_ROOT_FOLDER),
        ]
      }
    }
    await writeOrderMap(orderMap)

    if (from !== destRel) {
      await remapGlossaryPaths(remapPrefix(from, destRel))
    }
    if (
      isGlossaryDefPath(from) ||
      isGlossaryDefPath(destRel) ||
      isGlossaryDefPath(fromParent) ||
      isGlossaryDefPath(toParent)
    ) {
      await notifyGlossaryTreeChanged()
    }

    return { path: destRel, name: destName, parentPath: toParent }
  }

  /** 递归收集所有 md 相对路径 */
  async function listAllMarkdownPaths() {
    const { tree } = await buildTree()
    const out = []
    function walk(nodes) {
      for (const n of nodes) {
        if (n.type === 'file') out.push(n.path)
        else walk(n.children || [])
      }
    }
    walk(tree)
    return out
  }

  /**
   * 「词条」下全部 md 的下标 key（与侧栏顺序一致）。
   * 例：词条/世界观/历史事件.md → 0_0
   */
  async function listGlossaryMdEntries() {
    await ensureRoot()
    const orderMap = await readOrderMap()
    /** @type {Array<{ key: string, path: string }>} */
    const out = []

    async function walk(relDir, prefixIndices) {
      const key = normRel(relDir)
      const names = await syncDirOrder(key, orderMap)
      const { folders, files } = await listRawChildren(key)
      const folderSet = new Set(folders)
      const fileSet = new Set(files)
      let i = 0
      for (const name of names) {
        if (folderSet.has(name)) {
          await walk(joinRel(key, name), [...prefixIndices, i])
          i += 1
          continue
        }
        if (fileSet.has(name)) {
          out.push({
            key: [...prefixIndices, i].join('_'),
            path: joinRel(key, name),
          })
          i += 1
        }
      }
    }

    if (await existsRel(GLOSSARY_ROOT_FOLDER)) {
      await walk(GLOSSARY_ROOT_FOLDER, [])
    }
    await writeOrderMap(orderMap)
    return out
  }

  return {
    normRel,
    joinRel,
    parentRel,
    baseName,
    absOf,
    buildTree,
    createFolder,
    createFile,
    readFileContent,
    writeFileContent,
    renameEntry,
    deleteEntry,
    moveEntry,
    listAllMarkdownPaths,
    listGlossaryMdEntries,
    uniqueChildName,
    ensureGlossarySystem,
    isGlossaryDefPath,
    isGlossarySystemFolder,
    GLOSSARY_ROOT_FOLDER,
    GLOSSARY_DEFAULT_FILE,
  }
}
