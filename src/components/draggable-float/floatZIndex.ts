/**
 * 浮层共用 z-index：打开 / 点击时抬到最上层。
 * 预览 / 编辑 / 备注共用这一套计数。
 */
let z = 11000

export function nextFloatZIndex(): number {
  z += 1
  return z
}

export function peekFloatZIndex(): number {
  return z
}
