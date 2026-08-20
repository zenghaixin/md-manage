import { REMARKS_META_END, REMARKS_META_START } from './constants'

const META_RE = new RegExp(
  `\\n?${escapeRegExp(REMARKS_META_START)}\\s*([\\s\\S]*?)${escapeRegExp(REMARKS_META_END)}\\s*$`,
)

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createRemarkId(): string {
  return `r_${Math.random().toString(36).slice(2, 10)}`
}

/** 从落库 Markdown 剥掉描述块，并解析描述表 */
export function extractRemarksMeta(markdown: string): {
  body: string
  descriptions: Record<string, string>
} {
  const text = String(markdown || '').replace(/\r\n/g, '\n')
  const m = META_RE.exec(text)
  if (!m) return { body: String(markdown || ''), descriptions: {} }
  const body = text.slice(0, m.index).replace(/\s+$/, '')
  let descriptions: Record<string, string> = {}
  try {
    const raw = String(m[1] || '').trim()
    const parsed = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      descriptions = Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [
          String(k),
          String(v ?? ''),
        ]),
      )
    }
  } catch {
    descriptions = {}
  }
  return { body, descriptions }
}

/** 把描述表写回文件末尾隐藏块 */
export function injectRemarksMeta(
  body: string,
  descriptions: Record<string, string>,
): string {
  const base = String(body || '').replace(/\s+$/, '')
  const cleaned = Object.fromEntries(
    Object.entries(descriptions || {})
      .map(([k, v]) => [String(k).trim(), String(v ?? '')])
      .filter(([k]) => k),
  )
  if (!Object.keys(cleaned).length) return base
  const json = JSON.stringify(cleaned, null, 0)
  return `${base}\n\n${REMARKS_META_START}\n${json}\n${REMARKS_META_END}\n`
}

/** 匹配 remark(id)[content]，content 不含未转义 ] */
export const REMARK_INLINE_RE = /remark\(([^)]+)\)\[([^\]]*)\]/g

export function formatRemark(id: string, text: string): string {
  const safeId = String(id || '').trim() || createRemarkId()
  const safeText = String(text || '').replace(/\]/g, '］')
  return `remark(${safeId})[${safeText}]`
}
