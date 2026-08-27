/**
 * 词条引用槽位：refSources 为 source 文件 uuid 数组，refs 为 uuid → 选中标题[]。
 */
import { api } from '../../../../../api'
import {
  parseTermMarkdown,
  sanitizeTermTitle,
} from '../model/syntax'
import { GLOSSARY_ROOT_FOLDER, isGlossaryDefPath, normalizeDocPath } from './glossaryPaths'

export type GlossaryIndexEntry = {
  id: string
  order: string
  path: string
  fileName: string
}

export type GlossaryIndexFile = {
  version: number
  entries: GlossaryIndexEntry[]
}

export type TermRefSlotDef = {
  /** source 文件 uuid */
  id: string
  /** 展示名（index.fileName） */
  name: string
  /** 来源 md path；缺失时表示来源已删除 */
  path: string
  deleted: boolean
}

export type TermRefs = Record<string, string[]>
export type TermRefSources = string[]

const LEGACY_REF_SLOT_PATHS: Record<string, string> = {
  weapons: '词条/物品/武器.md',
  events: '词条/世界观/历史事件.md',
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

export function buildIndexMaps(entries: GlossaryIndexEntry[]) {
  const byId = new Map<string, GlossaryIndexEntry>()
  const idByPath = new Map<string, string>()
  for (const e of entries || []) {
    byId.set(e.id, e)
    idByPath.set(normalizeDocPath(e.path), e.id)
  }
  return { byId, idByPath }
}

export function normalizeTermRefs(
  raw: unknown,
  refSourceIds: TermRefSources = [],
): TermRefs {
  const out: TermRefs = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
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

export function normalizeRefSources(
  raw: unknown,
  indexEntries: GlossaryIndexEntry[] = [],
): TermRefSources {
  const { idByPath } = buildIndexMaps(indexEntries)
  const seen = new Set<string>()
  const out: string[] = []

  const pushId = (id: string) => {
    const sid = String(id || '').trim()
    if (!sid || seen.has(sid)) return
    seen.add(sid)
    out.push(sid)
  }

  const pathToId = (path: string) => idByPath.get(normalizeDocPath(path)) || ''

  const keyToId = (key: string, val: unknown) => {
    const k = String(key || '').trim()
    if (!k) return ''
    if (isUuidLike(k)) return k
    if (LEGACY_REF_SLOT_PATHS[k]) return pathToId(LEGACY_REF_SLOT_PATHS[k])
    const asPath = String(val ?? '').trim()
    if (asPath.includes('/') && asPath.endsWith('.md')) return pathToId(asPath)
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
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      pushId(keyToId(key, val))
    }
  }
  return out
}

export function resolveRefSlots(
  refSourceIds: TermRefSources,
  indexEntries: GlossaryIndexEntry[],
): TermRefSlotDef[] {
  const { byId } = buildIndexMaps(indexEntries)
  return (refSourceIds || []).map((id) => {
    const entry = byId.get(id)
    if (entry) {
      return {
        id,
        name: entry.fileName || entry.path.split('/').pop()?.replace(/\.md$/i, '') || id,
        path: normalizeDocPath(entry.path),
        deleted: false,
      }
    }
    return {
      id,
      name: '来源已删除',
      path: '',
      deleted: true,
    }
  })
}

export function resolveSourceIdByPath(
  path: string,
  indexEntries: GlossaryIndexEntry[],
): string {
  const want = normalizeDocPath(path)
  const found = (indexEntries || []).find(
    (e) => normalizeDocPath(e.path) === want,
  )
  return found?.id || ''
}

/** 从词库筛出某 md 下全部词条标题（兜底） */
export function listTermTitlesFromSource(
  sourcePath: string,
  terms: Record<string, { title?: string; sourcePath?: string }>,
): string[] {
  const want = normalizeDocPath(sourcePath)
  if (!want) return []
  const titles: string[] = []
  const seen = new Set<string>()
  for (const term of Object.values(terms)) {
    const title = String(term?.title ?? '').trim()
    if (!title || seen.has(title)) continue
    if (normalizeDocPath(term?.sourcePath || '') !== want) continue
    seen.add(title)
    titles.push(title)
  }
  return titles.sort((a, b) => a.localeCompare(b, 'zh'))
}

/** 从服务端读取指定 md 下的词条标题（主路径） */
export async function fetchTermTitlesForSource(
  sourcePath: string,
  fallbackTerms?: Record<string, { title?: string; sourcePath?: string }>,
): Promise<string[]> {
  const path = normalizeDocPath(sourcePath)
  if (!path || !isGlossaryDefPath(path) || !path.endsWith('.md')) return []

  try {
    const data = await api.getGlossaryFileTerms(path)
    const fromApi = Array.isArray(data?.titles)
      ? data.titles.map((t) => String(t ?? '').trim()).filter(Boolean)
      : []
    if (fromApi.length) {
      return [...new Set(fromApi)].sort((a, b) => a.localeCompare(b, 'zh'))
    }
  } catch (err) {
    console.warn('[term-ref] fetch file-terms failed:', path, err)
  }

  const seen = new Set<string>()
  const merged: string[] = []

  const push = (title: string) => {
    const t = sanitizeTermTitle(title) || String(title ?? '').trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    merged.push(t)
  }

  try {
    const file = await api.getFileByPath(path)
    const nodes = parseTermMarkdown(String(file?.content ?? ''))
    for (const node of nodes) {
      push(String(node.attrs?.title ?? ''))
    }
  } catch (err) {
    console.warn('[term-ref] parse source file failed:', path, err)
  }

  if (fallbackTerms) {
    for (const title of listTermTitlesFromSource(path, fallbackTerms)) {
      push(title)
    }
  }

  return merged.sort((a, b) => a.localeCompare(b, 'zh'))
}

export type GlossaryTreeNode = {
  type: 'folder' | 'file'
  name: string
  path: string
  children?: GlossaryTreeNode[]
}

/** 取「词条」根下子树，供引用数据源树使用 */
export function extractGlossarySubtree(
  tree: GlossaryTreeNode[] | null | undefined,
): GlossaryTreeNode[] {
  const root = (tree || []).find(
    (n) => n.type === 'folder' && n.name === GLOSSARY_ROOT_FOLDER,
  )
  return root?.children ? [...root.children] : []
}

export async function loadGlossaryIndex(): Promise<GlossaryIndexFile> {
  try {
    const data = await api.getGlossaryIndex()
    const entries = Array.isArray(data?.entries) ? data.entries : []
    return {
      version: Number(data?.version) || 2,
      entries: entries
        .map((e) => ({
          id: String(e?.id || '').trim(),
          order: String(e?.order || e?.key || '').trim(),
          path: normalizeDocPath(String(e?.path || '')),
          fileName: String(e?.fileName || '').trim(),
        }))
        .filter((e) => e.id && e.path),
    }
  } catch (err) {
    console.warn('[term-ref] load glossary index failed:', err)
    return { version: 2, entries: [] }
  }
}
