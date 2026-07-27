/**
 * 快捷键插入词条后，由 TermNodeView mount 消费并聚焦标题。
 * 比 insert 后单次 rAF 找 DOM 更稳。
 */
let pendingTitleAutofocus = false

export function requestTermTitleAutofocus(): void {
  pendingTitleAutofocus = true
}

/** @returns 若本次应聚焦标题则为 true（只消费一次） */
export function consumeTermTitleAutofocus(): boolean {
  if (!pendingTitleAutofocus) return false
  pendingTitleAutofocus = false
  return true
}
