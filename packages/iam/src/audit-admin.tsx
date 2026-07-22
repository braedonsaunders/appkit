'use client'

import * as React from 'react'
import {
  Badge,
  Drawer,
  EmptyState,
  Input,
  SearchSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@appkit/ui'
import { Braces, ChevronRight, Clock3, Database, Fingerprint, History, Search, ScrollText, UserRound } from 'lucide-react'
import type { AuditEventRecord, IamAdminService } from './types'

type DrawerTab = 'changes' | 'before' | 'after'
type JsonObject = Record<string, unknown>
type DiffRow = { path: string; before: unknown; after: unknown }

const ACTION_VARIANT: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  insert: 'success', create: 'success', update: 'secondary', delete: 'destructive',
  post: 'success', void: 'warning', approve: 'success', reject: 'destructive',
}

export function AuditAdmin({
  service,
  title = 'Audit log',
  description = 'Search activity and inspect field-level changes, snapshots, and request context.',
  onError,
}: {
  service: IamAdminService
  title?: string
  description?: string
  onError?: (error: unknown) => void
}) {
  const [events, setEvents] = React.useState<AuditEventRecord[]>([])
  const [query, setQuery] = React.useState('')
  const [action, setAction] = React.useState('')
  const [recordType, setRecordType] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await service.listAuditEvents({ perPage: 100, sort: 'at', direction: 'desc' })
      setEvents(result.rows)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load audit events.')
      onError?.(cause)
    } finally {
      setLoading(false)
    }
  }, [onError, service])

  React.useEffect(() => { void load() }, [load])
  const actions = [...new Set(events.map((event) => event.action))].sort()
  const recordTypes = [...new Set(events.map((event) => event.recordType))].sort()
  const normalized = query.trim().toLocaleLowerCase()
  const visible = events.filter((event) => {
    if (action && event.action !== action) return false
    if (recordType && event.recordType !== recordType) return false
    return !normalized || `${event.actorName ?? ''} ${event.action} ${event.recordType} ${event.summary ?? ''} ${event.recordId ?? ''}`.toLocaleLowerCase().includes(normalized)
  })
  const selected = events.find((event) => event.id === selectedId) ?? null

  return <div className="flex min-h-0 flex-1 flex-col gap-5">
    <div><h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1><p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p></div>
    <div className="flex flex-wrap gap-2"><div className="relative min-w-64 flex-1 sm:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actor, action, record, or reference…" className="pl-9" /></div><div className="w-40"><SearchSelect value={action} onChange={setAction} options={[{ value: '', label: 'All actions' }, ...actions.map((value) => ({ value, label: humanize(value) }))]} /></div><div className="w-48"><SearchSelect value={recordType} onChange={setRecordType} options={[{ value: '', label: 'All record types' }, ...recordTypes.map((value) => ({ value, label: humanize(value) }))]} /></div></div>
    {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</div> : null}
    <div className="overflow-hidden rounded-xl border border-border bg-surface"><Table><TableHeader><TableRow noAnimate><TableHead>When</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Record</TableHead><TableHead>Reference</TableHead><TableHead>Changes</TableHead></TableRow></TableHeader><TableBody>
      {visible.map((event) => { const count = collectDiffs(event.before, event.after).length; return <TableRow key={event.id} role="button" tabIndex={0} className="group cursor-pointer" onClick={() => setSelectedId(event.id)} onKeyDown={(keyEvent) => { if (keyEvent.key === 'Enter' || keyEvent.key === ' ') { keyEvent.preventDefault(); setSelectedId(event.id) } }}><TableCell className="whitespace-nowrap">{event.at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</TableCell><TableCell>{event.actorName ?? <span className="text-fg-subtle">System</span>}</TableCell><TableCell><Badge variant={ACTION_VARIANT[event.action] ?? 'secondary'}>{humanize(event.action)}</Badge></TableCell><TableCell className="font-medium text-fg">{humanize(event.recordType)}</TableCell><TableCell className="font-mono text-xs text-fg-muted">{event.recordId ? `${event.recordId.slice(0, 8)}…` : '—'}</TableCell><TableCell><span className="flex items-center justify-between gap-3 text-sm text-fg-muted"><span>{event.summary ?? `${count} ${count === 1 ? 'field' : 'fields'}`}</span><ChevronRight size={16} className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /></span></TableCell></TableRow> })}
      {!loading && visible.length === 0 ? <TableRow noAnimate><TableCell colSpan={6}><EmptyState icon={<ScrollText />} title="No audit events found" description="Try a different search or filter." className="border-0 bg-transparent py-10 shadow-none" /></TableCell></TableRow> : null}
    </TableBody></Table></div>
    {selected ? <AuditEventDrawer event={selected} onClose={() => setSelectedId(null)} /> : null}
  </div>
}

