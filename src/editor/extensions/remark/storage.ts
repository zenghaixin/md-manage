/**
 * 当前打开文件的备注描述（内存）；与落盘末尾隐藏块同步。
 */
import { extractRemarksMeta, injectRemarksMeta } from './syntax'

let currentPath = ''
/** id → description（可含 --- 分隔的多段） */
let descriptions: Record<string, string> = {}
const listeners = new Set<() => void>()

export function getRemarkDescriptions(): Record<string, string> {
  return { ...descriptions }
}

export function getRemarkDescription(id: string): string {
  return descriptions[String(id || '').trim()] || ''
}

export function setRemarkDescription(id: string, text: string) {
  const key = String(id || '').trim()
  if (!key) return
  descriptions = { ...descriptions, [key]: String(text ?? '') }
  notify()
}

export function removeRemarkDescription(id: string) {
  const key = String(id || '').trim()
  if (!key || !(key in descriptions)) return
  const next = { ...descriptions }
  delete next[key]
  descriptions = next
  notify()
}

export function mergeRemarkDescriptions(ids: string[], newId: string) {
  const parts = ids
    .map((id) => String(descriptions[id] || '').trim())
    .filter(Boolean)
  const next = { ...descriptions }
  for (const id of ids) delete next[id]
  next[newId] = parts.join('\n\n---\n\n')
  descriptions = next
  notify()
}

export function loadRemarksFromMarkdown(path: string, markdown: string): string {
  currentPath = String(path || '').trim()
  const { body, descriptions: map } = extractRemarksMeta(markdown)
  descriptions = map
  notify()
  return body
}

export function saveRemarksIntoMarkdown(markdown: string): string {
  // 只保留正文中仍存在的 id（由调用方传入 prune 更好）；此处写入当前表
  return injectRemarksMeta(markdown, descriptions)
}

/** 按正文仍存活的 id 裁剪描述表 */
export function pruneRemarkDescriptions(liveIds: Iterable<string>) {
  const live = new Set(
    Array.from(liveIds)
      .map((x) => String(x || '').trim())
      .filter(Boolean),
  )
  let changed = false
  const next: Record<string, string> = {}
  for (const [id, text] of Object.entries(descriptions)) {
    if (live.has(id)) next[id] = text
    else changed = true
  }
  if (changed) {
    descriptions = next
    notify()
  }
}

export function getCurrentRemarkPath() {
  return currentPath
}

export function onRemarkDescriptionsChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  for (const fn of Array.from(listeners)) {
    try {
      fn()
    } catch (err) {
      console.warn('[remark] listener failed:', err)
    }
  }
}
