'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type {
  DashboardActionResult,
  DashboardLayout,
  DashboardLibraryItem,
} from '@appkit/dashboard'
import {
  DashboardGrid,
} from '@appkit/dashboard/react'

export function DashboardGridController({ initialLayout, nodes, items, mode, onSave, onReset, browserPersistence = false }: {
  initialLayout: DashboardLayout
  nodes: Record<string, React.ReactNode>
  items: DashboardLibraryItem[]
  mode: 'view' | 'edit'
  onSave: (layout: DashboardLayout) => Promise<DashboardActionResult>
  onReset: () => Promise<DashboardActionResult>
  browserPersistence?: boolean
}) {
  const router = useRouter()
  const [browserLayout, setBrowserLayout] = React.useState(initialLayout)
  const [storageRevision, setStorageRevision] = React.useState(0)
  React.useEffect(() => {
    if (!browserPersistence) return
    try {
      const stored = window.localStorage.getItem('appkit-demo:dashboard-layout:v1')
      if (!stored) return
      const parsed = JSON.parse(stored) as DashboardLayout
      const allowed = new Set(items.map((item) => item.id))
      if (!parsed || !Array.isArray(parsed.widgets)) return
      const seen = new Set<string>()
      const widgets = parsed.widgets.filter((widget) =>
        widget
        && allowed.has(widget.id)
        && !seen.has(widget.id)
        && [widget.x, widget.y, widget.w, widget.h].every(Number.isInteger)
        && widget.x >= 0 && widget.x < 12
        && widget.y >= 0 && widget.y < 10_000
        && widget.w >= 1 && widget.w <= 12
        && widget.h >= 1 && widget.h <= 24
        && widget.x + widget.w <= 12
        && Boolean(seen.add(widget.id)),
      )
      if (widgets.length > 0) {
        setBrowserLayout({ widgets })
        setStorageRevision((value) => value + 1)
      }
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts. The
      // default dashboard remains fully usable for the current render.
    }
  }, [browserPersistence, items])

  const save = browserPersistence
    ? async (layout: DashboardLayout): Promise<DashboardActionResult> => {
        try {
          window.localStorage.setItem('appkit-demo:dashboard-layout:v1', JSON.stringify(layout))
          setBrowserLayout(layout)
          return { ok: true }
        } catch {
          return { ok: false, error: 'The browser could not save this layout.' }
        }
      }
    : onSave
  const reset = browserPersistence
    ? async (): Promise<DashboardActionResult> => {
        try {
          window.localStorage.removeItem('appkit-demo:dashboard-layout:v1')
          setBrowserLayout(initialLayout)
          setStorageRevision((value) => value + 1)
          return { ok: true }
        } catch {
          return { ok: false, error: 'The browser could not reset this layout.' }
        }
      }
    : onReset

  return <DashboardGrid
    key={browserPersistence ? storageRevision : 'database'}
    initialLayout={browserPersistence ? browserLayout : initialLayout}
    nodes={nodes}
    items={items}
    mode={mode}
    onSave={save}
    onReset={reset}
    onSaved={() => { router.push('/dashboard'); router.refresh() }}
    categoryLabels={{ headlines: 'Headlines', workspace: 'Workspace', insights: 'Insight cards' }}
  />
}
