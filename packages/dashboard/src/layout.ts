import type { DashboardLayout, DashboardLibraryItem, DashboardWidget } from './types'

export type DashboardLayoutSource = 'user' | 'role' | 'default'
export type ResolvedDashboardLayout = { layout: DashboardLayout; source: DashboardLayoutSource }

export function resolveDashboardLayout(options: { user?: DashboardLayout | null; role?: DashboardLayout | null; fallback: DashboardLayout; library: DashboardLibraryItem[] }): ResolvedDashboardLayout {
  const selected = options.user ? { value: options.user, source: 'user' as const }
    : options.role ? { value: options.role, source: 'role' as const }
      : { value: options.fallback, source: 'default' as const }
  return { layout: normalizeDashboardLayout(selected.value, options.library), source: selected.source }
}

export function normalizeDashboardLayout(layout: DashboardLayout, library: DashboardLibraryItem[]): DashboardLayout {
  const definitions = new Map(library.map((item) => [item.id, item]))
  const seen = new Set<string>()
  const widgets = layout.widgets.flatMap((widget): DashboardWidget[] => {
    const definition = definitions.get(widget.id)
    if (!definition || seen.has(widget.id)) return []
    seen.add(widget.id)
    const width = clamp(widget.w, definition.minSize.w, definition.maxSize?.w ?? 12)
    const height = clamp(widget.h, definition.minSize.h, definition.maxSize?.h ?? 100)
    return [{ id: widget.id, x: clamp(widget.x, 0, Math.max(0, 12 - width)), y: Math.max(0, Math.trunc(widget.y)), w: width, h: height }]
  })
  return { widgets, quickActions: layout.quickActions ? [...layout.quickActions] : undefined }
}

export function layoutForRole<T extends string>(role: T, layouts: Partial<Record<T, DashboardLayout>>, fallback: DashboardLayout): DashboardLayout { return layouts[role] ?? fallback }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, Math.trunc(Number.isFinite(value) ? value : minimum))) }
