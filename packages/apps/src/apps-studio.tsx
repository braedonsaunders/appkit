'use client'

import * as React from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { Box, Braces, Check, ChevronDown, ChevronRight, File, FileArchive, FileCode2, FileImage, FilePlus2, FileText, Folder, FolderOpen, Globe2, PackagePlus, Palette, Plus, Search, ShieldCheck, Store, Trash2, Upload } from 'lucide-react'
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

interface TreeFolder {
  name: string
  path: string
  folders: TreeFolder[]
  files: AppFile[]
}

function buildTree(files: AppFile[]): TreeFolder {
  const root: TreeFolder = { name: '', path: '', folders: [], files: [] }
  const folderAt = (segments: string[]): TreeFolder => {
    let node = root
    let prefix = ''
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment
      let next = node.folders.find((folder) => folder.name === segment)
      if (!next) {
        next = { name: segment, path: prefix, folders: [], files: [] }
        node.folders.push(next)
      }
      node = next
    }
    return node
  }
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const parts = file.path.split('/')
    folderAt(parts.slice(0, -1)).files.push(file)
  }
  const sort = (folder: TreeFolder) => {
    folder.folders.sort((left, right) => left.name.localeCompare(right.name))
    folder.folders.forEach(sort)
  }
  sort(root)
  return root
}

function fileIcon(path: string) {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (extension === 'js' || extension === 'mjs') return <FileCode2 className="size-3.5 text-warning" />
  if (extension === 'html') return <FileCode2 className="size-3.5 text-danger" />
  if (extension === 'css') return <Palette className="size-3.5 text-info" />
  if (extension === 'json') return <Braces className="size-3.5 text-success" />
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return <FileImage className="size-3.5 text-primary" />
  if (extension === 'md' || extension === 'txt') return <FileText className="size-3.5 text-fg-subtle" />
  return <File className="size-3.5 text-fg-subtle" />
}

