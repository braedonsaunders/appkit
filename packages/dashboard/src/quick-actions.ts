import type { DashboardQuickAction } from './types'

const SAFE_HREF = /^(?:\/[a-z0-9/_?=&%+.,:@~-]*|https:\/\/[^\s]+)$/i
const ID = /^[a-z][a-z0-9:_-]{0,79}$/

export function normalizeQuickActions(actions: DashboardQuickAction[], options: { maximum?: number } = {}): DashboardQuickAction[] {
  const maximum = Math.max(0, Math.min(24, options.maximum ?? 8))
  const seen = new Set<string>()
  return actions.flatMap((action) => {
    const id = action.id.trim(), label = action.label.trim(), href = action.href.trim(), iconKey = action.iconKey.trim()
    if (seen.size >= maximum || seen.has(id) || !ID.test(id) || !label || label.length > 80 || !SAFE_HREF.test(href) || !iconKey || iconKey.length > 80) return []
    seen.add(id)
    return [{ ...action, id, label, href, iconKey, tone: action.tone.trim() || 'primary' }]
  })
}

export function reorderQuickActions(actions: DashboardQuickAction[], from: number, to: number): DashboardQuickAction[] {
  if (from < 0 || from >= actions.length || to < 0 || to >= actions.length || from === to) return [...actions]
  const next = [...actions], [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}
