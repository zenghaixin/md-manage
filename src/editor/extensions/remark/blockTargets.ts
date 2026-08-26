/**
 * 整块备注目标：这些节点备注时挂 attrs，落库由各节点自己序列化（如 `{remark:id}`）。
 */
import type { Node as PMNode } from '@tiptap/pm/model'

export type BlockRemarkTarget = {
  /** TipTap 节点名 */
  nodeName: string
  /** 存放备注 id 的 attr */
  attr: string
}

/** 配置：哪些模块整块备注（后续可 register） */
const BLOCK_REMARK_TARGETS: BlockRemarkTarget[] = [
  { nodeName: 'termGlossary', attr: 'remarkId' },
]

const byName = new Map(
  BLOCK_REMARK_TARGETS.map((t) => [t.nodeName, t] as const),
)

export function listBlockRemarkTargets(): readonly BlockRemarkTarget[] {
  return BLOCK_REMARK_TARGETS
}

export function getBlockRemarkTarget(
  nodeName: string,
): BlockRemarkTarget | null {
  return byName.get(nodeName) ?? null
}

/** 从 `{remark:r_xxx …}` 花括号内容解析 remark id */
export function parseRemarkIdFromBraceInner(inner: string): string {
  const m = /\bremark\s*:\s*([A-Za-z0-9_-]+)/i.exec(String(inner || ''))
  return m?.[1]?.trim() || ''
}

/** 开场行后缀：` {remark:id}`；无 id 则空串 */
export function formatRemarkBraceSuffix(remarkId: string): string {
  const id = String(remarkId || '').trim()
  return id ? ` {remark:${id}}` : ''
}

export function getNodeBlockRemarkId(node: PMNode): string {
  const t = getBlockRemarkTarget(node.type.name)
  if (!t) return ''
  return String(node.attrs?.[t.attr] ?? '').trim()
}

/**
 * 选区是否正好是某个整块备注目标（如 NodeSelection 词条）。
 * 定义块：点选整块词条后点右上角「备注」（不再走选区气泡）。
 */
export function findBlockRemarkTargetAt(
  doc: PMNode,
  from: number,
  to: number,
): { pos: number; node: PMNode; attr: string } | null {
  if (to <= from) return null
  const node = doc.nodeAt(from)
  if (!node) return null
  const target = getBlockRemarkTarget(node.type.name)
  if (!target) return null
  if (to !== from + node.nodeSize) return null
  return { pos: from, node, attr: target.attr }
}

/** 收集文档中所有整块备注 id */
export function collectBlockRemarkIds(doc: PMNode): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  doc.descendants((node) => {
    const id = getNodeBlockRemarkId(node)
    if (!id || seen.has(id)) return
    seen.add(id)
    ids.push(id)
  })
  return ids
}