function editorExtensions(path: string) {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (extension === 'js' || extension === 'mjs') return [javascript()]
  if (extension === 'html') return [html()]
  if (extension === 'css') return [css()]
  if (extension === 'json') return [json()]
  return []
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
  const [tab, setTab] = React.useState<'overview' | 'files' | 'preview' | 'runs'>('overview')
  const [meta, setMeta] = React.useState(() => ({ name: app.name, description: app.description ?? '', iconKey: app.iconKey, version: app.version ?? '0.1.0', showInNav: app.showInNav, requestedPermissions: [...(app.manifest?.permissions ?? [])], grantedPermissions: [...app.grantedPermissions] }))
  const [selectedPath, setSelectedPath] = React.useState(app.manifest?.frontend.entry ?? files[0]?.path ?? '')
  const [draftFiles, setDraftFiles] = React.useState(() => new Map(files.map((file) => [file.path, { ...file }])))
  const [endpoints, setEndpoints] = React.useState<AppEndpoint[]>(() => structuredClone(app.manifest?.endpoints ?? []))
  const [busy, setBusy] = React.useState(false)
  const [newPath, setNewPath] = React.useState('')
  const [dirtyPaths, setDirtyPaths] = React.useState<Set<string>>(() => new Set())
  const [openDirs, setOpenDirs] = React.useState<Set<string>>(() => new Set(buildTree(files).folders.map((folder) => folder.path)))
  const uploadRef = React.useRef<HTMLInputElement>(null)
  const selectedFile = draftFiles.get(selectedPath)
  const fileList = [...draftFiles.values()].sort((left, right) => left.path.localeCompare(right.path))
  const tree = React.useMemo(() => buildTree(fileList), [draftFiles])
  const preview = app.manifest ? browserBundle({ ...app.manifest, endpoints }, fileList) : null

  async function saveMeta() {
    setBusy(true)
    try { await onSaveMeta(app.key, { ...meta, description: meta.description || null, endpoints }) } finally { setBusy(false) }
  }
  async function saveFile() {
    if (!selectedFile) return
    setBusy(true)
    try {
      await onSaveFile(app.key, { path: selectedFile.path, content: selectedFile.content, isBinary: selectedFile.isBinary })
      setDirtyPaths((current) => {
        const next = new Set(current)
        next.delete(selectedFile.path)
        return next
      })
    } finally { setBusy(false) }
  }
  async function addFile() {
    const path = newPath.trim()
    if (!path || draftFiles.has(path)) return
    const { contentType, binary } = contentTypeFor(path)
    const file: AppFile = { id: `draft-${path}`, tenantId: app.tenantId, appId: app.id, versionId: app.activeVersionId!, path, kind: path.startsWith('frontend/') ? 'frontend' : path.startsWith('backend/') ? 'backend' : path.startsWith('objects/') ? 'object' : 'asset', contentType, content: '', isBinary: binary, size: 0 }
    setDraftFiles((current) => new Map(current).set(path, file))
    setDirtyPaths((current) => new Set(current).add(path))
    setSelectedPath(path)
    setNewPath('')
  }
  async function removeFile() {
    if (!selectedFile) return
    await onDeleteFile(app.key, selectedFile.path)
    setDraftFiles((current) => { const next = new Map(current); next.delete(selectedFile.path); return next })
    setDirtyPaths((current) => { const next = new Set(current); next.delete(selectedFile.path); return next })
    setSelectedPath(fileList.find((file) => file.path !== selectedFile.path)?.path ?? '')
  }
  async function uploadFile(file: globalThis.File) {
    const path = `${selectedPath.split('/').slice(0, -1).join('/')}${selectedPath.includes('/') ? '/' : ''}${file.name}`
    const { contentType, binary } = contentTypeFor(path)
    const content = binary ? bytesToBase64(new Uint8Array(await file.arrayBuffer())) : await file.text()
    await onSaveFile(app.key, { path, content, isBinary: binary })
    const uploaded: AppFile = { id: `uploaded-${path}`, tenantId: app.tenantId, appId: app.id, versionId: app.activeVersionId!, path, kind: path.startsWith('frontend/') ? 'frontend' : path.startsWith('backend/') ? 'backend' : path.startsWith('objects/') ? 'object' : 'asset', contentType, content, isBinary: binary, size: binary ? file.size : content.length }
    setDraftFiles((current) => new Map(current).set(path, uploaded))
    setSelectedPath(path)
  }

  function toggleDir(path: string) {
    setOpenDirs((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function renderFolder(folder: TreeFolder, depth: number): React.ReactNode {
    return <div key={folder.path || 'root'}>
      {folder.path ? <button type="button" onClick={() => toggleDir(folder.path)} className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px] text-fg-muted hover:bg-surface-hover hover:text-fg" style={{ paddingLeft: `${depth * 14 + 8}px` }}>
        {openDirs.has(folder.path) ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {openDirs.has(folder.path) ? <FolderOpen className="size-3.5 text-primary" /> : <Folder className="size-3.5 text-primary" />}
        <span className="truncate">{folder.name}</span>
      </button> : null}
      {!folder.path || openDirs.has(folder.path) ? <>
        {folder.folders.map((child) => renderFolder(child, depth + (folder.path ? 1 : 0)))}
        {folder.files.map((file) => <button key={file.path} type="button" onClick={() => setSelectedPath(file.path)} className={cn('flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px] transition-colors', selectedPath === file.path ? 'bg-primary-subtle text-primary' : 'text-fg hover:bg-surface-hover')} style={{ paddingLeft: `${(depth + (folder.path ? 1 : 0)) * 14 + 26}px` }}>
          {fileIcon(file.path)}<span className="truncate">{file.path.split('/').pop()}</span>{dirtyPaths.has(file.path) ? <span className="ml-auto text-warning">●</span> : null}
        </button>)}
      </> : null}
    </div>
  }

  return <Drawer
    open
    onClose={onClose}
    title={app.name}
    description={`${app.key} · v${app.version}`}
    size="xl"
    bodyClassName="flex min-h-0 flex-col overflow-hidden px-6 py-5"
    headerActions={<>
      {tab === 'overview' ? <Button size="sm" onClick={saveMeta} disabled={busy || !meta.name.trim()}><Check className="size-4" /> Save settings</Button> : null}
      {tab === 'files' ? <Button size="sm" onClick={saveFile} disabled={busy || !selectedFile || selectedFile.isBinary || !dirtyPaths.has(selectedFile.path)}><Check className="size-4" /> {dirtyPaths.has(selectedFile?.path ?? '') ? 'Save file' : 'Saved'}</Button> : null}
    </>}
  >
    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-1">
      <Tab active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</Tab>
      <Tab active={tab === 'files'} onClick={() => setTab('files')}>Files</Tab>
      <Tab active={tab === 'preview'} onClick={() => setTab('preview')}>Preview</Tab>
      <Tab active={tab === 'runs'} onClick={() => setTab('runs')}>Runs{runs.length ? <span className="ml-1.5 rounded-full bg-bg-subtle px-1.5 text-[11px] text-fg-muted">{runs.length}</span> : null}</Tab>
    </div>
    <div key={tab} className="min-h-0 flex-1 overflow-y-auto p-1 pt-4">
      {tab === 'overview' ? <div className="mx-auto max-w-3xl space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name"><Input value={meta.name} onChange={(event) => setMeta((current) => ({ ...current, name: event.currentTarget.value }))} /></Field>
          <Field label="Version"><Input value={meta.version} onChange={(event) => setMeta((current) => ({ ...current, version: event.currentTarget.value }))} /></Field>
          <Field label="Icon key"><Input value={meta.iconKey} onChange={(event) => setMeta((current) => ({ ...current, iconKey: event.currentTarget.value }))} /></Field>
          <label className="flex items-center gap-3 self-end rounded-lg border border-border bg-bg-subtle px-4 py-3 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={meta.showInNav} onChange={(event) => setMeta((current) => ({ ...current, showInNav: event.currentTarget.checked }))} /> Show in navigation</label>
          <Field label="Description" className="sm:col-span-2"><Textarea value={meta.description} onChange={(event) => setMeta((current) => ({ ...current, description: event.currentTarget.value }))} rows={3} /></Field>
        </div>
        <section className="space-y-3"><div><h3 className="font-semibold text-fg">Capabilities</h3><p className="text-sm text-fg-muted">Requested capabilities are granted explicitly and intersected with the invoking user.</p></div><div className="grid gap-2 sm:grid-cols-2">{capabilities.map((capability) => { const requested = meta.requestedPermissions.includes(capability.key); const granted = meta.grantedPermissions.includes(capability.key); return <div key={capability.key} className={cn('rounded-lg border p-3', requested ? 'border-border bg-surface' : 'border-border-subtle bg-bg-subtle')}><span className="block text-sm font-medium text-fg">{capability.label}</span><span className="block text-xs leading-5 text-fg-muted">{capability.description}</span><span className="mt-3 flex gap-4 text-xs text-fg-muted"><label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-primary" checked={requested} onChange={(event) => setMeta((current) => ({ ...current, requestedPermissions: event.currentTarget.checked ? [...current.requestedPermissions, capability.key] : current.requestedPermissions.filter((key) => key !== capability.key), grantedPermissions: event.currentTarget.checked ? current.grantedPermissions : current.grantedPermissions.filter((key) => key !== capability.key) }))} /> Requested</label><label className={cn('flex items-center gap-2', !requested && 'opacity-50')}><input type="checkbox" className="size-4 accent-primary" disabled={!requested} checked={granted} onChange={(event) => setMeta((current) => ({ ...current, grantedPermissions: event.currentTarget.checked ? [...current.grantedPermissions, capability.key] : current.grantedPermissions.filter((key) => key !== capability.key) }))} /> Granted</label></span></div> })}</div></section>
        <EndpointEditor endpoints={endpoints} files={fileList} onChange={setEndpoints} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void onPublish(app.key)}><Globe2 className="size-4" /> Publish</Button><Button size="sm" variant="outline" onClick={() => void onStatusChange(app.key, app.status === 'installed' ? 'disabled' : 'installed')}>{app.status === 'installed' ? 'Disable' : 'Enable'}</Button></div><Button size="sm" variant="destructive" onClick={() => void onDelete(app.key)}><Trash2 className="size-4" /> Delete app</Button></div>
      </div> : null}
      {tab === 'files' ? <div className="flex h-[calc(100vh-16rem)] min-h-[420px] overflow-hidden rounded-lg border border-border">
        <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-bg-subtle">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5"><input ref={uploadRef} type="file" className="hidden" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadFile(file); event.currentTarget.value = '' }} /><Button size="sm" variant="ghost" title="New file" onClick={() => setNewPath((current) => current || `${selectedPath.split('/').slice(0, -1).join('/')}/`)}><FilePlus2 className="size-4" /></Button><Button size="sm" variant="ghost" title="Upload file" onClick={() => uploadRef.current?.click()}><Upload className="size-4" /></Button><Button size="sm" variant="ghost" title="Delete file" disabled={!selectedFile || selectedFile.path === app.manifest?.frontend.entry || endpoints.some((endpoint) => endpoint.file === selectedFile.path)} onClick={removeFile}><Trash2 className="size-4" /></Button></div>
          {newPath ? <div className="flex gap-1 border-b border-border p-2"><Input autoFocus value={newPath} onChange={(event) => setNewPath(event.currentTarget.value)} placeholder="frontend/file.js" className="h-8 text-xs" onKeyDown={(event) => { if (event.key === 'Enter') void addFile(); if (event.key === 'Escape') setNewPath('') }} /><Button size="sm" onClick={addFile}>Add</Button></div> : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-1">{renderFolder(tree, 0)}</div>
        </aside>
        <section className="min-w-0 flex-1 bg-bg">{selectedFile ? <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5"><span className="truncate font-mono text-xs text-fg-muted">{selectedFile.path}{dirtyPaths.has(selectedFile.path) ? <span className="ml-1 text-warning">●</span> : null}</span><span className="text-[11px] text-fg-subtle">{selectedFile.kind}</span></div>
          {selectedFile.isBinary ? <div className="grid flex-1 place-items-center"><div className="text-center text-sm text-fg-muted"><FileImage className="mx-auto mb-2 size-8 text-fg-subtle" /><p className="font-mono text-xs">{selectedFile.path}</p><p className="mt-1 text-xs">Binary file · {selectedFile.contentType} · {selectedFile.size.toLocaleString()} bytes</p></div></div> : <div className="min-h-0 flex-1 overflow-auto"><CodeMirror className="appkit-code-editor" value={selectedFile.content} onChange={(value) => { setDraftFiles((current) => { const next = new Map(current); next.set(selectedFile.path, { ...selectedFile, content: value, size: value.length }); return next }); setDirtyPaths((current) => new Set(current).add(selectedFile.path)) }} extensions={editorExtensions(selectedFile.path)} theme="dark" height="100%" basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: true }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); void saveFile() } }} /></div>}
        </div> : <div className="grid h-full place-items-center text-sm text-fg-muted">Select or create a file.</div>}</section>
      </div> : null}
      {tab === 'preview' ? <div className="rounded-lg bg-bg-subtle p-4">{preview ? <div className="mx-auto max-w-6xl overflow-hidden rounded-xl border border-border bg-surface shadow-lg"><div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-fg-muted"><span className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-success" /> Opaque-origin sandbox</span><span>No cookies · no parent DOM · no ambient network</span></div><AppFrame appKey={app.key} context={context} bundle={preview} onBridgeCall={onBridgeCall} /></div> : <div className="grid min-h-80 place-items-center text-sm text-fg-muted">The frontend entry file is missing.</div>}</div> : null}
      {tab === 'runs' ? <AppRuns runs={runs} /> : null}
    </div>
  </Drawer>
}

