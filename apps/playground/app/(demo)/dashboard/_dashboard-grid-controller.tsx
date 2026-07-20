'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  DashboardGrid,
  type DashboardActionResult,
  type DashboardLayout,
  type DashboardLibraryItem,
} from '@appkit/ui'

export function DashboardGridController({ initialLayout, nodes, items, mode, onSave, onReset }: {
  initialLayout: DashboardLayout
  nodes: Record<string, React.ReactNode>
  items: DashboardLibraryItem[]
  mode: 'view' | 'edit'
  onSave: (layout: DashboardLayout) => Promise<DashboardActionResult>
  onReset: () => Promise<DashboardActionResult>
}) {
  const router = useRouter()
  return <DashboardGrid
    initialLayout={initialLayout}
    nodes={nodes}
    items={items}
    mode={mode}
    onSave={onSave}
    onReset={onReset}
    onSaved={() => { router.push('/dashboard'); router.refresh() }}
    categoryLabels={{ headlines: 'Headlines', workspace: 'Workspace', insights: 'Insight cards' }}
  />
}
