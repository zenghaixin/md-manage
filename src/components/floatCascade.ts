/**
 * 关联浮层布局：
 * - 点根节点、且还没有窗 / 第一个已拖走 → 根节点右侧平行
 * - 点根节点、且第一个仍在原位 → 相对第一个右下打开
 * - 点某个弹窗内按钮 → 该弹窗右侧平行（与根是否关联无关）
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
/** 超过此偏移视为「第一个已拖动」 */
const MOVED_EPS = 8

type Entry = {
  id: string
  getRect: () => DOMRect | null
}

const entries: Entry[] = []
/** 第一个浮层刚打开时的位置 */
let firstInitial: { left: number; top: number } | null = null
/** allocate 时记下的首窗位置，register 时写入 firstInitial */
let pendingFirstPlace: { left: number; top: number } | null = null

function clamp(
  left: number,
  top: number,
  width: number,
  height: number,
): { left: number; top: number } {
  const maxX = Math.max(PAD, window.innerWidth - width - PAD)
  const maxY = Math.max(PAD, window.innerHeight - Math.min(height, 120) - PAD)
  return {
    left: Math.min(maxX, Math.max(PAD, Math.round(left))),
    top: Math.min(maxY, Math.max(PAD, Math.round(top))),
  }
}

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

/** 相对来源右侧平行；右侧不够则左侧平行 */
export function placeParallel(
  source: CascadeAnchor,
  width: number,
  height: number,
): { left: number; top: number } {
  const rightLeft = source.right + CASCADE_GAP
  if (rightLeft + width <= window.innerWidth - PAD) {
    return clamp(rightLeft, source.top, width, height)
  }
  return clamp(source.left - width - CASCADE_GAP, source.top, width, height)
}

/** 相对第一窗右下；右侧摆不下则叠在其右下角错位 */
function placeRightBottomOfFirst(
  first: CascadeAnchor,
  width: number,
  height: number,
  index: number,
): { left: number; top: number } {
  // index: 1 = 第二扇，2 = 第三扇…
  const step = Math.max(1, index)
  const rightLeft = first.right + CASCADE_GAP
  const topDown = first.top + CASCADE_DOWN
  if (rightLeft + width <= window.innerWidth - PAD) {
    return clamp(
      rightLeft + (step - 1) * CASCADE_DOWN,
      topDown + (step - 1) * CASCADE_DOWN,
      width,
      height,
    )
  }
  return clamp(
    first.left + step * CASCADE_DOWN,
    first.top + step * CASCADE_DOWN,
    width,
    height,
  )
}

function isFirstUnmoved(): boolean {
  if (!entries.length || !firstInitial) return false
  const rect = asAnchor(entries[0]?.getRect?.())
  if (!rect) return false
  return (
    Math.abs(rect.left - firstInitial.left) <= MOVED_EPS &&
    Math.abs(rect.top - firstInitial.top) <= MOVED_EPS
  )
}

/**
 * 为即将打开的浮层分配位置。
 */
export function allocateCascadePlace(opts: {
  width: number
  height: number
  besideRect?: CascadeAnchor | null
  anchorRect?: CascadeAnchor | null
}): { left: number; top: number } {
  const width = Math.max(1, Math.round(opts.width))
  const height = Math.max(1, Math.round(opts.height))

  // 弹窗内按钮
  const beside = asAnchor(opts.besideRect)
  if (beside) {
    // 第一窗未拖动 → 后续仍相对第一窗右下
    if (isFirstUnmoved()) {
      const first = asAnchor(entries[0]?.getRect?.())
      if (first) {
        pendingFirstPlace = null
        return placeRightBottomOfFirst(
          first,
          width,
          height,
          entries.length,
        )
      }
    }
    // 第一窗已拖走：跟当前点击的这扇窗平行
    pendingFirstPlace = null
    return placeParallel(beside, width, height)
  }

  const anchor = asAnchor(opts.anchorRect)
  if (anchor) {
    // 第一个还在原位 → 后续相对第一个右下
    if (isFirstUnmoved()) {
      const first = asAnchor(entries[0]?.getRect?.())
      if (first) {
        pendingFirstPlace = null
        return placeRightBottomOfFirst(
          first,
          width,
          height,
          entries.length,
        )
      }
    }
    // 无首窗，或首窗已拖走 → 根节点右侧平行
    const place = placeParallel(anchor, width, height)
    if (entries.length === 0) {
      pendingFirstPlace = { left: place.left, top: place.top }
    } else {
      pendingFirstPlace = null
    }
    return place
  }

  pendingFirstPlace = null
  return clamp(
    window.innerWidth - width - 24,
    Math.max(PAD, Math.round(window.innerHeight / 4)),
    width,
    height,
  )
}

export function registerCascadeFloat(
  id: string,
  getRect: () => DOMRect | null,
): void {
  const key = String(id || '').trim()
  if (!key) return
  unregisterCascadeFloat(key)
  entries.push({ id: key, getRect })
  if (entries.length === 1) {
    if (pendingFirstPlace) {
      firstInitial = { ...pendingFirstPlace }
      pendingFirstPlace = null
    } else {
      const rect = asAnchor(getRect())
      firstInitial = rect
        ? { left: rect.left, top: rect.top }
        : null
    }
  }
}

export function unregisterCascadeFloat(id: string): void {
  const key = String(id || '').trim()
  if (!key) return
  const index = entries.findIndex((e) => e.id === key)
  if (index < 0) return
  entries.splice(index, 1)
  if (!entries.length) {
    firstInitial = null
    pendingFirstPlace = null
    return
  }
  // 原第一窗关了：以新的第一窗当前位置为「初始」，之后拖动才算脱钩
  if (index === 0) {
    const rect = asAnchor(entries[0]?.getRect?.())
    firstInitial = rect ? { left: rect.left, top: rect.top } : null
  }
}

export function cascadeFloatCount(): number {
  return entries.length
}
