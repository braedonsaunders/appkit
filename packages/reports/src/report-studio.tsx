'use client'

import * as React from 'react'
import { CalendarClock, ChevronDown, ChevronUp, Columns3, Filter, GripVertical, Loader2, Play, Plus, Save, Settings2, Sigma, Table2, Trash2, X } from 'lucide-react'
import { Button, Checkbox, Input, Label, SearchSelect, cn } from '@appkit/ui'
import type { CustomReportQuery, ReportAggregate } from './custom-query'
import { REPORT_AGGREGATES, REPORT_TEMPORAL_BINS } from './custom-query'
import type { CustomReportDefinition } from './definitions'
import type { ReportEntityCatalog } from './entities'
import { reportColumn, reportEntity } from './entities'
import { ReportFilterTree } from './filter-tree'
import type { ReportRunResult, ReportSchedule } from './types'
import { PaperView } from './paper-view'
import { ReportDrillDrawer } from './report-drill-drawer'
import { ReportExportMenu, type ReportExportOption } from './export-menu'
import { reportRunResultToPaper, type ReportDrillLoader, type ReportDrillRecord, type ReportCellContext } from './viewer-types'

export type ReportStudioValue = { definition: CustomReportDefinition; schedule?: ReportSchedule | null }
type StudioTab = 'data' | 'filter' | 'format'

