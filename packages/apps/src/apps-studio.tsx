'use client'

import * as React from 'react'
import { Box, Check, Code2, Eye, File, FileArchive, Globe2, History, PackagePlus, Plus, Search, Settings2, ShieldCheck, Store, Trash2, Upload } from 'lucide-react'
import { Badge, Button, Drawer, Input, Label, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, cn } from '@appkit/ui'
import type { AppFile, AppListing, AppMetaUpdate, AppRun, AppStatus, InstalledApp } from './index'
import type { AppBundleFile } from './bundle'
import type { AppEndpoint, AppManifest } from './manifest'
import { contentTypeFor } from './manifest'
import { AppFrame } from './app-frame'
import type { BridgeContext, BridgeMethod } from './bridge'

export interface AppsStudioProps {
  apps: InstalledApp[]
  files: Record<string, AppFile[]>
  runs?: Record<string, AppRun[]>
  capabilities: Array<{ key: string; label: string; description: string }>
  contextFor: (app: InstalledApp) => BridgeContext
  selectedKey?: string | 'new' | null
  onSelectedKeyChange?: (key: string | 'new' | null) => void
  onCreate: (name: string) => Promise<void> | void
  onImport: (archive: Uint8Array) => Promise<void> | void
  onSaveMeta: (key: string, update: AppMetaUpdate) => Promise<void> | void
  onSaveFile: (key: string, file: AppBundleFile) => Promise<void> | void
  onDeleteFile: (key: string, path: string) => Promise<void> | void
  onStatusChange: (key: string, status: AppStatus) => Promise<void> | void
  onDelete: (key: string) => Promise<void> | void
  onPublish: (key: string) => Promise<void> | void
  onBridgeCall: (app: InstalledApp, request: { method: BridgeMethod; payload: unknown }) => Promise<unknown>
  className?: string
}

export interface AppLibraryProps {
  listings: AppListing[]
  installedKeys?: ReadonlySet<string>
  onInstall: (listing: AppListing) => Promise<void> | void
  className?: string
}

