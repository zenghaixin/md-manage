/**
 * 改名冲突审查抽屉：批量确认词条 / 不是词条（自动短上下文或选字）。
 */
import { api } from '../../../api'
import { useGlossaryStore } from '../../../stores/glossary'
import { requestOpenFilePath, requestReloadFilePath } from '../../../editor/shellEvents'
import {
  alertInfo,
  confirmAction,
  toast,
} from '../../../composables/useDialog'
import {
  clearAutoConfirmSuppress,
  demoteTermToCandidate,
  suppressAutoConfirmForTitle,
} from './match'
import { ensureTermGlossaryStyles } from './styles'
import { buildShortIgnoreContext } from './segmenter'

export interface ConflictItem {
  id: string
  sourcePath: string
  kind: string
  hit: string
  context: string
  from: number
  to: number
}

type DrawerMode = 'list' | 'pick'

class ConflictDrawer {
  private el: HTMLDivElement | null = null
  private listEl: HTMLDivElement | null = null
  private items: ConflictItem[] = []
  private selected = new Set<string>()
  private newTitle = ''
  private mode: DrawerMode = 'list'
  private pickItem: ConflictItem | null = null
  private pickRange: { start: number; end: number } | null = null

  open(newTitle: string, conflicts: ConflictItem[]) {
    ensureTermGlossaryStyles()
    this.newTitle = newTitle
    this.items = conflicts
    this.selected = new Set(conflicts.map((c) => c.id))
    this.mode = 'list'
    this.pickItem = null
    // 抽屉打开期间继续禁止新名自动确认
    suppressAutoConfirmForTitle(newTitle)
    this.renderShell()
    this.renderList()
  }

  /** 用户关闭抽屉：未处理项降为灰线，并恢复其它词的自动确认 */
  close() {
    this.finalizePendingAsCandidates()
    this.teardownShell()
  }

  private finalizePendingAsCandidates() {
    for (const item of this.items) {
      const ctx = String(item.context || '').trim() || item.hit
      demoteTermToCandidate(this.newTitle, ctx)
      if (item.hit && item.hit !== this.newTitle) {
        demoteTermToCandidate(item.hit, ctx)
      }
    }
    if (this.items.length) {
      // 未处理完：pending 数组已在 rename-sync 落库，保持禁止自动确认
      suppressAutoConfirmForTitle(this.newTitle)
    } else {
      clearAutoConfirmSuppress(this.newTitle)
      void useGlossaryStore().clearPendingManualConfirm(this.newTitle)
    }
    this.items = []
    this.selected.clear()
  }

  private teardownShell() {
    this.el?.remove()
    this.el = null
    this.listEl = null
  }

  private renderShell() {
    this.teardownShell()
    const el = document.createElement('div')
    el.className = 'ext-term-conflict-drawer'
    el.innerHTML = `
      <div class="ext-term-conflict-drawer-panel">
        <div class="ext-term-conflict-drawer-header">
          <div class="ext-term-conflict-drawer-title">词条冲突审查：${escapeHtml(this.newTitle)}</div>
          <button type="button" class="ext-term-conflict-drawer-close" aria-label="关闭">&times;</button>
        </div>
        <div class="ext-term-conflict-drawer-hint">勾选条目后：可「确认为词条」（写成 term[]），或「不需要修改」（写入忽略，以后不再提示）。也可点路径跳转文档。</div>
        <div class="ext-term-conflict-drawer-body"></div>
        <div class="ext-term-conflict-drawer-footer">
          <button type="button" class="ext-term-conflict-btn" data-act="confirm">确认为词条</button>
          <button type="button" class="ext-term-conflict-btn is-muted" data-act="ignore-auto">不需要修改</button>
          <button type="button" class="ext-term-conflict-btn is-muted" data-act="close">完成</button>
        </div>
      </div>
    `
    document.body.appendChild(el)
    this.el = el
    this.listEl = el.querySelector('.ext-term-conflict-drawer-body')

    el.querySelector('.ext-term-conflict-drawer-close')?.addEventListener('click', () =>
      this.close(),
    )
    el.querySelector('[data-act="close"]')?.addEventListener('click', () => this.close())
    el.querySelector('[data-act="confirm"]')?.addEventListener('click', () => {
      void this.applyConfirm()
    })
    el.querySelector('[data-act="ignore-auto"]')?.addEventListener('click', () => {
      void this.applyIgnoreAuto()
    })
  }

