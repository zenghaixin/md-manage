/**
 * 改名冲突审查：批量确认词条 / 不是词条。
 * UI 为 Vue + el-collapse，挂载到壳层右侧操作区。
 */
import { createApp, type App } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { getActivePinia } from 'pinia'
import { useGlossaryStore } from '../../../stores/glossary'
import {
  requestOpenRightPanel,
  requestCloseRightPanel,
  onRightPanelDismiss,
} from '../../../editor/shellEvents'
import {
  registerRightPanelModule,
  notifyRightPanelModulesChanged,
} from '../../../editor/rightPanelRegistry'
import {
  confirmAction,
  toast,
} from '../../../composables/useDialog'
import {
  clearAutoConfirmSuppress,
  demoteTermToCandidate,
  suppressAutoConfirmForTitle,
} from './match'
import { ensureTermGlossaryStyles } from './styles'
import { normalizePendingManualConfirm } from './syntax'
import ConflictReviewPanel from './ConflictReviewPanel.vue'
import { api } from '../../../api'

export const TERM_CONFLICT_MODULE_ID = 'term-conflict'

export interface ConflictItem {
  id: string
  sourcePath: string
  kind: string
  hit: string
  context: string
  from: number
  to: number
  /** 所属词条标题（多词条 pending 合并展示时用） */
  termTitle?: string
}

type PanelExpose = {
  getItems: () => ConflictItem[]
}

class ConflictDrawer {
  private rootEl: HTMLDivElement | null = null
  private vueApp: App | null = null
  private panel: PanelExpose | null = null
  private active = false
  private closing = false
  private stopDismiss: (() => void) | null = null

  get isActive() {
    return this.active
  }

  /** 由右栏模块 mount 调用 */
  present(host: HTMLElement) {
    ensureTermGlossaryStyles()
    const groups = collectAllPendingGroups()
    const initialItems = groups.flatMap((g) => g.items)

    for (const g of groups) {
      suppressAutoConfirmForTitle(g.title)
    }

    this.closing = false
    this.active = true
    this.stopDismiss?.()
    this.stopDismiss = onRightPanelDismiss(() => {
      if (!this.active || this.closing) return
      this.close({ fromShell: true })
    })

    this.teardownShell()
    host.replaceChildren()
    const root = document.createElement('div')
    root.className = 'ext-term-conflict-panel-root h-full min-h-0'
    host.appendChild(root)
    this.rootEl = root

    this.vueApp = createApp(ConflictReviewPanel, {
      initialItems,
      onClose: () => {
        this.close()
      },
    })
    const pinia = getActivePinia()
    if (pinia) this.vueApp.use(pinia)
    this.vueApp.use(ElementPlus, { locale: zhCn })
    const mounted = this.vueApp.mount(root) as unknown as PanelExpose
    this.panel = mounted
  }

  /** 仅卸 DOM（切换书签）；不清理 pending */
  detach() {
    this.stopDismiss?.()
    this.stopDismiss = null
    this.active = false
    this.teardownShell()
  }

  close(opts?: { fromShell?: boolean }) {
    if (this.closing) return
    this.closing = true
    this.active = false
    this.stopDismiss?.()
    this.stopDismiss = null
    const remaining = this.panel?.getItems?.() || []
    this.finalizePendingAsCandidates(remaining)
    this.teardownShell()
    notifyRightPanelModulesChanged()
    if (!opts?.fromShell) {
      requestCloseRightPanel()
    }
    this.closing = false
  }

  private finalizePendingAsCandidates(items: ConflictItem[]) {
    const titles = new Set<string>()
    for (const item of items) {
      const title = String(item.termTitle || item.hit || '').trim()
      if (!title) continue
      titles.add(title)
      const ctx = String(item.context || '').trim() || item.hit
      demoteTermToCandidate(title, ctx)
      if (item.hit && item.hit !== title) {
        demoteTermToCandidate(item.hit, ctx)
      }
    }
    if (items.length) {
      for (const title of titles) suppressAutoConfirmForTitle(title)
    } else {
      for (const title of titles) {
        clearAutoConfirmSuppress(title)
        void useGlossaryStore().clearPendingManualConfirm(title)
      }
    }
  }

  private teardownShell() {
    if (this.vueApp) {
      try {
        this.vueApp.unmount()
      } catch {
        // ignore
      }
      this.vueApp = null
    }
    this.panel = null
    this.rootEl?.remove()
    this.rootEl = null
  }
}

let drawer: ConflictDrawer | null = null
let moduleBound = false

function collectAllPendingGroups(): Array<{
  title: string
  items: ConflictItem[]
}> {
  try {
    const store = useGlossaryStore()
    const groups: Array<{ title: string; items: ConflictItem[] }> = []
    for (const term of Object.values(store.terms)) {
      const pending = normalizePendingManualConfirm(term.pendingManualConfirm)
      if (!pending.length) continue
      const title = term.title
      groups.push({
        title,
        items: pending.map((p) => ({ ...p, termTitle: title })),
      })
    }
    return groups
  } catch {
    return []
  }
}

function hasAnyPendingConflicts(): boolean {
  return collectAllPendingGroups().length > 0
}

/** 打开冲突审查书签模块 */
export function openConflictDrawer(_newTitle?: string, _conflicts?: ConflictItem[]) {
  notifyRightPanelModulesChanged()
  requestOpenRightPanel({ moduleId: TERM_CONFLICT_MODULE_ID })
}

/** @deprecated */
export function tryRestorePendingConflicts(): boolean {
  if (!hasAnyPendingConflicts()) return false
  openConflictDrawer()
  return true
}

/** 注册「冲突审查」书签模块；有 pending 时才可见 */
export function bindPendingConflictRestore(): void {
  if (moduleBound) return
  moduleBound = true

  registerRightPanelModule({
    id: TERM_CONFLICT_MODULE_ID,
    label: '冲突审查',
    order: 10,
    isVisible: () => hasAnyPendingConflicts(),
    mount(host) {
      if (!collectAllPendingGroups().length) return
      if (!drawer) drawer = new ConflictDrawer()
      drawer.present(host)
    },
    unmount() {
      drawer?.detach()
    },
  })

  try {
    useGlossaryStore().$subscribe(() => {
      notifyRightPanelModulesChanged()
    })
  } catch {
    // ignore
  }
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
 * 有冲突时先弹窗询问，用户确认后再打开右侧冲突审查。
 */
export async function runRenameSyncAndOpenDrawer(
  oldTitle: string,
  newTitle: string,
  options?: { alsoReplace?: string[]; recordAsFormer?: boolean },
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
    recordAsFormer: options?.recordAsFormer === true,
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
  }
  return result
}
