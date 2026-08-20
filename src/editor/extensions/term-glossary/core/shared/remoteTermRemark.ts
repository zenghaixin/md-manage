/**
 * 跨文件词条整块备注：从定义所在 md 读/建 remarkId 与描述，写回隐藏块。
 */
import { api } from '../../../../../api'
import { requestReloadFilePath } from '../../../../shellEvents'
import {
  createRemarkId,
  extractRemarksMeta,
  injectRemarksMeta,
} from '../../../remark/syntax'
import {
  getCurrentRemarkPath,
  getRemarkDescription,
  loadRemarksFromMarkdown,
} from '../../../remark/storage'
import {
  TERM_BLOCK_RE,
  formatTermSource,
  parseTermRemarkIdFromBrace,
  peelRemarkBraceFromDescription,
  sanitizeTermTitle,
} from '../model/syntax'
import {
  ensureLiveTermRemarkId,
  lookupLiveTermRemarkId,
} from './termRemarkAccess'

function normPath(p: string): string {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
}

/**
 * 在 Markdown 中确保词条开场行带 `{remark:id}`，并保证描述表有该 id。
 */
export function ensureTermRemarkInMarkdown(
  markdown: string,
  title: string,
): {
  markdown: string
  remarkId: string
  description: string
  changed: boolean
} {
  const key = sanitizeTermTitle(title)
  if (!key) {
    return { markdown, remarkId: '', description: '', changed: false }
  }

  const { body, descriptions } = extractRemarksMeta(markdown)
  let found = false
  let remarkId = ''
  let changed = false

  const re = new RegExp(TERM_BLOCK_RE.source, 'gi')
  const nextBody = body.replace(
    re,
    (full, rawTitle: string, braceInner: string, content: string) => {
      if (sanitizeTermTitle(rawTitle) !== key) return full
      found = true
      const peeled = peelRemarkBraceFromDescription(String(content || ''))
      const fromBrace = parseTermRemarkIdFromBrace(braceInner || '')
      const prevId = fromBrace || peeled.remarkId
      remarkId = prevId || createRemarkId()
      if (!prevId) changed = true
      const displayTitle = sanitizeTermTitle(rawTitle) || String(rawTitle).trim()
      const next = formatTermSource(displayTitle, peeled.description, remarkId)
      if (next !== full) changed = true
      return next
    },
  )

  if (!found || !remarkId) {
    return { markdown, remarkId: '', description: '', changed: false }
  }

  const descs = { ...descriptions }
  if (!(remarkId in descs)) {
    descs[remarkId] = ''
    changed = true
  }
  const description = String(descs[remarkId] ?? '')
  const out = injectRemarksMeta(nextBody, descs)
  return { markdown: out, remarkId, description, changed }
}

/**
 * 按词条标题解析备注：优先当前文档；否则读 glossary.sourcePath 对应文件。
 * 定义文件尚无 remark 时会创建 id 并写回。
 */
export async function resolveTermRemarkForTitle(
  title: string,
  sourcePathHint?: string,
): Promise<{
  remarkId: string
  description: string
  /** 非空表示备注描述应落在该文件（跨页） */
  sourcePath: string
} | null> {
  const key = sanitizeTermTitle(title)
  if (!key) return null

  const liveId =
    lookupLiveTermRemarkId(key) || ensureLiveTermRemarkId(key)
  if (liveId) {
    return {
      remarkId: liveId,
      description: getRemarkDescription(liveId),
      sourcePath: '',
    }
  }

  let path = normPath(sourcePathHint || '')
  if (!path) {
    try {
      const { useGlossaryStore } = await import('../../../../../stores/glossary')
      path = normPath(useGlossaryStore().getTerm(key)?.sourcePath || '')
    } catch {
      path = ''
    }
  }
  if (!path) return null

  const { content } = await api.getFileByPath(path)
  const ensured = ensureTermRemarkInMarkdown(content, key)
  if (!ensured.remarkId) return null

  if (ensured.changed) {
    await api.saveFileByPath(path, ensured.markdown)
    if (normPath(getCurrentRemarkPath()) === path) {
      loadRemarksFromMarkdown(path, ensured.markdown)
      requestReloadFilePath(path)
    }
  }

  return {
    remarkId: ensured.remarkId,
    description: ensured.description,
    sourcePath: path,
  }
}
