/**
 * 右侧面板模块注册表。
 * 扩展注册书签模块；壳层按可见性展示书签并 mount/unmount。
 */
export type RightPanelModule = {
  id: string
  label: string
  /** 越小越靠上 */
  order?: number
  isVisible: () => boolean
  mount: (host: HTMLElement) => void
  unmount?: () => void
}

const modules = new Map<string, RightPanelModule>()
const changeHandlers = new Set<() => void>()

export function registerRightPanelModule(mod: RightPanelModule): () => void {
  if (!mod?.id || !mod?.label) return () => {}
  modules.set(mod.id, mod)
  notifyRightPanelModulesChanged()
  return () => {
    if (modules.get(mod.id) === mod) {
      modules.delete(mod.id)
      notifyRightPanelModulesChanged()
    }
  }
}

export function listRightPanelModules(): RightPanelModule[] {
  return Array.from(modules.values()).sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id),
  )
}

export function listVisibleRightPanelModules(): RightPanelModule[] {
  return listRightPanelModules().filter((m) => {
    try {
      return !!m.isVisible()
    } catch {
      return false
    }
  })
}

export function getRightPanelModule(id: string): RightPanelModule | null {
  return modules.get(id) || null
}

export function onRightPanelModulesChanged(handler: () => void): () => void {
  changeHandlers.add(handler)
  return () => {
    changeHandlers.delete(handler)
  }
}

export function notifyRightPanelModulesChanged(): void {
  for (const handler of Array.from(changeHandlers)) {
    try {
      handler()
    } catch (err) {
      console.warn('[rightPanel] module change handler failed:', err)
    }
  }
}

/** 解析应激活的模块：优先 saved（若仍可见），否则第一个可见 */
export function resolveActiveRightPanelModuleId(
  savedId: string | null | undefined,
): string {
  const visible = listVisibleRightPanelModules()
  if (!visible.length) return ''
  const saved = String(savedId || '').trim()
  if (saved && visible.some((m) => m.id === saved)) return saved
  return visible[0].id
}
