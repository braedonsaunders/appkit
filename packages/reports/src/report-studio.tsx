'use client'

import * as React from 'react'
import { CalendarClock, Columns3, Filter, GripVertical, Loader2, Play, Plus, Save, Sigma, Trash2 } from 'lucide-react'
import { Badge, Button, Checkbox, Input, Label, SearchSelect, cn } from '@appkit/ui'
import type { CustomReportQuery, ReportAggregate } from './custom-query'
import { REPORT_AGGREGATES, REPORT_TEMPORAL_BINS } from './custom-query'
import type { CustomReportDefinition } from './definitions'
import type { ReportEntityCatalog } from './entities'
import { reportColumn, reportEntity } from './entities'
import { REPORT_FILTER_OPERATORS, type ReportFilterOperator, type ReportRule } from './filters'
import type { ReportRunResult, ReportSchedule } from './types'

export type ReportStudioValue = { definition: CustomReportDefinition; schedule?: ReportSchedule | null }

export function ReportStudio({ value, catalog, result, onChange, onPreview, onSave, className }: {
  value: ReportStudioValue
  catalog: ReportEntityCatalog
  result: ReportRunResult | null
  onChange: (value: ReportStudioValue) => void
  onPreview: (value: ReportStudioValue) => Promise<ReportRunResult>
  onSave: (value: ReportStudioValue) => Promise<{ ok: true } | { ok: false; error: string }>
  className?: string
}) {
  const [preview, setPreview] = React.useState(result)
  const [running, setRunning] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
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

  return <div className={cn('grid min-h-0 flex-1 lg:grid-cols-[minmax(20rem,1fr)_minmax(0,2fr)]', className)}>
    <aside className="app-scroll min-h-0 space-y-5 overflow-y-auto border-r border-border bg-surface p-4 lg:p-5">
      <section className="grid gap-3">
        <Field label="Name"><Input value={definition.name} onChange={(event) => updateDefinition({ name: event.target.value, slug: slug(event.target.value) })} /></Field>
        <Field label="Source"><SearchSelect value={query.entity} onChange={(entityKey) => { const next = reportEntity(catalog, entityKey); if (next) updateQuery({ entity: next.key, mode: 'rows', columns: next.defaultColumns, filters: null, groupBy: null, sorts: next.defaultSort ? [next.defaultSort] : [] }) }} options={catalog.entities.map((item) => ({ value: item.key, label: item.label, hint: item.description }))} /></Field>
        <div className="grid grid-cols-2 gap-2"><ModeButton active={query.mode === 'rows'} icon={<Columns3 />} label="Rows" onClick={() => updateQuery({ ...query, mode: 'rows' })} /><ModeButton active={query.mode === 'summarize'} icon={<Sigma />} label="Summarize" onClick={() => updateQuery({ ...query, mode: 'summarize' })} /></div>
      </section>

      {entity && query.mode === 'rows' ? <RowsBuilder entity={entity} query={query} onChange={updateQuery} /> : null}
      {entity && query.mode === 'summarize' ? <SummaryBuilder entity={entity} query={query} onChange={updateQuery} /> : null}
      {entity ? <FiltersBuilder entity={entity} query={query} onChange={updateQuery} /> : null}
      <LayoutBuilder value={value} onChange={onChange} />
    </aside>

    <main className="flex min-h-0 flex-col bg-bg-subtle">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4">
        <div><h2 className="text-sm font-semibold text-fg">{definition.name || 'Untitled report'}</h2><p className="text-xs text-fg-muted">{entity?.label ?? 'Choose a source'} · {query.mode === 'summarize' ? 'Summary' : 'Detail rows'}</p></div>
        <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={run} disabled={running}>{running ? <Loader2 className="size-4 animate-spin" /> : <Play size={14} />}Run</Button><Button type="button" size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={14} />}Save</Button></div>
      </header>
      <div className="app-scroll min-h-0 flex-1 overflow-auto p-4 lg:p-6">
        {error ? <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">{error}</div> : null}
        {preview ? <div className="mx-auto max-w-6xl rounded-xl border border-border bg-surface p-5 shadow-sm"><div className="mb-5 flex items-start justify-between gap-4"><div><h1 className="text-xl font-semibold text-fg">{definition.name}</h1>{definition.description ? <p className="mt-1 text-sm text-fg-muted">{definition.description}</p> : null}</div><Badge variant="secondary">{preview.rowCount} rows</Badge></div><ReportResultView result={preview} /></div> : <div className="grid min-h-96 place-items-center rounded-xl border border-dashed border-border bg-surface text-sm text-fg-subtle">Run the report to preview it.</div>}
      </div>
    </main>
  </div>
}