export function AuditEventDrawer({ event, onClose }: { event: AuditEventRecord; onClose: () => void }) {
  const hasBefore = event.before !== null && event.before !== undefined
  const hasAfter = event.after !== null && event.after !== undefined
  const tabs: DrawerTab[] = ['changes', ...(hasBefore ? ['before' as const] : []), ...(hasAfter ? ['after' as const] : [])]
  const [activeTab, setActiveTab] = React.useState<DrawerTab>('changes')
  const diffs = React.useMemo(() => collectDiffs(event.before, event.after), [event.after, event.before])
  return <Drawer open onClose={onClose} size="2xl" title={<span className="flex flex-wrap items-center gap-2.5"><span>{humanize(event.recordType)}</span><Badge variant={ACTION_VARIANT[event.action] ?? 'secondary'}>{humanize(event.action)}</Badge></span>} description={`${event.actorName ?? 'System'} · ${event.at.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'medium' })}`} subtabs={<nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Audit event sections">{tabs.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={cn('shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors', activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg')}>{humanize(tab)}</button>)}</nav>}>
    <div className="space-y-6 pb-2"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetadataCard icon={<Clock3 size={14} />} label="When">{event.at.toLocaleString()}</MetadataCard><MetadataCard icon={<UserRound size={14} />} label="Actor">{event.actorName ?? 'System'}</MetadataCard><MetadataCard icon={<Database size={14} />} label="Record type">{humanize(event.recordType)}</MetadataCard><MetadataCard icon={<Fingerprint size={14} />} label="Reference"><span className="font-mono text-xs">{event.recordId ?? '—'}</span></MetadataCard></div>
      {activeTab === 'changes' ? <><section className="space-y-3"><div className="flex items-center gap-2"><History size={17} className="text-primary" /><h3 className="text-sm font-semibold text-fg">Changed fields</h3></div><DiffList rows={diffs} /></section>{Object.keys(event.metadata).length > 0 ? <section className="space-y-3"><div className="flex items-center gap-2"><Braces size={17} className="text-primary" /><h3 className="text-sm font-semibold text-fg">Event context</h3></div><JsonValue value={event.metadata} /></section> : null}<section className="space-y-3"><h3 className="text-sm font-semibold text-fg">Technical details</h3><JsonValue value={{ eventId: event.id, requestId: event.requestId, actorUserId: event.actorUserId }} /></section></> : null}
      {activeTab === 'before' ? <section className="space-y-3"><h3 className="text-sm font-semibold text-fg">Before snapshot</h3><JsonValue value={event.before} /></section> : null}
      {activeTab === 'after' ? <section className="space-y-3"><h3 className="text-sm font-semibold text-fg">After snapshot</h3><JsonValue value={event.after} /></section> : null}
    </div>
  </Drawer>
}

function DiffList({ rows }: { rows: DiffRow[] }) {
  if (!rows.length) return <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">No field-level differences were recorded.</div>
  const grouped = new Map<string, DiffRow[]>()
  for (const row of rows) { const group = row.path.split('.')[0] || 'event'; const values = grouped.get(group) ?? []; values.push(row); grouped.set(group, values) }
  return <div className="space-y-3">{[...grouped.entries()].map(([group, values]) => <details key={group} open className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-bg-subtle px-4 py-3 marker:hidden"><span className="font-medium text-fg">{humanize(group)}</span><Badge variant="secondary">{values.length}</Badge></summary><div className="border-t border-border"><div className="hidden grid-cols-[minmax(10rem,0.6fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 bg-bg-subtle px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-fg-muted sm:grid"><span>Field</span><span>Before</span><span>After</span></div>{values.map((row, index) => <div key={row.path} className={cn('grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(10rem,0.6fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4', index > 0 && 'border-t border-border')}><div className="font-medium text-fg">{formatPath(row.path)}</div><div className="min-w-0 rounded-md bg-danger-subtle px-2.5 py-1.5 text-fg"><span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-danger sm:hidden">Before</span><CompactValue value={row.before} /></div><div className="min-w-0 rounded-md bg-success-subtle px-2.5 py-1.5 text-fg"><span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-success sm:hidden">After</span><CompactValue value={row.after} /></div></div>)}</div></details>)}</div>
}

function JsonValue({ value }: { value: unknown }) {
  if (!Array.isArray(value) && !isObject(value)) return <CompactValue value={value} />
  if (Array.isArray(value)) return value.length ? <div className="space-y-2">{value.map((item, index) => <details key={index} className="overflow-hidden rounded-lg border border-border bg-surface"><summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-fg hover:bg-surface-hover">Item {index + 1}</summary><div className="border-t border-border p-3"><JsonValue value={item} /></div></details>)}</div> : <span className="text-fg-subtle">Empty collection</span>
  const entries = Object.entries(value)
  return entries.length ? <dl className="overflow-hidden rounded-lg border border-border bg-surface">{entries.map(([key, entry], index) => <div key={key} className={cn('grid gap-1.5 px-3 py-2.5 sm:grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] sm:gap-4', index > 0 && 'border-t border-border')}><dt className="text-xs font-medium tracking-wide text-fg-muted">{humanize(key)}</dt><dd className="min-w-0 text-sm text-fg"><JsonValue value={entry} /></dd></div>)}</dl> : <span className="text-fg-subtle">Empty collection</span>
}

function CompactValue({ value }: { value: unknown }) { if (value === null || value === undefined) return <span className="text-fg-subtle">Not set</span>; if (Array.isArray(value)) return <span className="text-fg-muted">{value.length} items</span>; if (isObject(value)) return <span className="text-fg-muted">{Object.keys(value).length} properties</span>; if (typeof value === 'boolean') return <Badge variant={value ? 'success' : 'outline'}>{value ? 'Yes' : 'No'}</Badge>; if (typeof value === 'number') return <span className="tabular-nums">{value.toLocaleString()}</span>; const text = String(value); return <span className={cn('break-words', isUuid(text) && 'font-mono text-xs text-fg-muted')}>{text}</span> }
function MetadataCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) { return <div className="min-w-0 rounded-xl border border-border bg-surface p-3.5 shadow-sm"><div className="mb-2 flex items-center gap-2 text-xs font-medium text-fg-muted">{icon}{label}</div><div className="truncate text-sm font-medium text-fg">{children}</div></div> }
function collectDiffs(before: unknown, after: unknown, path = ''): DiffRow[] { if (JSON.stringify(before) === JSON.stringify(after)) return []; if (Array.isArray(before) || Array.isArray(after)) return [{ path, before, after }]; if (isObject(before) || isObject(after)) { const left = isObject(before) ? before : {}; const right = isObject(after) ? after : {}; return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap((key) => collectDiffs(left[key], right[key], path ? `${path}.${key}` : key)) } return [{ path, before, after }] }
function isObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) }
function humanize(value: string): string { return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').split(' ').map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : word).join(' ') }
function formatPath(path: string): string { return path.split('.').map(humanize).join(' › ') }
