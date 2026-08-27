/**
 * 常用 / 最近打开的词条（localStorage，供右栏「常用词条」模块）。
 */
import { ref } from 'vue'
import { normalizeDocPath } from './glossaryPaths'

export type RecentTermEntry = {
  title: string
  sourcePath: string
  lastUsed: number
  /** 累计打开次数，用于常用排序 */
  useCount: number
}

const STORAGE_KEY = 'md-manage:term-recent'
const MAX_ENTRIES = 24

const recentTerms = ref<RecentTermEntry[]>(loadRecentTermsFromStorage())

function compareByFrequent(a: RecentTermEntry, b: RecentTermEntry) {
  const dc = b.useCount - a.useCount
  if (dc !== 0) return dc
  return b.lastUsed - a.lastUsed
}

function loadRecentTermsFromStorage(): RecentTermEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => ({
        title: String(item?.title ?? '').trim(),
        sourcePath: normalizeDocPath(String(item?.sourcePath ?? '')),
        lastUsed: Number(item?.lastUsed) || 0,
        useCount: Math.max(1, Number(item?.useCount) || 1),
      }))
      .filter((item) => item.title && item.sourcePath)
      .sort(compareByFrequent)
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

function persistRecentTerms(list: RecentTermEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore quota / private mode
  }
}

/** 响应式最近词条列表（右栏 UI 绑定） */
export function useRecentTerms() {
  return recentTerms
}

/** 打开词条定义时调用，写入最近列表 */
export function recordRecentTerm(title: string, sourcePath: string) {
  const t = String(title ?? '').trim()
  const path = normalizeDocPath(sourcePath)
  if (!t || !path) return

  const now = Date.now()
  const prev = recentTerms.value.find(
    (item) => item.title === t && item.sourcePath === path,
  )
  const useCount = (prev?.useCount ?? 0) + 1
  const rest = recentTerms.value.filter(
    (item) => !(item.title === t && item.sourcePath === path),
  )
  const next = [
    { title: t, sourcePath: path, lastUsed: now, useCount },
    ...rest,
  ]
    .sort(compareByFrequent)
    .slice(0, MAX_ENTRIES)
  recentTerms.value = next
  persistRecentTerms(next)
}

export function clearRecentTerms() {
  recentTerms.value = []
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
