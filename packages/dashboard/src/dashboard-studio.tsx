'use client'

import * as React from 'react'
import { Loader2, Pin, PinOff, Trash2 } from 'lucide-react'
import { Badge, Button, Input, Label, cn } from '@appkit/ui'
import { DashboardGrid } from './dashboard-grid'
import type { DashboardActionResult, DashboardDraft, DashboardLibraryItem, DashboardStudioAdapter } from './types'

export type DashboardStudioProps = {
  initial: DashboardDraft
  nodes: Record<string, React.ReactNode>
  items: DashboardLibraryItem[]
  adapter: DashboardStudioAdapter
  onRemoved?: () => void
  onSaved?: (draft: DashboardDraft) => void
  categoryLabels?: Record<string, string>
  readOnly?: boolean
  className?: string
}

export function DashboardStudio({ initial, nodes, items, adapter, onRemoved, onSaved, categoryLabels, readOnly = false, className }: DashboardStudioProps) {
  const [draft, setDraft] = React.useState(initial)
  const [saveState, setSaveState] = React.useState<'saved' | 'saving' | 'dirty' | 'error'>('saved')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<'publish' | 'pin' | 'remove' | null>(null)
  const first = React.useRef(true)
  const adapterRef = React.useRef(adapter)
  adapterRef.current = adapter

  React.useEffect(() => {
    if (readOnly) return
    if (first.current) { first.current = false; return }
    setSaveState('dirty')
    const timer = window.setTimeout(async () => {
      setSaveState('saving'); setError(null)
      try {
        const result = await adapterRef.current.save(draft)
        if (result.ok) { setSaveState('saved'); onSaved?.(draft) }
        else { setSaveState('error'); setError(result.error) }
      } catch (cause) {
        setSaveState('error'); setError(cause instanceof Error ? cause.message : 'The dashboard could not be saved.')
      }
    }, 600)
    return () => window.clearTimeout(timer)
  }, [draft, onSaved, readOnly])

  async function run(kind: NonNullable<typeof busy>, task: () => Promise<DashboardActionResult>, commit?: () => void) {
    setBusy(kind); setError(null)
    try {
      const result = await task()
      if (result.ok) commit?.()
      else setError(result.error)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `The dashboard ${kind} operation failed.`)
    } finally {
      setBusy(null)
    }
  }

  const nameValid = draft.name.trim().length > 0
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <header className="shrink-0 border-b border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h1 className="truncate text-xl font-semibold text-fg">{draft.name.trim() || 'Untitled dashboard'}</h1><Badge variant={draft.status === 'published' ? 'success' : 'outline'}>{draft.status === 'published' ? 'Published' : 'Draft'}</Badge></div>
            <p className="mt-1 text-xs text-fg-muted">{saveState === 'saving' ? 'Saving changes…' : saveState === 'dirty' ? 'Unsaved changes' : saveState === 'error' ? 'Save failed' : 'All changes saved'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {adapter.pin ? <Button type="button" variant="outline" size="sm" disabled={readOnly || busy !== null} onClick={() => void run('pin', () => adapter.pin!(!draft.pinned, draft), () => setDraft((current) => ({ ...current, pinned: !current.pinned })))}>{busy === 'pin' ? <Loader2 className="size-4 animate-spin" /> : draft.pinned ? <PinOff size={14} /> : <Pin size={14} />}{draft.pinned ? 'Unpin' : 'Pin to home'}</Button> : null}
            {adapter.remove ? <Button type="button" variant="ghost" size="sm" className="text-danger" disabled={readOnly || busy !== null} onClick={() => { if (globalThis.confirm('Delete this dashboard?')) void run('remove', () => adapter.remove!(draft), onRemoved) }}><Trash2 size={14} />Delete</Button> : null}
            {adapter.publish ? <Button type="button" variant={draft.status === 'published' ? 'outline' : 'default'} size="sm" disabled={readOnly || busy !== null || (!nameValid && draft.status !== 'published')} onClick={() => { const published = draft.status !== 'published'; void run('publish', () => adapter.publish!(published, draft), () => setDraft((current) => ({ ...current, status: published ? 'published' : 'draft' }))) }}>{busy === 'publish' ? <Loader2 className="size-4 animate-spin" /> : null}{draft.status === 'published' ? 'Unpublish' : 'Publish'}</Button> : null}
          </div>
        </div>
        {!readOnly ? <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"><div className="space-y-1.5"><Label htmlFor="dashboard-name">Name</Label><Input id="dashboard-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Operations overview" /></div><div className="space-y-1.5"><Label htmlFor="dashboard-description">Description</Label><Input id="dashboard-description" value={draft.description ?? ''} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value || null }))} placeholder="Optional" /></div></div> : draft.description ? <p className="mt-2 text-sm text-fg-muted">{draft.description}</p> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      </header>
      <main className="app-scroll min-h-0 flex-1 overflow-y-auto bg-bg p-5">
        <DashboardGrid
          initialLayout={draft.layout}
          nodes={nodes}
          items={items}
          categoryLabels={categoryLabels}
          mode={readOnly ? 'view' : 'edit'}
          onSave={readOnly ? undefined : async (layout) => {
            const next = { ...draft, layout }
            const result = await adapter.save(next)
            if (result.ok) { setDraft(next); onSaved?.(next) }
            return result
          }}
          emptyLabel={readOnly ? 'This dashboard has no cards yet.' : 'Add a card to build this dashboard.'}
        />
      </main>
    </div>
  )
}
