/**
 * 浮层位置（保持简单）：
 * 1) 没有「有效首扇」时：来源右侧平行（同 top，不下移）
 * 2) 有有效首扇时：相对首扇左上角向右下错开
 * 3) 首扇被拖动后：取消首扇资格，下一扇再按 1) 开
 */
export type CascadeAnchor = {
  left: number
  right: number
  top: number
  bottom: number
}

export const CASCADE_GAP = 8
export const CASCADE_DOWN = 28
const PAD = 8
const MOVED_EPS = 8

type Entry = {
  id: string
  getRect: () => DOMRect | null
}

const entries: Entry[] = []

/** 有效首扇；拖动后置 null */
let leader: {
  id: string
  originLeft: number
  originTop: number
  getRect: () => DOMRect | null
} | null = null

/** 相对首扇已开出的后续序号（1 = 第二扇） */
let cascadeSeq = 0

/** 最近一次 allocate 的结果，register 时挂到首扇 */
let lastAllocated: { left: number; top: number } | null = null

function asAnchor(
  rect: CascadeAnchor | DOMRect | null | undefined,
): CascadeAnchor | null {
  if (!rect) return null
  const left = Number(rect.left)
  const right = Number(rect.right)
  const top = Number(rect.top)
  const bottom = Number(rect.bottom)
  if (![left, right, top, bottom].every((n) => Number.isFinite(n))) return null
  return { left, right, top, bottom }
}

function clampLeft(left: number, width: number): number {
  const maxX = Math.max(PAD, window.innerWidth - width - PAD)
  return Math.min(maxX, Math.max(PAD, Math.round(left)))
}

function clampTop(top: number): number {
  const maxY = Math.max(PAD, window.innerHeight - PAD - 40)
  return Math.min(maxY, Math.max(PAD, Math.round(top)))
}

/** 右侧平行：top 与来源一致，不加任何下移 */
export function placeParallel(
  source: CascadeAnchor,
  width: number,
  _height?: number,
): { left: number; top: number } {
  let left = source.right + CASCADE_GAP
  if (left + width > window.innerWidth - PAD) {
    left = source.left - width - CASCADE_GAP
  }
  return {
    left: clampLeft(left, width),
    top: clampTop(source.top),
  }
}

/** 相对首扇右下错开（第 n 扇，n>=1） */
function placeDownRightFrom(
  first: { left: number; top: number },
  width: number,
  n: number,
): { left: number; top: number } {
  const step = Math.max(1, n)
  return {
    left: clampLeft(first.left + step * CASCADE_DOWN, width),
    top: clampTop(first.top + step * CASCADE_DOWN),
  }
}

/** 若首扇已拖离原点，取消首扇资格 */
function invalidateLeaderIfMoved(): void {
  if (!leader) return
  const rect = asAnchor(leader.getRect())
  if (!rect) {
    leader = null
    cascadeSeq = 0
    return
  }
  const moved =
    Math.abs(rect.left - leader.originLeft) > MOVED_EPS ||
    Math.abs(rect.top - leader.originTop) > MOVED_EPS
  if (moved) {
    leader = null
    cascadeSeq = 0
  }
}

/**
 * 分配位置。
 * @returns 坐标；调用方挂载后 registerCascadeFloat
 */
export function allocateCascadePlace(opts: {
  width: number
  height: number
  besideRect?: CascadeAnchor | null
  anchorRect?: CascadeAnchor | null
}): { left: number; top: number } {
  const width = Math.max(1, Math.round(opts.width))
  const source =
    asAnchor(opts.besideRect) || asAnchor(opts.anchorRect)

  invalidateLeaderIfMoved()

  let place: { left: number; top: number }

  if (!leader) {
    // 首次（或原首扇已拖走）：来源右侧平行
    cascadeSeq = 0
    if (source) {
      place = placeParallel(source, width)
    } else {
      place = {
        left: clampLeft(window.innerWidth - width - 24, width),
        top: clampTop(Math.round(window.innerHeight / 4)),
      }
    }
  } else {
    // 后续：相对首扇右下
    cascadeSeq += 1
    const firstRect = asAnchor(leader.getRect()) || {
      left: leader.originLeft,
      top: leader.originTop,
      right: leader.originLeft,
      bottom: leader.originTop,
    }
    place = placeDownRightFrom(firstRect, width, cascadeSeq)
  }

  lastAllocated = { ...place }
  return place
}

export function registerCascadeFloat(
  id: string,
  getRect: () => DOMRect | null,
): void {
  const key = String(id || '').trim()
  if (!key) return
  unregisterCascadeFloat(key)
  entries.push({ id: key, getRect })

  // 当前没有有效首扇 → 本扇成为首扇（原点用 allocate 算出的平行位）
  if (!leader && lastAllocated) {
    leader = {
      id: key,
      originLeft: lastAllocated.left,
      originTop: lastAllocated.top,
      getRect,
    }
    cascadeSeq = 0
  }
  lastAllocated = null
}

export function unregisterCascadeFloat(id: string): void {
  const key = String(id || '').trim()
  if (!key) return
  const index = entries.findIndex((e) => e.id === key)
  if (index >= 0) entries.splice(index, 1)

  if (leader?.id === key) {
    leader = null
    cascadeSeq = 0
  }
  if (!entries.length) {
    leader = null
    cascadeSeq = 0
    lastAllocated = null
  }
}

export function cascadeFloatCount(): number {
  return entries.length
}

/** @deprecated 兼容旧调用；改为由 register 写入 leader */
export function syncFirstInitialFromRect(
  rect: { left: number; top: number } | null | undefined,
): void {
  if (!rect || !leader) return
  leader.originLeft = Math.round(rect.left)
  leader.originTop = Math.round(rect.top)
}
