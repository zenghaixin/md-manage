import type { SelectionAction } from './types'

const actions = new Map<string, SelectionAction>()

export function registerSelectionAction(action: SelectionAction): () => void {
  if (!action?.id || !action?.label) return () => {}
  actions.set(action.id, action)
  return () => {
    if (actions.get(action.id) === action) actions.delete(action.id)
  }
}

export function listSelectionActions(): SelectionAction[] {
  return Array.from(actions.values()).sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id),
  )
}
