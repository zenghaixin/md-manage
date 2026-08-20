/**
 * 跨文件备注描述读写（不依赖词条模块）。
 */
import { api } from '../../../api'
import { requestReloadFilePath } from '../../shellEvents'
import {
  extractRemarksMeta,
  injectRemarksMeta,
} from './syntax'
import {
  getCurrentRemarkPath,
  loadRemarksFromMarkdown,
} from './storage'

function normPath(p: string): string {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
}

/** 把单条备注描述写进指定文件末尾 meta */
export async function saveRemarkDescriptionToPath(
  sourcePath: string,
  remarkId: string,
  text: string,
): Promise<void> {
  const path = normPath(sourcePath)
  const id = String(remarkId || '').trim()
  if (!path || !id) return

  const { content } = await api.getFileByPath(path)
  const { body, descriptions } = extractRemarksMeta(content)
  const nextMap = {
    ...descriptions,
    [id]: String(text ?? ''),
  }
  const nextMd = injectRemarksMeta(body, nextMap)
  await api.saveFileByPath(path, nextMd)

  if (normPath(getCurrentRemarkPath()) === path) {
    loadRemarksFromMarkdown(path, nextMd)
    requestReloadFilePath(path)
  }
}