type AppFramePropsBridge = (request: { method: BridgeMethod; payload: unknown }) => Promise<unknown>

function EndpointEditor({ endpoints, files, onChange }: { endpoints: AppEndpoint[]; files: AppFile[]; onChange: (value: AppEndpoint[]) => void }) {
  const backendFiles = files.filter((file) => file.kind === 'backend' || file.path.startsWith('backend/'))
  return <section className="space-y-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-fg">Backend endpoints</h3><p className="text-sm text-fg-muted">Each handler runs in QuickJS with governed host capabilities.</p></div><Button size="sm" variant="outline" onClick={() => onChange([...endpoints, { name: `endpoint-${endpoints.length + 1}`, file: backendFiles[0]?.path ?? 'backend/handler.js', method: 'POST' }])}><Plus className="size-4" /> Add endpoint</Button></div>{endpoints.map((endpoint, index) => <div key={`${endpoint.name}-${index}`} className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[1fr_8rem_1.4fr_auto]"><Field label="Name"><Input value={endpoint.name} onChange={(event) => onChange(replaceAt(endpoints, index, { ...endpoint, name: event.currentTarget.value }))} /></Field><Field label="Method"><Select value={endpoint.method} onChange={(event) => onChange(replaceAt(endpoints, index, { ...endpoint, method: event.currentTarget.value as AppEndpoint['method'] }))}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ANY'].map((method) => <option key={method}>{method}</option>)}</Select></Field><Field label="Handler file"><Select value={endpoint.file} onChange={(event) => onChange(replaceAt(endpoints, index, { ...endpoint, file: event.currentTarget.value }))}>{backendFiles.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}</Select></Field><Button size="icon" variant="ghost" className="self-end" onClick={() => onChange(endpoints.filter((_, candidate) => candidate !== index))} aria-label={`Delete ${endpoint.name}`}><Trash2 className="size-4" /></Button></div>)}{!endpoints.length ? <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-border text-sm text-fg-muted">This app has no backend endpoints.</div> : null}</section>
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

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={cn('-mb-px flex shrink-0 items-center border-b-2 px-3 py-2 text-sm font-medium transition-colors', active ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg')}>{children}</button> }
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) { return <div className={cn('space-y-2', className)}><Label>{label}</Label>{children}</div> }
function Log({ title, value }: { title: string; value: string }) { return <section className="space-y-2"><h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{title}</h3><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-subtle p-4 font-mono text-xs leading-5 text-fg">{value}</pre></section> }
function replaceAt<T>(values: T[], index: number, value: T): T[] { return values.map((current, candidate) => candidate === index ? value : current) }
function formatDate(value: Date): string { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value) }

function bytesToBase64(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}

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
