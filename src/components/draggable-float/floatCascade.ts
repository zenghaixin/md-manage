/**
 * 浮层位置（保持简单）：
 * 1) 没有「有效首扇」时：
 *    - 默认：来源右侧平行（同 top）
 *    - 首扇特例：来源距**容器左缘** > FIRST_BELOW_LEFT_THRESHOLD 且右侧放不下 → 来源下方
 *      （容器为 containerRect；未传时退化为距视口左缘）
 *      · 来源左缘到视口右缘 ≥ 浮层宽：浮层左缘与来源左缘对齐
 *      · 否则：浮层右缘与来源右缘对齐
 *    - 其余仍走右侧平行；右侧不够则改左侧
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
/** 首扇改在来源下方：来源左缘距容器左缘超过该值（px）且右侧放不下时生效 */
export const FIRST_BELOW_LEFT_THRESHOLD = 500
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

function clampTop(top: number, height = 0): number {
  const h = Math.max(0, Math.round(height))
  const maxY = Math.max(PAD, window.innerHeight - PAD - (h || 40))
  return Math.min(maxY, Math.max(PAD, Math.round(top)))
}

/** 保证 top + height 完整落在视口内；空间不足时上移，必要时改到光标上方 */
function fitTopInViewport(
  top: number,
  height: number,
  source?: CascadeAnchor | null,
): number {
  const h = Math.max(1, Math.round(height))
  let y = Math.round(top)
  const maxY = Math.max(PAD, window.innerHeight - PAD - h)
  if (y <= maxY) return clampTop(y, h)
  // 优先整体上移，完整展示浮层（不严格跟随光标 top）
  y = maxY
  if (source) {
    const above = Math.round(source.top - h - CASCADE_GAP)
    if (above >= PAD && above < y) y = above
  }
  return clampTop(y, h)
}

/** 右侧平行是否放得下（不在左侧翻转的前提下） */
function parallelRightFits(source: CascadeAnchor, width: number): boolean {
  return source.right + CASCADE_GAP + width <= window.innerWidth - PAD
}

/** 来源锚点相对容器左缘的水平偏移；无容器时用视口左缘 */
function anchorOffsetFromContainerLeft(
  source: CascadeAnchor,
  container: CascadeAnchor | null | undefined,
): number {
  if (container) return source.left - container.left
  return source.left
}

/** 首扇：来源在容器内偏右且右侧平行放不下 → 改在来源下方 */
function shouldPlaceBelowFirst(
  source: CascadeAnchor,
  width: number,
  container?: CascadeAnchor | null,
): boolean {
  return (
    anchorOffsetFromContainerLeft(source, container) >
      FIRST_BELOW_LEFT_THRESHOLD && !parallelRightFits(source, width)
  )
}

/** 右侧平行：top 与来源一致；若会溢出视口则上移以保证完整展示 */
export function placeParallel(
  source: CascadeAnchor,
  width: number,
  height = 0,
): { left: number; top: number } {
  let left = source.right + CASCADE_GAP
  if (left + width > window.innerWidth - PAD) {
    left = source.left - width - CASCADE_GAP
  }
  const h = Math.max(0, Math.round(height))
  const top = h > 0
    ? fitTopInViewport(source.top, h, source)
    : clampTop(source.top, h)
  return {
    left: clampLeft(left, width),
    top,
  }
}

/**
 * 首扇：在来源下方。
 * 水平：来源左缘到视口右缘 ≥ 浮层宽 → 左对齐；否则右对齐。
 */
export function placeBelow(
  source: CascadeAnchor,
  width: number,
  height = 0,
): { left: number; top: number } {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(0, Math.round(height))
  const roomFromSourceLeft = window.innerWidth - PAD - source.left
  let left = roomFromSourceLeft >= w ? source.left : source.right - w
  left = clampLeft(left, w)

  let top = source.bottom + CASCADE_GAP
  if (h > 0 && top + h > window.innerHeight - PAD) {
    const above = source.top - h - CASCADE_GAP
    if (above >= PAD) top = above
    else top = Math.min(top, window.innerHeight - PAD - h)
  }
  top = clampTop(top, h)
  return { left, top }
}

/** 相对首扇右下错开（第 n 扇，n>=1） */
function placeDownRightFrom(
  first: { left: number; top: number },
  width: number,
  n: number,
  height = 0,
): { left: number; top: number } {
  const step = Math.max(1, n)
  const h = Math.max(0, Math.round(height))
  const rawTop = first.top + step * CASCADE_DOWN
  return {
    left: clampLeft(first.left + step * CASCADE_DOWN, width),
    top: h > 0 ? fitTopInViewport(rawTop, h) : clampTop(rawTop, h),
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
  /** 来源所在父容器（用于「距左 500px」等相对容器的首扇规则） */
  containerRect?: CascadeAnchor | null
}): { left: number; top: number } {
  const width = Math.max(1, Math.round(opts.width))
  const height = Math.max(1, Math.round(opts.height))
  const source =
    asAnchor(opts.besideRect) || asAnchor(opts.anchorRect)
  const container = asAnchor(opts.containerRect)

  invalidateLeaderIfMoved()

  let place: { left: number; top: number }

  if (!leader) {
    cascadeSeq = 0
    if (source) {
      place = shouldPlaceBelowFirst(source, width, container)
        ? placeBelow(source, width, height)
        : placeParallel(source, width, height)
    } else {
      place = {
        left: clampLeft(window.innerWidth - width - 24, width),
        top: fitTopInViewport(Math.round(window.innerHeight / 4), height),
      }
    }
  } else {
    cascadeSeq += 1
    const firstRect = asAnchor(leader.getRect()) || {
      left: leader.originLeft,
      top: leader.originTop,
      right: leader.originLeft,
      bottom: leader.originTop,
    }
    place = placeDownRightFrom(firstRect, width, cascadeSeq, height)
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