export function AppsStudio(props: AppsStudioProps) {
  const [internalSelected, setInternalSelected] = React.useState<string | 'new' | null>(null)
  const [query, setQuery] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const currentKey = props.selectedKey === undefined ? internalSelected : props.selectedKey
  const choose = (key: string | 'new' | null) => {
    if (props.selectedKey === undefined) setInternalSelected(key)
    props.onSelectedKeyChange?.(key)
  }
  const selected = currentKey && currentKey !== 'new' ? props.apps.find((app) => app.key === currentKey) ?? null : null
  const filtered = props.apps.filter((app) => `${app.name} ${app.key} ${app.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))

  async function create() {
    if (!newName.trim()) return
    setCreating(true)
    try { await props.onCreate(newName.trim()); setNewName(''); choose(null) } finally { setCreating(false) }
  }

  async function importArchive(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    await props.onImport(new Uint8Array(await file.arrayBuffer()))
    event.currentTarget.value = ''
  }

  return (
    <div className={cn('space-y-4', props.className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-64 flex-1 sm:max-w-sm"><Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" /><Input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search installed apps" className="pl-9" /></div>
        <div className="flex gap-2">
          <label className="inline-flex"><input type="file" accept=".zip,application/zip" className="sr-only" onChange={importArchive} /><span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg shadow-sm hover:bg-surface-hover"><Upload className="size-4" /> Import ZIP</span></label>
          <Button onClick={() => choose('new')}><Plus className="size-4" /> New app</Button>
        </div>
      </div>
      <Table>
        <TableHeader><TableRow noAnimate><TableHead>App</TableHead><TableHead>Version</TableHead><TableHead>Capabilities</TableHead><TableHead>Navigation</TableHead><TableHead>Last run</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {filtered.map((app) => {
            const latest = props.runs?.[app.id]?.[0]
            return <TableRow key={app.id} className="cursor-pointer" onClick={() => choose(app.key)}><TableCell><span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-primary-subtle text-primary"><Box className="size-4" /></span><span><span className="block font-medium text-fg">{app.name}</span><span className="text-xs text-fg-muted">{app.key}</span></span></span></TableCell><TableCell className="font-mono text-xs">{app.version}</TableCell><TableCell><span className="text-sm text-fg-muted">{app.grantedPermissions.length} granted</span></TableCell><TableCell>{app.showInNav ? 'Shown' : 'Hidden'}</TableCell><TableCell className="text-fg-muted">{latest ? formatDate(latest.at) : 'Never'}</TableCell><TableCell><Badge variant={app.status === 'installed' ? 'success' : 'outline'}>{app.status === 'installed' ? 'Installed' : 'Disabled'}</Badge></TableCell></TableRow>
          })}
          {!filtered.length ? <TableRow><TableCell colSpan={6} className="py-14 text-center text-fg-muted">No installed apps match this view.</TableCell></TableRow> : null}
        </TableBody>
      </Table>
      <Drawer open={currentKey === 'new'} onClose={() => choose(null)} title="New app" description="Create an editable app bundle with a frontend and governed backend endpoint." size="md" footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" onClick={() => choose(null)}>Cancel</Button><Button onClick={create} disabled={creating || !newName.trim()}><PackagePlus className="size-4" /> Create app</Button></div>}><div className="space-y-2"><Label htmlFor="new-app-name">App name</Label><Input id="new-app-name" autoFocus value={newName} onChange={(event) => setNewName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') void create() }} placeholder="Operations console" /></div></Drawer>
      {selected ? <AppEditorDrawer key={selected.id} app={selected} files={props.files[selected.id] ?? []} runs={props.runs?.[selected.id] ?? []} capabilities={props.capabilities} context={props.contextFor(selected)} onClose={() => choose(null)} onSaveMeta={props.onSaveMeta} onSaveFile={props.onSaveFile} onDeleteFile={props.onDeleteFile} onStatusChange={props.onStatusChange} onDelete={props.onDelete} onPublish={props.onPublish} onBridgeCall={(request) => props.onBridgeCall(selected, request)} /> : null}
    </div>
  )
}

function AppEditorDrawer({ app, files, runs, capabilities, context, onClose, onSaveMeta, onSaveFile, onDeleteFile, onStatusChange, onDelete, onPublish, onBridgeCall }: {
  app: InstalledApp
  files: AppFile[]
  runs: AppRun[]
  capabilities: AppsStudioProps['capabilities']
  context: BridgeContext
  onClose: () => void
  onSaveMeta: AppsStudioProps['onSaveMeta']
  onSaveFile: AppsStudioProps['onSaveFile']
  onDeleteFile: AppsStudioProps['onDeleteFile']
  onStatusChange: AppsStudioProps['onStatusChange']
  onDelete: AppsStudioProps['onDelete']
  onPublish: AppsStudioProps['onPublish']
  onBridgeCall: AppFramePropsBridge
}) {
  const [tab, setTab] = React.useState<'general' | 'files' | 'endpoints' | 'preview' | 'runs'>('general')
  const [meta, setMeta] = React.useState(() => ({ name: app.name, description: app.description ?? '', iconKey: app.iconKey, version: app.version ?? '0.1.0', showInNav: app.showInNav, requestedPermissions: [...(app.manifest?.permissions ?? [])], grantedPermissions: [...app.grantedPermissions] }))
  const [selectedPath, setSelectedPath] = React.useState(app.manifest?.frontend.entry ?? files[0]?.path ?? '')
  const [draftFiles, setDraftFiles] = React.useState(() => new Map(files.map((file) => [file.path, { ...file }])))
  const [endpoints, setEndpoints] = React.useState<AppEndpoint[]>(() => structuredClone(app.manifest?.endpoints ?? []))
  const [busy, setBusy] = React.useState(false)
  const [newPath, setNewPath] = React.useState('')
  const selectedFile = draftFiles.get(selectedPath)
  const fileList = [...draftFiles.values()].sort((left, right) => left.path.localeCompare(right.path))
  const preview = app.manifest ? browserBundle({ ...app.manifest, endpoints }, fileList) : null

  async function saveMeta() {
    setBusy(true)
    try { await onSaveMeta(app.key, { ...meta, description: meta.description || null, endpoints }) } finally { setBusy(false) }
  }
  async function saveFile() {
    if (!selectedFile) return
    setBusy(true)
    try { await onSaveFile(app.key, { path: selectedFile.path, content: selectedFile.content, isBinary: selectedFile.isBinary }) } finally { setBusy(false) }
  }
  async function addFile() {
    const path = newPath.trim()
    if (!path || draftFiles.has(path)) return
    const { contentType, binary } = contentTypeFor(path)
    const file: AppFile = { id: `draft-${path}`, tenantId: app.tenantId, appId: app.id, versionId: app.activeVersionId!, path, kind: path.startsWith('frontend/') ? 'frontend' : path.startsWith('backend/') ? 'backend' : path.startsWith('objects/') ? 'object' : 'asset', contentType, content: '', isBinary: binary, size: 0 }
    setDraftFiles((current) => new Map(current).set(path, file)); setSelectedPath(path); setNewPath('')
  }
  async function removeFile() {
    if (!selectedFile) return
    await onDeleteFile(app.key, selectedFile.path)
    setDraftFiles((current) => { const next = new Map(current); next.delete(selectedFile.path); return next })
    setSelectedPath(fileList.find((file) => file.path !== selectedFile.path)?.path ?? '')
  }

  return <Drawer open onClose={onClose} title={app.name} description={`${app.key} · ${app.version}`} size="2xl" initialFullscreen bodyClassName="flex min-h-0 flex-col overflow-hidden p-0" headerActions={<><Button size="sm" variant="outline" onClick={() => void onPublish(app.key)}><Globe2 className="size-4" /> Publish</Button><Button size="sm" variant="outline" onClick={() => void onStatusChange(app.key, app.status === 'installed' ? 'disabled' : 'installed')}>{app.status === 'installed' ? 'Disable' : 'Enable'}</Button></>}>
    <div className="flex shrink-0 overflow-x-auto border-b border-border px-5"><Tab active={tab === 'general'} icon={<Settings2 />} onClick={() => setTab('general')}>General</Tab><Tab active={tab === 'files'} icon={<File />} onClick={() => setTab('files')}>Files <span>{fileList.length}</span></Tab><Tab active={tab === 'endpoints'} icon={<Code2 />} onClick={() => setTab('endpoints')}>Endpoints <span>{endpoints.length}</span></Tab><Tab active={tab === 'preview'} icon={<Eye />} onClick={() => setTab('preview')}>Preview</Tab><Tab active={tab === 'runs'} icon={<History />} onClick={() => setTab('runs')}>Runs <span>{runs.length}</span></Tab></div>
    <div className="min-h-0 flex-1 overflow-hidden">
      {tab === 'general' ? <div className="h-full overflow-auto p-6"><div className="mx-auto max-w-3xl space-y-6"><div className="grid gap-5 sm:grid-cols-2"><Field label="Name"><Input value={meta.name} onChange={(event) => { const value = event.currentTarget.value; setMeta((current) => ({ ...current, name: value })) }} /></Field><Field label="Version"><Input value={meta.version} onChange={(event) => { const value = event.currentTarget.value; setMeta((current) => ({ ...current, version: value })) }} /></Field><Field label="Icon key"><Input value={meta.iconKey} onChange={(event) => { const value = event.currentTarget.value; setMeta((current) => ({ ...current, iconKey: value })) }} /></Field><label className="flex items-center gap-3 self-end rounded-lg border border-border bg-bg-subtle px-4 py-3 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={meta.showInNav} onChange={(event) => { const checked = event.currentTarget.checked; setMeta((current) => ({ ...current, showInNav: checked })) }} /> Show in navigation</label><Field label="Description" className="sm:col-span-2"><Textarea value={meta.description} onChange={(event) => { const value = event.currentTarget.value; setMeta((current) => ({ ...current, description: value })) }} rows={4} /></Field></div><section className="space-y-3"><div><h3 className="font-semibold text-fg">Capabilities</h3><p className="text-sm text-fg-muted">Authors request capabilities in the manifest. Administrators grant a subset; the runtime intersects those grants with the invoking user.</p></div><div className="grid gap-2 sm:grid-cols-2">{capabilities.map((capability) => { const requested = meta.requestedPermissions.includes(capability.key); const granted = meta.grantedPermissions.includes(capability.key); return <div key={capability.key} className={cn('rounded-lg border p-3', requested ? 'border-border bg-surface' : 'border-border-subtle bg-bg-subtle')}><span className="block text-sm font-medium text-fg">{capability.label}</span><span className="block text-xs leading-5 text-fg-muted">{capability.description}</span><span className="mt-3 flex gap-4 text-xs text-fg-muted"><label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-primary" checked={requested} onChange={(event) => { const checked = event.currentTarget.checked; setMeta((current) => ({ ...current, requestedPermissions: checked ? [...current.requestedPermissions, capability.key] : current.requestedPermissions.filter((key) => key !== capability.key), grantedPermissions: checked ? current.grantedPermissions : current.grantedPermissions.filter((key) => key !== capability.key) })) }} /> Requested</label><label className={cn('flex items-center gap-2', !requested && 'opacity-50')}><input type="checkbox" className="size-4 accent-primary" disabled={!requested} checked={granted} onChange={(event) => { const checked = event.currentTarget.checked; setMeta((current) => ({ ...current, grantedPermissions: checked ? [...current.grantedPermissions, capability.key] : current.grantedPermissions.filter((key) => key !== capability.key) })) }} /> Granted</label></span></div> })}</div></section><div className="flex justify-between border-t border-border pt-5"><Button variant="destructive" onClick={() => void onDelete(app.key)}><Trash2 className="size-4" /> Delete app</Button><Button onClick={saveMeta} disabled={busy}><Check className="size-4" /> Save settings</Button></div></div></div> : null}
      {tab === 'files' ? <div className="grid h-full min-h-[34rem] grid-cols-[minmax(14rem,1fr)_minmax(0,2fr)]"><aside className="flex min-h-0 flex-col border-r border-border bg-bg-subtle"><div className="flex gap-2 border-b border-border p-3"><Input value={newPath} onChange={(event) => setNewPath(event.currentTarget.value)} placeholder="frontend/file.js" className="h-8 text-xs" onKeyDown={(event) => { if (event.key === 'Enter') void addFile() }} /><Button size="icon" variant="outline" onClick={addFile} aria-label="Add file"><Plus className="size-4" /></Button></div><div className="min-h-0 flex-1 overflow-auto p-2">{fileList.map((file) => <button key={file.path} type="button" onClick={() => setSelectedPath(file.path)} className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs', file.path === selectedPath ? 'bg-primary-subtle text-primary' : 'text-fg-muted hover:bg-surface-hover hover:text-fg')}><File className="size-3.5 shrink-0" /><span className="min-w-0 truncate">{file.path}</span><Badge variant="outline" className="ml-auto text-[10px]">{file.kind}</Badge></button>)}</div></aside><section className="flex min-h-0 min-w-0 flex-col">{selectedFile ? <><div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2"><span className="truncate font-mono text-xs text-fg-muted">{selectedFile.path}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={removeFile} disabled={selectedFile.path === app.manifest?.frontend.entry || endpoints.some((endpoint) => endpoint.file === selectedFile.path)}><Trash2 className="size-3.5" /> Delete</Button><Button size="sm" onClick={saveFile} disabled={busy || selectedFile.isBinary}><Check className="size-3.5" /> Save</Button></div></div>{selectedFile.isBinary ? <div className="grid flex-1 place-items-center text-sm text-fg-muted">Binary asset · {selectedFile.size} encoded bytes</div> : <textarea spellCheck={false} aria-label={`Edit ${selectedFile.path}`} value={selectedFile.content} onChange={(event) => { const value = event.currentTarget.value; setDraftFiles((current) => { const next = new Map(current); next.set(selectedFile.path, { ...selectedFile, content: value, size: value.length }); return next }) }} className="min-h-0 flex-1 resize-none border-0 bg-bg p-4 font-mono text-[13px] leading-6 text-fg outline-none" />}</> : <div className="grid flex-1 place-items-center text-sm text-fg-muted">Select or create a file.</div>}</section></div> : null}
      {tab === 'endpoints' ? <EndpointEditor endpoints={endpoints} files={fileList} onChange={setEndpoints} onSave={saveMeta} busy={busy} /> : null}
      {tab === 'preview' ? <div className="h-full overflow-auto bg-bg-subtle p-4">{preview ? <div className="mx-auto max-w-6xl overflow-hidden rounded-xl border border-border bg-surface shadow-lg"><div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-fg-muted"><span className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-success" /> Opaque-origin sandbox</span><span>No cookies · no parent DOM · no ambient network</span></div><AppFrame appKey={app.key} context={context} bundle={preview} onBridgeCall={onBridgeCall} /></div> : <div className="grid min-h-80 place-items-center text-sm text-fg-muted">The frontend entry file is missing.</div>}</div> : null}
      {tab === 'runs' ? <AppRuns runs={runs} /> : null}
    </div>
  </Drawer>
}

type AppFramePropsBridge = (request: { method: BridgeMethod; payload: unknown }) => Promise<unknown>

function EndpointEditor({ endpoints, files, onChange, onSave, busy }: { endpoints: AppEndpoint[]; files: AppFile[]; onChange: (value: AppEndpoint[]) => void; onSave: () => Promise<void>; busy: boolean }) {
  const backendFiles = files.filter((file) => file.kind === 'backend' || file.path.startsWith('backend/'))
  return <div className="h-full overflow-auto p-6"><div className="mx-auto max-w-4xl space-y-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-fg">Backend endpoints</h3><p className="text-sm text-fg-muted">Each handler runs in QuickJS with governed host capabilities.</p></div><Button variant="outline" onClick={() => onChange([...endpoints, { name: `endpoint-${endpoints.length + 1}`, file: backendFiles[0]?.path ?? 'backend/handler.js', method: 'POST' }])}><Plus className="size-4" /> Add endpoint</Button></div>{endpoints.map((endpoint, index) => <div key={`${endpoint.name}-${index}`} className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[1fr_9rem_1.4fr_auto]"><Field label="Name"><Input value={endpoint.name} onChange={(event) => onChange(replaceAt(endpoints, index, { ...endpoint, name: event.currentTarget.value }))} /></Field><Field label="Method"><Select value={endpoint.method} onChange={(event) => onChange(replaceAt(endpoints, index, { ...endpoint, method: event.currentTarget.value as AppEndpoint['method'] }))}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ANY'].map((method) => <option key={method}>{method}</option>)}</Select></Field><Field label="Handler file"><Select value={endpoint.file} onChange={(event) => onChange(replaceAt(endpoints, index, { ...endpoint, file: event.currentTarget.value }))}>{backendFiles.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}</Select></Field><Button size="icon" variant="ghost" className="self-end" onClick={() => onChange(endpoints.filter((_, candidate) => candidate !== index))} aria-label={`Delete ${endpoint.name}`}><Trash2 className="size-4" /></Button></div>)}{!endpoints.length ? <div className="grid min-h-52 place-items-center rounded-lg border border-dashed border-border text-sm text-fg-muted">This app has no backend endpoints.</div> : null}<div className="flex justify-end"><Button onClick={onSave} disabled={busy}><Check className="size-4" /> Save endpoints</Button></div></div></div>
}

function AppRuns({ runs }: { runs: AppRun[] }) {
  const [selected, setSelected] = React.useState(0)
  const run = runs[selected]
  if (!runs.length) return <div className="grid h-full min-h-80 place-items-center text-sm text-fg-muted">No backend calls have run yet.</div>
  return <div className="grid h-full min-h-[34rem] lg:grid-cols-[minmax(17rem,1fr)_2fr]"><aside className="overflow-auto border-r border-border p-2">{runs.map((item, index) => <button key={`${item.at.toISOString()}-${index}`} type="button" onClick={() => setSelected(index)} className={cn('flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left', selected === index ? 'bg-primary-subtle' : 'hover:bg-surface-hover')}><span><span className="block text-sm font-medium text-fg">{item.endpoint}</span><span className="text-xs text-fg-muted">{formatDate(item.at)} · {item.durationMs} ms</span></span><Badge variant={item.status === 'ok' ? 'success' : 'destructive'}>{item.status}</Badge></button>)}</aside><section className="min-w-0 space-y-4 overflow-auto p-5">{run?.errorMessage ? <div className="rounded-md border border-danger bg-danger-subtle p-3 text-sm text-danger">{run.errorMessage}</div> : null}<Log title="Governance" value={`${run?.units ?? 0} units · ${run?.durationMs ?? 0} ms`} /><Log title="Console" value={run?.logs.join('\n') || 'No log output.'} /></section></div>
}

export function AppLibrary({ listings, installedKeys = new Set(), onInstall, className }: AppLibraryProps) {
  return <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', className)}>{listings.map((listing) => { const installed = installedKeys.has(listing.key); return <article key={listing.id} className="flex min-h-56 flex-col rounded-xl border border-border bg-surface p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-xl bg-primary-subtle text-primary"><Store className="size-5" /></span><Badge variant="outline">v{listing.version}</Badge></div><h3 className="mt-4 text-lg font-semibold text-fg">{listing.name}</h3><p className="mt-1 line-clamp-3 flex-1 text-sm leading-6 text-fg-muted">{listing.description || 'No description provided.'}</p><div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-fg-subtle">{listing.manifest.permissions.length} capabilities requested</span><Button size="sm" disabled={installed} onClick={() => void onInstall(listing)}>{installed ? <Check className="size-4" /> : <FileArchive className="size-4" />}{installed ? 'Installed' : 'Install'}</Button></div></article> })}</div>
}

function Tab({ active, icon, onClick, children }: { active: boolean; icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={cn('flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium [&>svg]:size-4', active ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg')}>{icon}{children}</button> }
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) { return <div className={cn('space-y-2', className)}><Label>{label}</Label>{children}</div> }
function Log({ title, value }: { title: string; value: string }) { return <section className="space-y-2"><h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{title}</h3><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-subtle p-4 font-mono text-xs leading-5 text-fg">{value}</pre></section> }
function replaceAt<T>(values: T[], index: number, value: T): T[] { return values.map((current, candidate) => candidate === index ? value : current) }
function formatDate(value: Date): string { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value) }

function browserBundle(manifest: AppManifest, files: AppFile[]): { entry: string; entryHtml: string; replacements: Record<string, string> } | null {
  const entry = files.find((file) => file.path === manifest.frontend.entry)
  if (!entry) return null
  const replacements: Record<string, string> = {}
  for (const file of files) {
    if (file.path === entry.path || file.kind === 'backend' || file.kind === 'object') continue
    const base64 = file.isBinary ? file.content : btoa(unescape(encodeURIComponent(file.content)))
    replacements[file.path] = `data:${file.contentType.replace(/;\s*/g, ';')};base64,${base64}`
  }
  return { entry: entry.path, entryHtml: entry.content, replacements }
}