  private renderList() {
    if (!this.listEl) return
    this.mode = 'list'
    this.listEl.replaceChildren()
    if (!this.items.length) {
      this.listEl.textContent =
        '已完成全库引用同步。当前没有「新名/曾用名」裸文本冲突需要确认。'
      return
    }

    for (const item of this.items) {
      const row = document.createElement('div')
      row.className = 'ext-term-conflict-row'
      row.dataset.id = item.id

      const check = document.createElement('input')
      check.type = 'checkbox'
      check.className = 'ext-term-conflict-check'
      check.checked = this.selected.has(item.id)
      check.title = '勾选后批量处理'
      check.addEventListener('change', () => {
        if (check.checked) this.selected.add(item.id)
        else this.selected.delete(item.id)
      })

      const ctx = document.createElement('div')
      ctx.className = 'ext-term-conflict-context'
      ctx.innerHTML = highlightHit(item.context, item.hit)

      const pickBtn = document.createElement('button')
      pickBtn.type = 'button'
      pickBtn.className = 'ext-term-conflict-pick'
      pickBtn.textContent = '选字忽略'
      pickBtn.title = '自定义忽略上下文'
      pickBtn.addEventListener('click', () => this.openPick(item))

      const meta = document.createElement('div')
      meta.className = 'ext-term-conflict-meta'

      const kind = document.createElement('span')
      kind.className = 'ext-term-conflict-kind'
      kind.textContent =
        item.kind === 'former-title' ? '曾用名仍出现' : '新名出现在正文'

      const pathBtn = document.createElement('button')
      pathBtn.type = 'button'
      pathBtn.className = 'ext-term-conflict-path'
      pathBtn.textContent = item.sourcePath
      pathBtn.title = `打开 ${item.sourcePath}`
      pathBtn.addEventListener('click', () => {
        requestOpenFilePath(item.sourcePath)
      })

      meta.appendChild(kind)
      meta.appendChild(pathBtn)

      row.appendChild(check)
      row.appendChild(ctx)
      row.appendChild(pickBtn)
      row.appendChild(meta)
      this.listEl.appendChild(row)
    }
  }

  private openPick(item: ConflictItem) {
    if (!this.listEl) return
    this.mode = 'pick'
    this.pickItem = item
    const hitAt = item.context.indexOf(item.hit)
    this.pickRange =
      hitAt >= 0
        ? { start: hitAt, end: hitAt + item.hit.length }
        : { start: 0, end: item.context.length }

    this.listEl.replaceChildren()
    const wrap = document.createElement('div')
    wrap.className = 'ext-term-conflict-pick-panel'
    const tip = document.createElement('div')
    tip.className = 'ext-term-conflict-drawer-hint'
    tip.textContent = '点选连续字符作为 ignore 上下文（须覆盖冲突词）'
    wrap.appendChild(tip)

    const chars = document.createElement('div')
    chars.className = 'ext-term-conflict-chars'
    const text = item.context
    for (let i = 0; i < text.length; i += 1) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ext-term-conflict-char'
      btn.textContent = text[i]
      btn.dataset.index = String(i)
      btn.addEventListener('click', () => this.togglePickChar(i, chars))
      chars.appendChild(btn)
    }
    wrap.appendChild(chars)
    this.paintPick(chars)

    const actions = document.createElement('div')
    actions.className = 'ext-term-conflict-pick-actions'
    const ok = document.createElement('button')
    ok.type = 'button'
    ok.className = 'ext-term-conflict-btn'
    ok.textContent = '确认忽略'
    ok.addEventListener('click', () => void this.applyPickIgnore())
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'ext-term-conflict-btn is-muted'
    back.textContent = '返回列表'
    back.addEventListener('click', () => this.renderList())
    actions.appendChild(ok)
    actions.appendChild(back)
    wrap.appendChild(actions)
    this.listEl.appendChild(wrap)
  }

  private togglePickChar(index: number, charsEl: HTMLElement) {
    if (!this.pickRange || !this.pickItem) return
    const hitAt = this.pickItem.context.indexOf(this.pickItem.hit)
    const hitEnd = hitAt + this.pickItem.hit.length
    let { start, end } = this.pickRange
    if (index < start) start = index
    else if (index >= end) end = index + 1
    else if (index - start < end - index) start = index
    else end = index + 1
    // 必须覆盖冲突词
    if (hitAt >= 0) {
      start = Math.min(start, hitAt)
      end = Math.max(end, hitEnd)
    }
    this.pickRange = { start, end }
    this.paintPick(charsEl)
  }

  private paintPick(charsEl: HTMLElement) {
    if (!this.pickRange) return
    const { start, end } = this.pickRange
    charsEl.querySelectorAll('.ext-term-conflict-char').forEach((node) => {
      const el = node as HTMLElement
      const i = Number(el.dataset.index)
      el.classList.toggle('is-selected', i >= start && i < end)
    })
  }

  private selectedItems() {
    return this.items.filter((i) => this.selected.has(i.id))
  }

  private async applyConfirm() {
    const items = this.selectedItems()
    if (!items.length) return
    const data = await api.applyGlossaryConflicts({
      newTitle: this.newTitle,
      confirms: items.map((i) => ({
        id: i.id,
        sourcePath: i.sourcePath,
        from: i.from,
        to: i.to,
        title: this.newTitle,
      })),
      ignores: [],
      resolvedIds: items.map((i) => i.id),
    })
    useGlossaryStore().applyPayload(data)
    const done = new Set(items.map((i) => i.id))
    this.items = this.items.filter((i) => !done.has(i.id))
    this.selected = new Set(this.items.map((i) => i.id))
    for (const path of new Set(items.map((i) => i.sourcePath))) {
      requestReloadFilePath(path)
    }
    // 全部处理完也保持抑制直到点「完成」，避免重载后瞬间自动包词
    this.renderList()
  }

  private async applyIgnoreAuto() {
    const items = this.selectedItems()
    if (!items.length) return
    const ignores = items.map((i) => {
      // 优先用整行上下文落库，保证回改名后仍能按忽略过滤；短上下文作回退
      const localFrom = i.context.indexOf(i.hit)
      const short =
        localFrom >= 0
          ? buildShortIgnoreContext(
              i.context,
              localFrom,
              localFrom + i.hit.length,
            )
          : ''
      const ctx = String(i.context || '').trim() || short || i.hit
      return {
        id: i.id,
        sourcePath: i.sourcePath,
        from: i.from,
        to: i.to,
        context: ctx,
        termTitle: this.newTitle,
      }
    })
    const data = await api.applyGlossaryConflicts({
      newTitle: this.newTitle,
      confirms: [],
      ignores,
      resolvedIds: items.map((i) => i.id),
    })
    useGlossaryStore().applyPayload(data)
    const done = new Set(items.map((i) => i.id))
    this.items = this.items.filter((i) => !done.has(i.id))
    this.selected = new Set(this.items.map((i) => i.id))
    this.renderList()
  }

  private async applyPickIgnore() {
    if (!this.pickItem || !this.pickRange) return
    const ctx = this.pickItem.context
      .slice(this.pickRange.start, this.pickRange.end)
      .trim()
    if (!ctx || !ctx.includes(this.pickItem.hit)) {
      await alertInfo('选区必须覆盖冲突词', '提示')
      return
    }
    const data = await api.applyGlossaryConflicts({
      newTitle: this.newTitle,
      confirms: [],
      ignores: [
        {
          id: this.pickItem.id,
          sourcePath: this.pickItem.sourcePath,
          from: this.pickItem.from,
          to: this.pickItem.to,
          context: ctx,
          termTitle: this.newTitle,
        },
      ],
      resolvedIds: [this.pickItem.id],
    })
    useGlossaryStore().applyPayload(data)
    const id = this.pickItem.id
    this.items = this.items.filter((i) => i.id !== id)
    this.renderList()
  }
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlightHit(context: string, hit: string): string {
  const i = context.indexOf(hit)
  if (i < 0) return escapeHtml(context)
  return (
    escapeHtml(context.slice(0, i)) +
    `<mark>${escapeHtml(hit)}</mark>` +
    escapeHtml(context.slice(i + hit.length))
  )
}

