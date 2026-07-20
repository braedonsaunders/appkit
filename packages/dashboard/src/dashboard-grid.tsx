'use client'

import * as React from 'react'
import { LayoutGrid, Loader2, Plus, RotateCcw, Save, Settings2, X } from 'lucide-react'
import { Responsive, type Layout, type LayoutItem } from 'react-grid-layout'
import { Button, Drawer, cn } from '@appkit/ui'
import type {
  DashboardActionResult,
  DashboardLayout,
  DashboardLibraryItem,
} from './types'

const COLS = { lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
const ROW_HEIGHT = 48
const MARGIN: readonly [number, number] = [16, 16]

export function DashboardGrid({
  initialLayout,
  nodes,
  items,
  categoryLabels,
  mode = 'view',
  onSave,
  onReset,
  onSaved,
  toolbarLabel = 'Customizing your dashboard',
  saveLabel = 'Save',
  resetLabel = 'Reset',
  addLabel = 'Add widget',
  emptyLabel = 'This dashboard has no cards yet.',
  className,
}: {
  initialLayout: DashboardLayout
  nodes: Record<string, React.ReactNode>
  items: DashboardLibraryItem[]
  categoryLabels?: Record<string, string>
  mode?: 'view' | 'edit'
  onSave?: (layout: DashboardLayout) => Promise<DashboardActionResult>
  onReset?: () => Promise<DashboardActionResult>
  onSaved?: () => void
  toolbarLabel?: string
  saveLabel?: string
  resetLabel?: string
  addLabel?: string
  emptyLabel?: string
  className?: string
}) {
  const [layout, setLayout] = React.useState(initialLayout.widgets)
  const [baseline, setBaseline] = React.useState(() => JSON.stringify(initialLayout.widgets))
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [viewport, setViewport] = React.useState<'phone' | 'tablet' | 'desktop'>('desktop')
  const [width, setWidth] = React.useState(1024)
  const observer = React.useRef<ResizeObserver | null>(null)
  const itemsById = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const present = React.useMemo(() => new Set(layout.map((widget) => widget.id)), [layout])
  const dirty = JSON.stringify(layout) !== baseline

  React.useLayoutEffect(() => {
    const phone = window.matchMedia('(max-width: 639px)')
    const tablet = window.matchMedia('(max-width: 1023px)')
    const update = () => setViewport(phone.matches ? 'phone' : tablet.matches ? 'tablet' : 'desktop')
    update()
    phone.addEventListener('change', update)
    tablet.addEventListener('change', update)
    return () => { phone.removeEventListener('change', update); tablet.removeEventListener('change', update) }
  }, [])

  const measureRef = React.useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect(); observer.current = null
    if (!element) return
    setWidth(element.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const next = new ResizeObserver((entries) => {
      const measured = Math.floor(entries[0]?.contentRect.width ?? 0)
      if (measured > 0) setWidth(measured)
    })
    next.observe(element); observer.current = next
  }, [])

  React.useEffect(() => () => observer.current?.disconnect(), [])

  const gridLayout = React.useMemo<LayoutItem[]>(() => layout.map((widget) => {
    const item = itemsById.get(widget.id)
    return { i: widget.id, x: widget.x, y: widget.y, w: widget.w, h: widget.h,
      minW: item?.minSize.w ?? 2, minH: item?.minSize.h ?? 2,
      maxW: item?.maxSize?.w, maxH: item?.maxSize?.h,
      isDraggable: mode === 'edit', isResizable: mode === 'edit' }
  }), [itemsById, layout, mode])

  const commit = React.useCallback((next: Layout) => {
    if (mode !== 'edit') return
    const known = new Set(layout.map((widget) => widget.id))
    setLayout(next.filter((item) => known.has(item.i)).map((item) => ({ id: item.i, x: item.x, y: item.y, w: item.w, h: item.h })))
  }, [layout, mode])

  function add(item: DashboardLibraryItem) {
    if (present.has(item.id)) return
    const y = layout.reduce((maximum, widget) => Math.max(maximum, widget.y + widget.h), 0)
    setLayout((current) => [...current, { id: item.id, x: 0, y, w: item.defaultSize.w, h: item.defaultSize.h }])
  }

  async function save() {
    if (!onSave) return
    setSaving(true); setError(null)
    try {
      const result = await onSave({ widgets: layout })
      if (result.ok) { setBaseline(JSON.stringify(layout)); onSaved?.() }
      else setError(result.error)
    } finally { setSaving(false) }
  }

  async function reset() {
    if (!onReset) return
    setResetting(true); setError(null)
    try {
      const result = await onReset()
      if (result.ok) onSaved?.()
      else setError(result.error)
    } finally { setResetting(false) }
  }

  if (mode === 'view' && viewport !== 'desktop') {
    const ordered = [...layout].sort((a, b) => a.y - b.y || a.x - b.x)
    return <div className={cn(viewport === 'phone' ? 'space-y-4' : 'columns-2 gap-4', className)}>
      {ordered.map((widget) => <div key={widget.id} className={viewport === 'tablet' ? 'mb-4 break-inside-avoid' : undefined}>{nodes[widget.id] ?? <MissingCard id={widget.id} />}</div>)}
    </div>
  }

  return <div className={cn('space-y-4', className)}>
    {mode === 'edit' ? <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-subtle/90 px-4 py-2.5 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Settings2 size={15} />{toolbarLabel}</div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setPaletteOpen(true)}><Plus size={14} />{addLabel}</Button>
        {onReset ? <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={resetting}>{resetting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw size={14} />}{resetLabel}</Button> : null}
        {onSave ? <Button type="button" size="sm" onClick={save} disabled={!dirty || saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={14} />}{saveLabel}</Button> : null}
      </div>
    </div> : null}
    {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">{error}</div> : null}
    {!layout.length ? <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border bg-bg-subtle text-sm text-fg-subtle"><div className="text-center"><LayoutGrid className="mx-auto mb-2 size-6" />{emptyLabel}</div></div> :
      <div ref={measureRef} className="min-w-0">
        <Responsive
          className="appkit-dashboard-layout"
          width={width}
          layouts={{ lg: gridLayout, md: gridLayout, sm: gridLayout, xs: gridLayout, xxs: gridLayout }}
          cols={COLS}
          breakpoints={BREAKPOINTS}
          rowHeight={ROW_HEIGHT}
          margin={MARGIN}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: mode === 'edit', bounded: false, cancel: '.no-drag,button,input,select,textarea', threshold: 3 }}
          resizeConfig={{ enabled: mode === 'edit', handles: ['se'] }}
          onDragStop={(next) => commit(next)}
          onResizeStop={(next) => commit(next)}
        >
          {layout.map((widget) => <div key={widget.id} className="group/dashboard-cell">
            <div className="relative h-full w-full" onClickCapture={mode === 'edit' ? (event) => { if ((event.target as HTMLElement).closest('a')) { event.preventDefault(); event.stopPropagation() } } : undefined}>
              {mode === 'edit' ? <><div className="pointer-events-none absolute inset-0 z-10 rounded-xl ring-1 ring-primary/0 transition group-hover/dashboard-cell:ring-primary/70" /><button type="button" onClick={() => setLayout((current) => current.filter((item) => item.id !== widget.id))} aria-label="Remove widget" className="no-drag absolute -right-2 -top-2 z-20 grid size-6 place-items-center rounded-full border border-danger/30 bg-surface text-danger opacity-0 shadow-sm transition group-hover/dashboard-cell:opacity-100 hover:bg-danger-subtle"><X size={12} /></button></> : null}
              {nodes[widget.id] ?? <MissingCard id={widget.id} />}
            </div>
          </div>)}
        </Responsive>
      </div>}
    <DashboardLibrary open={paletteOpen} onClose={() => setPaletteOpen(false)} items={items} present={present} categoryLabels={categoryLabels} onAdd={add} />
  </div>
}