export function ReportStudio<TDrillTarget = never, TRecord extends ReportDrillRecord = ReportDrillRecord>({ value, catalog, result, onChange, onPreview, onSave, organization = 'Organization', currency = '', drill, exports: exportOptions, printHref, className }: {
  value: ReportStudioValue
  catalog: ReportEntityCatalog
  result: ReportRunResult | null
  onChange: (value: ReportStudioValue) => void
  onPreview: (value: ReportStudioValue) => Promise<ReportRunResult>
  onSave: (value: ReportStudioValue) => Promise<{ ok: true } | { ok: false; error: string }>
  organization?: string
  currency?: string
  drill?: {
    target: (context: ReportCellContext) => TDrillTarget | null | undefined
    load: ReportDrillLoader<TDrillTarget, TRecord>
    onOpenRecord?: (record: TRecord) => void
  }
  exports?: ReportExportOption[]
  printHref?: string
  className?: string
}) {
  const [preview, setPreview] = React.useState(result)
  const [running, setRunning] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<StudioTab>('data')
  const [drillTarget, setDrillTarget] = React.useState<TDrillTarget | null>(null)
  React.useEffect(() => setPreview(result), [result])
  const definition = value.definition
  const query = definition.query
  const entity = reportEntity(catalog, query.entity) ?? catalog.entities[0] ?? null
  const updateDefinition = (next: Partial<CustomReportDefinition>) => onChange({ ...value, definition: { ...definition, ...next } })
  const updateQuery = (next: CustomReportQuery) => updateDefinition({ query: next })

  async function run() {
    setRunning(true); setError(null)
    try { setPreview(await onPreview(value)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'The report could not run.') }
    finally { setRunning(false) }
  }
  async function save() {
    setSaving(true); setError(null)
    try { const response = await onSave(value); if (!response.ok) setError(response.error) }
    finally { setSaving(false) }
  }

  const tabs: { key: StudioTab; label: string; icon: typeof Table2 }[] = [
    { key: 'data', label: 'Data', icon: Table2 },
    { key: 'filter', label: 'Filter', icon: Filter },
    { key: 'format', label: 'Format', icon: Settings2 },
  ]

  return <div className={cn('app-scroll grid h-full min-h-0 flex-1 overflow-y-auto lg:grid-cols-3 lg:overflow-hidden', className)}>
    <aside className="flex min-h-0 flex-col border-b border-border bg-surface lg:col-span-1 lg:border-r lg:border-b-0">
      <div className="shrink-0 space-y-3 border-b border-border p-4 lg:p-5">
        <Field label="Name"><Input value={definition.name} onChange={(event) => updateDefinition({ name: event.target.value, slug: slug(event.target.value) })} /></Field>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-border p-0.5">{tabs.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={cn('flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors', tab === item.key ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg')}><item.icon size={14} />{item.label}</button>)}</div>
      </div>
      <div className="app-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-4 lg:p-5">
        {tab === 'data' ? <>
          <section className="grid gap-3">
            <Field label="Source"><SearchSelect value={query.entity} onChange={(entityKey) => { const next = reportEntity(catalog, entityKey); if (next) updateQuery({ entity: next.key, mode: 'rows', columns: next.defaultColumns, filters: null, groupBy: null, sorts: next.defaultSort ? [next.defaultSort] : [], limit: query.limit ?? 1000 }) }} options={catalog.entities.map((item) => ({ value: item.key, label: item.label, hint: item.description }))} /></Field>
            <div className="grid grid-cols-2 gap-2"><ModeButton active={query.mode === 'rows'} icon={<Columns3 />} label="Rows" onClick={() => updateQuery({ ...query, mode: 'rows' })} /><ModeButton active={query.mode === 'summarize'} icon={<Sigma />} label="Summarize" onClick={() => updateQuery({ ...query, mode: 'summarize', measures: query.measures?.length ? query.measures : [{ aggregate: 'count' }] })} /></div>
          </section>
          {entity && query.mode === 'rows' ? <RowsBuilder entity={entity} query={query} onChange={updateQuery} /> : null}
          {entity && query.mode === 'summarize' ? <SummaryBuilder entity={entity} query={query} onChange={updateQuery} /> : null}
          {entity ? <SortLimitBuilder entity={entity} query={query} onChange={updateQuery} /> : null}
        </> : null}
        {tab === 'filter' && entity ? <FiltersBuilder entity={entity} query={query} onChange={updateQuery} /> : null}
        {tab === 'format' ? <LayoutBuilder value={value} onChange={onChange} /> : null}
      </div>
    </aside>

    <main className="flex min-h-0 flex-col bg-bg-subtle lg:col-span-2">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4">
        <div><h2 className="text-sm font-semibold text-fg">{definition.name || 'Untitled report'}</h2><p className="text-xs text-fg-muted">{entity?.label ?? 'Choose a source'} · {query.mode === 'summarize' ? 'Summary' : 'Detail rows'}</p></div>
        <div className="flex items-center gap-2">{exportOptions?.length ? <ReportExportMenu options={exportOptions} printHref={printHref} onError={(cause) => setError(cause.message)} /> : null}<Button type="button" variant="outline" size="sm" onClick={run} disabled={running}>{running ? <Loader2 className="size-4 animate-spin" /> : <Play size={14} />}Run</Button><Button type="button" size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={14} />}Save</Button></div>
      </header>
      <div className="app-scroll min-h-0 flex-1 overflow-auto p-4 lg:p-6">
        {error ? <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">{error}</div> : null}
        {preview ? <div className="rounded-xl bg-bg p-3 sm:p-5"><PaperView organization={organization} data={reportRunResultToPaper(definition.name, preview, { periodPhrase: definition.description, layout: definition.layout, drillTarget: drill?.target })} emptyLabel="No rows match this report." currency={currency} onDrill={drill ? setDrillTarget : undefined} /></div> : <div className="grid min-h-96 place-items-center rounded-xl border border-dashed border-border bg-surface text-sm text-fg-subtle">Run the report to preview it.</div>}
      </div>
    </main>
    {drill ? <ReportDrillDrawer target={drillTarget} load={drill.load} onClose={() => setDrillTarget(null)} onOpenRecord={drill.onOpenRecord} /> : null}
  </div>
}