let drawer: ConflictDrawer | null = null

export function openConflictDrawer(newTitle: string, conflicts: ConflictItem[]) {
  if (!drawer) drawer = new ConflictDrawer()
  drawer.open(newTitle, conflicts)
}

/** 稍后解决：pending 已由 rename-sync 落库；正文新名只显示灰线 */
function leaveConflictsAsCandidates(
  newTitle: string,
  conflicts: ConflictItem[],
) {
  suppressAutoConfirmForTitle(newTitle)
  for (const item of conflicts) {
    const ctx = String(item.context || '').trim() || item.hit
    demoteTermToCandidate(newTitle, ctx)
    if (item.hit && item.hit !== newTitle) {
      demoteTermToCandidate(item.hit, ctx)
    }
  }
}

/**
 * 改名后：同步已确认 term[旧]→term[新]，扫描冲突并写入 pendingManualConfirm。
 * 有冲突时先弹窗询问，用户确认后再打开右侧审查抽屉。
 */
export async function runRenameSyncAndOpenDrawer(
  oldTitle: string,
  newTitle: string,
  options?: { alsoReplace?: string[] },
) {
  if (oldTitle === newTitle) return
  const alsoReplace = Array.from(
    new Set(
      [oldTitle, ...(options?.alsoReplace || [])]
        .map((t) => String(t || '').trim())
        .filter((t) => t && t !== newTitle),
    ),
  )
  const result = (await api.renameGlossarySync({
    oldTitle,
    newTitle,
    alsoReplace,
  })) as {
    conflicts?: ConflictItem[]
    refUpdatedFiles?: number
    lastUpdated?: string
    terms?: Record<string, unknown>
  }
  if (result.terms) {
    useGlossaryStore().applyPayload({
      lastUpdated: String(result.lastUpdated || ''),
      terms: result.terms as never,
    })
  } else {
    await useGlossaryStore().reload()
  }
  const conflicts = result.conflicts || []

  if (!conflicts.length) {
    clearAutoConfirmSuppress(newTitle)
    toast(`「${oldTitle}」已改名为「${newTitle}」`, 'success')
    return result
  }

  suppressAutoConfirmForTitle(newTitle)

  const go = await confirmAction(
    `词条「${newTitle}」与正文部分文案有冲突，是否现在处理？`,
    '词条冲突',
    {
      confirmButtonText: '去解决',
      cancelButtonText: '稍后解决',
      type: 'warning',
    },
  )

  if (go) {
    openConflictDrawer(newTitle, conflicts)
  } else {
    leaveConflictsAsCandidates(newTitle, conflicts)
    toast('冲突处已标为灰线，可稍后点选确认', 'info')
  }
  return result
}