function MissingCard({ id }: { id: string }) {
  return <div className="grid h-full place-items-center rounded-xl border border-dashed border-border bg-bg-subtle px-3 text-center text-xs text-fg-subtle">Card unavailable: {id}</div>
}

function DashboardLibrary({ open, onClose, items, present, categoryLabels, onAdd }: { open: boolean; onClose: () => void; items: DashboardLibraryItem[]; present: Set<string>; categoryLabels?: Record<string, string>; onAdd: (item: DashboardLibraryItem) => void }) {
  const categories = React.useMemo(() => {
    const grouped = new Map<string, DashboardLibraryItem[]>()
    for (const item of items) grouped.set(item.category, [...(grouped.get(item.category) ?? []), item])
    return [...grouped.entries()]
  }, [items])
  return <Drawer open={open} onClose={onClose} title="Widgets" description="Click to add to your dashboard" size="md" bodyClassName="app-scroll px-3 py-4 sm:px-5">
    <div className="space-y-6">
      {categories.map(([category, categoryItems]) => <section key={category} className="space-y-2">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">{categoryLabels?.[category] ?? category}</h3>
        <div className="space-y-1.5">{categoryItems.map((item) => {
          const added = present.has(item.id)
          return <button key={item.id} type="button" disabled={added} onClick={() => onAdd(item)} className="group flex w-full items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition hover:border-primary/50 hover:bg-surface-hover disabled:opacity-45">
            <span className="mt-0.5 text-primary">{added ? '✓' : '+'}</span><span className="min-w-0"><span className="block text-sm font-medium text-fg">{item.label}</span><span className="block truncate text-xs text-fg-muted">{item.description}</span></span>
          </button>
        })}</div>
      </section>)}
    </div>
  </Drawer>
}