function RowsBuilder({ entity, query, onChange }: { entity: NonNullable<ReturnType<typeof reportEntity>>; query: CustomReportQuery; onChange: (query: CustomReportQuery) => void }) {
  return <BuilderSection title="Columns" icon={<Columns3 />}><div className="space-y-1">{entity.columns.map((column) => { const selected = query.columns.includes(column.key); return <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-hover"><Checkbox checked={selected} onChange={() => onChange({ ...query, columns: selected ? query.columns.filter((key) => key !== column.key) : [...query.columns, column.key] })} /><span className="min-w-0 flex-1 truncate text-fg">{column.label}</span><span className="text-[10px] uppercase tracking-wide text-fg-subtle">{column.kind}</span></label> })}</div><Field label="Group rows into sections"><SearchSelect value={query.groupBy ?? ''} onChange={(groupBy) => onChange({ ...query, groupBy: groupBy || null })} options={[{ value: '', label: 'No grouping' }, ...entity.columns.map((column) => ({ value: column.key, label: column.label }))]} /></Field></BuilderSection>
}

function SummaryBuilder({ entity, query, onChange }: { entity: NonNullable<ReturnType<typeof reportEntity>>; query: CustomReportQuery; onChange: (query: CustomReportQuery) => void }) {
  const breakouts = query.breakouts ?? [], measures = query.measures ?? []
  return <><BuilderSection title="Group by" icon={<GripVertical />} action={() => onChange({ ...query, breakouts: [...breakouts, { column: entity.columns[0]?.key ?? '' }] })}>{breakouts.map((breakout, index) => { const column = reportColumn(entity, breakout.column); const temporal = column?.kind === 'date' || column?.kind === 'timestamp'; return <div key={index} className="flex gap-2"><SearchSelect className="min-w-0 flex-1" value={breakout.column} onChange={(columnKey) => onChange({ ...query, breakouts: breakouts.map((item, itemIndex) => itemIndex === index ? { ...item, column: columnKey, bin: undefined } : item) })} options={entity.columns.map((item) => ({ value: item.key, label: item.label }))} />{temporal ? <SearchSelect className="w-32" value={breakout.bin ?? ''} onChange={(bin) => onChange({ ...query, breakouts: breakouts.map((item, itemIndex) => itemIndex === index ? { ...item, bin: bin ? bin as typeof item.bin : undefined } : item) })} options={[{ value: '', label: 'Exact' }, ...REPORT_TEMPORAL_BINS.map((bin) => ({ value: bin, label: bin.replace('_', ' ') }))]} /> : null}<RemoveButton onClick={() => onChange({ ...query, breakouts: breakouts.filter((_, itemIndex) => itemIndex !== index) })} /></div> })}</BuilderSection>
    <BuilderSection title="Measures" icon={<Sigma />} action={() => onChange({ ...query, measures: [...measures, { aggregate: 'count' }] })}>{measures.map((measure, index) => <div key={index} className="flex gap-2"><SearchSelect className="w-32" value={measure.aggregate} onChange={(aggregate) => onChange({ ...query, measures: measures.map((item, itemIndex) => itemIndex === index ? { ...item, aggregate: aggregate as ReportAggregate, column: aggregate === 'count' ? undefined : item.column ?? entity.columns.find((column) => column.kind === 'number')?.key } : item) })} options={REPORT_AGGREGATES.map((aggregate) => ({ value: aggregate, label: aggregate.replace('_', ' ') }))} />{measure.aggregate !== 'count' ? <SearchSelect className="min-w-0 flex-1" value={measure.column ?? ''} onChange={(column) => onChange({ ...query, measures: measures.map((item, itemIndex) => itemIndex === index ? { ...item, column } : item) })} options={entity.columns.filter((column) => !['sum', 'avg'].includes(measure.aggregate) || column.kind === 'number').map((column) => ({ value: column.key, label: column.label }))} /> : <div className="flex flex-1 items-center rounded-md border border-border bg-bg-subtle px-3 text-sm text-fg-muted">Rows</div>}<RemoveButton onClick={() => onChange({ ...query, measures: measures.filter((_, itemIndex) => itemIndex !== index) })} /></div>)}</BuilderSection></>
}

function FiltersBuilder({ entity, query, onChange }: { entity: NonNullable<ReturnType<typeof reportEntity>>; query: CustomReportQuery; onChange: (query: CustomReportQuery) => void }) {
  const rules = query.filters?.rules.filter(isRule) ?? []
  const setRules = (next: ReportRule[]) => onChange({ ...query, filters: next.length ? { combinator: query.filters?.combinator ?? 'and', rules: next } : null })
  return <BuilderSection title="Filters" icon={<Filter />} action={() => { const column = entity.columns[0]; if (column) setRules([...rules, { field: column.key, operator: 'eq', value: '' }]) }}>{rules.map((rule, index) => <div key={index} className="space-y-2 rounded-lg border border-border bg-bg-subtle p-2"><div className="flex gap-2"><SearchSelect className="min-w-0 flex-1" value={rule.field} onChange={(field) => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, field } : item))} options={entity.columns.map((column) => ({ value: column.key, label: column.label }))} /><RemoveButton onClick={() => setRules(rules.filter((_, itemIndex) => itemIndex !== index))} /></div><div className="grid grid-cols-2 gap-2"><SearchSelect value={rule.operator} onChange={(operator) => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, operator: operator as ReportFilterOperator } : item))} options={REPORT_FILTER_OPERATORS.map((operator) => ({ value: operator, label: operator.replaceAll('_', ' ') }))} /><Input value={Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value ?? '')} disabled={['is_null', 'is_not_null', 'is_true', 'is_false', 'since_today', 'this_week', 'this_month', 'this_year', 'before_now'].includes(rule.operator)} onChange={(event) => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} /></div></div>)}</BuilderSection>
}