function RowsBuilder({ entity, query, onChange }: { entity: NonNullable<ReturnType<typeof reportEntity>>; query: CustomReportQuery; onChange: (query: CustomReportQuery) => void }) {
  const selected = query.columns
  const labels = query.columnLabels ?? {}
  const available = entity.columns.filter((column) => !selected.includes(column.key))
  const setColumns = (columns: string[]) => onChange({ ...query, columns, columnLabels: Object.fromEntries(Object.entries(labels).filter(([key]) => columns.includes(key))) })
  const move = (index: number, delta: -1 | 1) => { const target = index + delta; if (target < 0 || target >= selected.length) return; const columns = [...selected]; [columns[index], columns[target]] = [columns[target]!, columns[index]!]; setColumns(columns) }
  const setLabel = (key: string, value: string) => { const next = { ...labels }; if (value.trim()) next[key] = value; else delete next[key]; onChange({ ...query, columnLabels: next }) }
  return <BuilderSection title="Columns" icon={<Columns3 />}>
    {selected.length === 0 ? <p className="text-xs text-danger">Select at least one column.</p> : <ul className="space-y-1">{selected.map((key, index) => { const column = reportColumn(entity, key); return <li key={key} className="flex items-center gap-1.5"><span className="min-w-0 flex-1 truncate rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs text-fg">{column?.label ?? key}</span><Input className="h-7 w-32 text-xs" value={labels[key] ?? ''} onChange={(event) => setLabel(key, event.target.value)} placeholder="Label override" /><button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move column up" className="rounded p-1 text-fg-subtle hover:bg-surface-hover hover:text-fg disabled:opacity-30"><ChevronUp size={14} /></button><button type="button" onClick={() => move(index, 1)} disabled={index === selected.length - 1} aria-label="Move column down" className="rounded p-1 text-fg-subtle hover:bg-surface-hover hover:text-fg disabled:opacity-30"><ChevronDown size={14} /></button><button type="button" onClick={() => setColumns(selected.filter((columnKey) => columnKey !== key))} aria-label="Remove column" className="rounded p-1 text-fg-subtle hover:bg-danger-subtle hover:text-danger"><X size={14} /></button></li> })}</ul>}
    {available.length ? <div className="flex flex-wrap gap-1.5 pt-1">{available.map((column) => <button key={column.key} type="button" onClick={() => setColumns([...selected, column.key])} className="rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"><span className="inline-flex items-center gap-1"><Plus size={11} />{column.label}</span></button>)}</div> : null}
    <Field label="Group rows into sections"><SearchSelect value={query.groupBy ?? ''} onChange={(groupBy) => onChange({ ...query, groupBy: groupBy || null })} options={[{ value: '', label: 'No grouping' }, ...entity.columns.map((column) => ({ value: column.key, label: column.label }))]} /></Field>
  </BuilderSection>
}

function SummaryBuilder({ entity, query, onChange }: { entity: NonNullable<ReturnType<typeof reportEntity>>; query: CustomReportQuery; onChange: (query: CustomReportQuery) => void }) {
  const breakouts = query.breakouts ?? [], measures = query.measures ?? []
  return <><BuilderSection title="Group by" icon={<GripVertical />} action={() => onChange({ ...query, breakouts: [...breakouts, { column: entity.columns[0]?.key ?? '' }] })}>{breakouts.map((breakout, index) => { const column = reportColumn(entity, breakout.column); const temporal = column?.kind === 'date' || column?.kind === 'timestamp'; return <div key={index} className="flex gap-2"><SearchSelect className="min-w-0 flex-1" value={breakout.column} onChange={(columnKey) => onChange({ ...query, breakouts: breakouts.map((item, itemIndex) => itemIndex === index ? { ...item, column: columnKey, bin: undefined } : item) })} options={entity.columns.map((item) => ({ value: item.key, label: item.label }))} />{temporal ? <SearchSelect className="w-32" value={breakout.bin ?? ''} onChange={(bin) => onChange({ ...query, breakouts: breakouts.map((item, itemIndex) => itemIndex === index ? { ...item, bin: bin ? bin as typeof item.bin : undefined } : item) })} options={[{ value: '', label: 'Exact' }, ...REPORT_TEMPORAL_BINS.map((bin) => ({ value: bin, label: bin.replace('_', ' ') }))]} /> : null}<RemoveButton onClick={() => onChange({ ...query, breakouts: breakouts.filter((_, itemIndex) => itemIndex !== index) })} /></div> })}</BuilderSection>
    <BuilderSection title="Measures" icon={<Sigma />} action={() => onChange({ ...query, measures: [...measures, { aggregate: 'count' }] })}>{measures.map((measure, index) => <div key={index} className="flex gap-2"><SearchSelect className="w-32" value={measure.aggregate} onChange={(aggregate) => onChange({ ...query, measures: measures.map((item, itemIndex) => itemIndex === index ? { ...item, aggregate: aggregate as ReportAggregate, column: aggregate === 'count' ? undefined : item.column ?? entity.columns.find((column) => column.kind === 'number')?.key } : item) })} options={REPORT_AGGREGATES.map((aggregate) => ({ value: aggregate, label: aggregate.replace('_', ' ') }))} />{measure.aggregate !== 'count' ? <SearchSelect className="min-w-0 flex-1" value={measure.column ?? ''} onChange={(column) => onChange({ ...query, measures: measures.map((item, itemIndex) => itemIndex === index ? { ...item, column } : item) })} options={entity.columns.filter((column) => !['sum', 'avg'].includes(measure.aggregate) || column.kind === 'number').map((column) => ({ value: column.key, label: column.label }))} /> : <div className="flex flex-1 items-center rounded-md border border-border bg-bg-subtle px-3 text-sm text-fg-muted">Rows</div>}<RemoveButton onClick={() => onChange({ ...query, measures: measures.filter((_, itemIndex) => itemIndex !== index) })} /></div>)}</BuilderSection></>
}

function FiltersBuilder({ entity, query, onChange }: { entity: NonNullable<ReturnType<typeof reportEntity>>; query: CustomReportQuery; onChange: (query: CustomReportQuery) => void }) {
  const filters = query.filters ?? { combinator: 'and' as const, rules: [] }
  return <BuilderSection title="Filters" icon={<Filter />}><ReportFilterTree entity={entity} group={filters} onChange={(next) => onChange({ ...query, filters: next.rules.length ? next : null })} /></BuilderSection>
}

function SortLimitBuilder({ entity, query, onChange }: { entity: NonNullable<ReturnType<typeof reportEntity>>; query: CustomReportQuery; onChange: (query: CustomReportQuery) => void }) {
  const sorts = query.sorts ?? []
  const commit = (next: typeof sorts) => onChange({ ...query, sorts: next.filter((sort) => sort.column).slice(0, 3) })
  const used = new Set(sorts.map((sort) => sort.column))
  return <BuilderSection title="Rows" icon={<Table2 />}>
    <div className="space-y-2"><div className="flex items-center justify-between"><Label>Sort by</Label>{sorts.length > 0 && sorts.length < 3 ? <Button type="button" variant="ghost" size="sm" onClick={() => { const first = entity.columns.find((column) => !used.has(column.key)); if (first) commit([...sorts, { column: first.key, direction: 'desc' }]) }}><Plus size={14} />Add level</Button> : null}</div>
      {sorts.length === 0 ? <SearchSelect value="" onChange={(column) => column && commit([{ column, direction: 'desc' }])} options={[{ value: '', label: 'Default order' }, ...entity.columns.map((column) => ({ value: column.key, label: column.label }))]} /> : sorts.map((sort, index) => <div key={index} className="flex items-center gap-2">{index > 0 ? <span className="w-12 shrink-0 text-right text-[11px] text-fg-subtle">then by</span> : null}<SearchSelect className="min-w-0 flex-1" value={sort.column} onChange={(column) => commit(sorts.map((item, itemIndex) => itemIndex === index ? { ...item, column } : item))} options={entity.columns.filter((column) => !used.has(column.key) || column.key === sort.column).map((column) => ({ value: column.key, label: column.label }))} /><SearchSelect className="w-32" value={sort.direction} onChange={(direction) => commit(sorts.map((item, itemIndex) => itemIndex === index ? { ...item, direction: direction as 'asc' | 'desc' } : item))} options={[{ value: 'desc', label: 'Descending' }, { value: 'asc', label: 'Ascending' }]} /><RemoveButton onClick={() => commit(sorts.filter((_, itemIndex) => itemIndex !== index))} /></div>)}</div>
    <Field label="Row limit"><Input type="number" min={1} max={10_000} value={query.limit ?? 1000} onChange={(event) => onChange({ ...query, limit: Math.min(10_000, Math.max(1, Number(event.currentTarget.value) || 1)) })} /></Field><p className="text-xs text-fg-muted">The preview and exports enforce the same bounded query plan.</p>
  </BuilderSection>
}

function LayoutBuilder({ value, onChange }: { value: ReportStudioValue; onChange: (value: ReportStudioValue) => void }) {
  const layout = value.definition.layout, schedule = value.schedule
  const changeLayout = (next: Partial<typeof layout>) => onChange({ ...value, definition: { ...value.definition, layout: { ...layout, ...next } } })
  return <BuilderSection title="Page and delivery" icon={<CalendarClock />}><div className="grid grid-cols-2 gap-2"><Field label="Paper"><SearchSelect value={layout.paperSize} onChange={(paperSize) => changeLayout({ paperSize: paperSize as typeof layout.paperSize })} options={['letter', 'a4', 'legal'].map((item) => ({ value: item, label: item.toUpperCase() }))} /></Field><Field label="Orientation"><SearchSelect value={layout.orientation} onChange={(orientation) => changeLayout({ orientation: orientation as typeof layout.orientation })} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} /></Field><Field label="Density"><SearchSelect value={layout.density} onChange={(density) => changeLayout({ density: density as typeof layout.density })} options={[{ value: 'standard', label: 'Standard' }, { value: 'compact', label: 'Compact' }]} /></Field><Field label="Margin (mm)"><Input type="number" min={5} max={30} value={layout.marginMm} onChange={(event) => changeLayout({ marginMm: Math.min(30, Math.max(5, Number(event.currentTarget.value) || 15)) })} /></Field></div><label className="flex items-center gap-2 text-sm text-fg"><Checkbox checked={layout.showSummary} onChange={(event) => changeLayout({ showSummary: event.currentTarget.checked })} />Show summary band</label>{schedule ? <label className="flex items-center gap-2 text-sm text-fg"><Checkbox checked={schedule.enabled} onChange={(event) => onChange({ ...value, schedule: { ...schedule, enabled: event.target.checked } })} />Scheduled delivery enabled</label> : null}</BuilderSection>
}

export function ReportResultView({ organization = 'Organization', title = 'Report', description, result }: { organization?: string; title?: string; description?: string; result: ReportRunResult }) {
  return <PaperView organization={organization} data={reportRunResultToPaper(title, result, { periodPhrase: description })} />
}

function BuilderSection({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: () => void; children: React.ReactNode }) { return <section className="space-y-3 rounded-xl border border-border bg-surface p-3"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold text-fg"><span className="text-primary [&_svg]:size-4">{icon}</span>{title}</h3>{action ? <Button type="button" variant="ghost" size="sm" onClick={action}><Plus size={13} />Add</Button> : null}</div>{children}</section> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div> }
function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className={cn('flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition [&_svg]:size-4', active ? 'border-primary bg-primary-subtle text-primary' : 'border-border bg-surface text-fg-muted hover:bg-surface-hover')}>{icon}{label}</button> }
function RemoveButton({ onClick }: { onClick: () => void }) { return <button type="button" aria-label="Remove" onClick={onClick} className="grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-danger-subtle hover:text-danger"><Trash2 size={14} /></button> }
function slug(value: string): string { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled-report' }
