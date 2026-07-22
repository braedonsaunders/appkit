'use client'

import * as React from 'react'
import { Boxes, Store } from 'lucide-react'
import { AppLibrary, AppsStudio } from '@appkit/apps/react'
import type { AppFile, AppListing, AppMetaUpdate, AppRun, AppStatus, InstalledApp } from '@appkit/apps'
import { Button } from '@appkit/ui'

interface Snapshot {
  apps: InstalledApp[]
  files: Record<string, AppFile[]>
  runs: Record<string, AppRun[]>
  listings: AppListing[]
}

export function AppsWorkbench({ initial, capabilities }: { initial: Snapshot; capabilities: Array<{ key: string; label: string; description: string }> }) {
  const [snapshot, setSnapshot] = React.useState(() => normalize(initial))
  const [view, setView] = React.useState<'installed' | 'library'>('installed')

  async function mutate(payload: Record<string, unknown>): Promise<void> {
    const response = await fetch('/api/demo/apps', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await response.json() as Snapshot & { error?: string }
    if (!response.ok) throw new Error(data.error ?? 'Apps request failed')
    setSnapshot(normalize(data))
  }

  async function bridge(app: InstalledApp, request: { method: string; payload: unknown }) {
    const response = await fetch('/api/demo/apps', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'bridge', app, method: request.method, payload: request.payload }) })
    const data = await response.json() as { ok?: boolean; result?: unknown; error?: string }
    if (!response.ok || data.ok === false) throw new Error(data.error ?? 'Bridge call failed')
    fetch('/api/demo/apps').then(async (refresh) => setSnapshot(normalize(await refresh.json() as Snapshot))).catch((error: unknown) => console.error('Failed to refresh app run history', error))
    return data.result
  }

  return <div className="space-y-5">
    <div className="flex gap-2 border-b border-border">
      <ViewButton active={view === 'installed'} icon={<Boxes />} onClick={() => setView('installed')}>Installed</ViewButton>
      <ViewButton active={view === 'library'} icon={<Store />} onClick={() => setView('library')}>Library</ViewButton>
    </div>
    {view === 'installed' ? <AppsStudio
      apps={snapshot.apps}
      files={snapshot.files}
      runs={snapshot.runs}
      capabilities={capabilities}
      contextFor={(app) => ({ app: { id: app.id, key: app.key, name: app.name, version: app.version ?? '0.0.0' }, user: { id: 'demo-user', name: 'Jordan Lee', role: 'builder' }, tenant: { id: 'demo', name: 'Public demo' } })}
      onCreate={(name) => mutate({ action: 'create', name })}
      onImport={(bytes) => mutate({ action: 'import', bytes: [...bytes] })}
      onSaveMeta={(key, update: AppMetaUpdate) => mutate({ action: 'meta', key, update })}
      onSaveFile={(key, file) => mutate({ action: 'save-file', key, file })}
      onDeleteFile={(key, path) => mutate({ action: 'delete-file', key, path })}
      onStatusChange={(key, status: AppStatus) => mutate({ action: 'status', key, status })}
      onDelete={(key) => mutate({ action: 'delete', key })}
      onPublish={(key) => mutate({ action: 'publish', key })}
      onBridgeCall={bridge}
    /> : <AppLibrary listings={snapshot.listings} installedKeys={new Set(snapshot.apps.map((app) => app.key))} onInstall={() => setView('installed')} />}
  </div>
}

function ViewButton({ active, icon, onClick, children }: { active: boolean; icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" variant="ghost" onClick={onClick} className={active ? 'rounded-b-none border-b-2 border-primary text-primary' : 'rounded-b-none text-fg-muted'}><span className="[&>svg]:size-4">{icon}</span>{children}</Button>
}

function normalize(snapshot: Snapshot): Snapshot {
  return {
    apps: snapshot.apps,
    files: snapshot.files,
    runs: Object.fromEntries(Object.entries(snapshot.runs).map(([key, runs]) => [key, runs.map((run) => ({ ...run, at: new Date(run.at) }))])),
    listings: snapshot.listings.map((listing) => ({ ...listing, updatedAt: new Date(listing.updatedAt) })),
  }
}