function LayoutBuilder({ value, onChange }: { value: ReportStudioValue; onChange: (value: ReportStudioValue) => void }) {
  const layout = value.definition.layout, schedule = value.schedule
  const changeLayout = (next: Partial<typeof layout>) => onChange({ ...value, definition: { ...value.definition, layout: { ...layout, ...next } } })
  return <BuilderSection title="Page and delivery" icon={<CalendarClock />}><div className="grid grid-cols-2 gap-2"><Field label="Paper"><SearchSelect value={layout.paperSize} onChange={(paperSize) => changeLayout({ paperSize: paperSize as typeof layout.paperSize })} options={['letter', 'a4', 'legal'].map((item) => ({ value: item, label: item.toUpperCase() }))} /></Field><Field label="Orientation"><SearchSelect value={layout.orientation} onChange={(orientation) => changeLayout({ orientation: orientation as typeof layout.orientation })} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} /></Field></div>{schedule ? <label className="flex items-center gap-2 text-sm text-fg"><Checkbox checked={schedule.enabled} onChange={(event) => onChange({ ...value, schedule: { ...schedule, enabled: event.target.checked } })} />Scheduled delivery enabled</label> : null}</BuilderSection>
}

export function ReportResultView({ result }: { result: ReportRunResult }) {
  return <div className="space-y-6">{result.groups.map((group, groupIndex) => <section key={`${group.title}-${groupIndex}`} className="space-y-2">{group.kind !== 'results' ? <div><h2 className="text-sm font-semibold text-fg">{group.title}</h2>{group.subtitle ? <p className="text-xs text-fg-muted">{group.subtitle}</p> : null}</div> : null}<div className="app-scroll overflow-auto rounded-lg border border-border"><table className="w-full border-collapse text-sm"><thead className="bg-bg-subtle"><tr>{group.columns.map((column) => <th key={column.key} className={cn('border-b border-border px-3 py-2 text-left text-xs font-semibold text-fg-muted', column.align === 'right' && 'text-right')}>{column.label}</th>)}</tr></thead><tbody className="divide-y divide-border-subtle">{group.rows.map((row, rowIndex) => <tr key={rowIndex} className="hover:bg-surface-hover">{group.columns.map((column) => <td key={column.key} className={cn('px-3 py-2 text-fg', column.align === 'right' && 'text-right tabular-nums')}>{formatValue(row[column.key], column.semanticType)}</td>)}</tr>)}{group.isEmpty ? <tr><td colSpan={group.columns.length} className="px-3 py-8 text-center text-fg-subtle">No rows match this report.</td></tr> : null}</tbody></table></div></section>)}</div>
}

function BuilderSection({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: () => void; children: React.ReactNode }) { return <section className="space-y-3 rounded-xl border border-border bg-surface p-3"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold text-fg"><span className="text-primary [&_svg]:size-4">{icon}</span>{title}</h3>{action ? <Button type="button" variant="ghost" size="sm" onClick={action}><Plus size={13} />Add</Button> : null}</div>{children}</section> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div> }
function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className={cn('flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition [&_svg]:size-4', active ? 'border-primary bg-primary-subtle text-primary' : 'border-border bg-surface text-fg-muted hover:bg-surface-hover')}>{icon}{label}</button> }
function RemoveButton({ onClick }: { onClick: () => void }) { return <button type="button" aria-label="Remove" onClick={onClick} className="grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-danger-subtle hover:text-danger"><Trash2 size={14} /></button> }
function isRule(value: ReportRule | { rules: unknown[] }): value is ReportRule { return !('rules' in value) }
function slug(value: string): string { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled-report' }
function formatValue(value: unknown, semanticType: string): string { if (value == null) return '—'; if (semanticType === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value)); if (semanticType === 'number') return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value)); if (semanticType === 'date') { const date = new Date(String(value)); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleDateString('en-US') } return String(value) }
