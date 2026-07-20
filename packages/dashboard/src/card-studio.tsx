'use client'

import * as React from 'react'
import {
  Activity, BarChart3, CircleGauge, Hash, LineChart, Loader2, PieChart, Plus, Rows3,
  Table2, Trash2,
} from 'lucide-react'
import {
  FILTER_OPERATORS,
  VISUALIZATIONS,
  fieldFromSource,
  filterOperatorsForField,
  parseFormula,
  serializeFormula,
  sourceFromCatalog,
  type AnalyticsCatalog,
  type AnalyticsField,
  type InsightQuery,
  type QueryFilter,
  type QueryFormulaMeasure,
  type QueryMeasure,
  type QueryResult,
  type VisualizationKey,
  type VisualizationSettings,
} from '@appkit/analytics'
import { Badge, Button, Checkbox, Input, Label, SearchSelect, Textarea, cn } from '@appkit/ui'
import { InsightResultView } from './insight-card'
import type { CardPreviewResult, CardStudioResult, InsightCardDraft } from './types'

const VIZ_ICONS: Record<VisualizationKey, React.ReactNode> = {
  scalar: <Hash />, progress: <Activity />, table: <Table2 />, bar: <BarChart3 />,
  row: <Rows3 />, line: <LineChart />, area: <Activity />, pie: <PieChart />,
  donut: <PieChart />, gauge: <CircleGauge />,
}

const FILTER_LABELS: Record<(typeof FILTER_OPERATORS)[number], string> = {
  eq: 'equals', neq: 'does not equal', in: 'is any of', not_in: 'is not any of', gt: 'greater than',
  gte: 'at least', lt: 'less than', lte: 'at most', contains: 'contains', is_null: 'is empty',
  is_not_null: 'is not empty', last_n_days: 'within last days', this_month: 'this month',
  this_quarter: 'this quarter', this_year: 'this year', ytd: 'year to date',
}
const NO_VALUE_FILTERS = new Set(['is_null', 'is_not_null', 'this_month', 'this_quarter', 'this_year', 'ytd'])

export function CardStudio({ initial, catalog, onSave, onRun, onDelete, onPublishChange, className }: {
  initial: InsightCardDraft
  catalog: AnalyticsCatalog
  onSave: (draft: InsightCardDraft) => Promise<CardStudioResult>
  onRun: (query: InsightQuery) => Promise<CardPreviewResult>
  onDelete?: (draft: InsightCardDraft) => Promise<CardStudioResult>
  onPublishChange?: (published: boolean, draft: InsightCardDraft) => Promise<CardStudioResult>
  className?: string
}) {
  const [draft, setDraft] = React.useState(initial)
  const [saveState, setSaveState] = React.useState<'saved' | 'saving' | 'error'>('saved')
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<QueryResult | null>(null)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const [running, setRunning] = React.useState(false)
  const [formulaErrors, setFormulaErrors] = React.useState<Record<number, string>>({})
  const changed = React.useRef(false)
  const saveRef = React.useRef(onSave)
  const runRef = React.useRef(onRun)
  saveRef.current = onSave
  runRef.current = onRun
  const source = sourceFromCatalog(catalog, draft.query.source) ?? catalog.sources[0] ?? null
  const fields = source?.fields ?? []

  function update(updater: (current: InsightCardDraft) => InsightCardDraft) {
    changed.current = true
    setDraft(updater)
  }
  function updateQuery(updater: (current: InsightQuery) => InsightQuery) {
    update((current) => ({ ...current, query: updater(current.query) }))
  }

  React.useEffect(() => {
    if (!changed.current) return
    setSaveState('saving'); setSaveError(null)
    const timer = window.setTimeout(async () => {
      const result = await saveRef.current(draft)
      if (result.ok) {
        setSaveState('saved')
        if (result.id && !draft.id) setDraft((current) => ({ ...current, id: result.id }))
      }
      else { setSaveState('error'); setSaveError(result.error) }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [draft])

  React.useEffect(() => {
    setRunning(true); setPreviewError(null)
    const timer = window.setTimeout(async () => {
      const result = await runRef.current(draft.query)
      if (result.ok) setPreview(result.result)
      else { setPreview(null); setPreviewError(result.error) }
      setRunning(false)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [draft.query])

  function changeSource(key: string) {
    update((current) => ({ ...current, query: { source: key, measures: [{ fn: 'count' }], dimensions: [], filters: [], limit: 100 } }))
    setFormulaErrors({})
  }

  return <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
      <div className="app-scroll min-h-0 space-y-6 overflow-y-auto border-r border-border p-5">
        <section className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="card-name">Name</Label><Input id="card-name" value={draft.name} onChange={(event) => update((current) => ({ ...current, name: event.target.value }))} placeholder="Monthly activity" /></div>
          <div className="space-y-1.5"><Label htmlFor="card-description">Description</Label><Input id="card-description" value={draft.description ?? ''} onChange={(event) => update((current) => ({ ...current, description: event.target.value }))} placeholder="Optional" /></div>
          <div className="space-y-1.5"><Label>Source</Label><SearchSelect value={draft.query.source} onChange={changeSource} options={catalog.sources.map((item) => ({ value: item.key, label: item.label, hint: item.description }))} />{source?.description ? <p className="text-xs leading-relaxed text-fg-muted">{source.description}</p> : null}</div>
        </section>

        <StudioSection title="Measures" onAdd={() => updateQuery((query) => ({ ...query, measures: [...(query.measures ?? []), { fn: 'count' }] }))}>
          {(draft.query.measures ?? []).map((measure, index) => <MeasureRow key={index} measure={measure} fields={fields} error={formulaErrors[index]} onChange={(next) => updateQuery((query) => ({ ...query, measures: (query.measures ?? []).map((item, itemIndex) => itemIndex === index ? next : item) }))} onFormulaError={(error) => setFormulaErrors((current) => ({ ...current, [index]: error }))} onRemove={() => updateQuery((query) => ({ ...query, measures: (query.measures ?? []).filter((_, itemIndex) => itemIndex !== index) }))} />)}
          <Button type="button" variant="ghost" size="sm" className="w-full border border-dashed border-border text-xs" onClick={() => updateQuery((query) => ({ ...query, measures: [...(query.measures ?? []), { kind: 'formula', alias: 'custom_metric', label: 'Custom metric', formula: { expression: 'aggregate', fn: 'count' } }] }))}>ƒx Add formula</Button>
        </StudioSection>

        <StudioSection title="Group by" onAdd={() => { const field = fields.find((item) => item.canDimension ?? !['number', 'currency'].includes(item.semanticType)); if (field) updateQuery((query) => ({ ...query, dimensions: [...(query.dimensions ?? []), { field: field.key }] })) }}>
          {(draft.query.dimensions ?? []).map((dimension, index) => <div key={index} className="flex items-center gap-2"><SearchSelect className="min-w-0 flex-1" value={dimension.field} onChange={(field) => updateQuery((query) => ({ ...query, dimensions: (query.dimensions ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, field } : item) }))} options={fields.filter((field) => field.canDimension ?? !['number', 'currency'].includes(field.semanticType)).map((field) => ({ value: field.key, label: field.label }))} />{fieldFromSource(source!, dimension.field)?.semanticType === 'date' ? <SearchSelect className="w-28" value={dimension.bin ?? ''} onChange={(bin) => updateQuery((query) => ({ ...query, dimensions: (query.dimensions ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, bin: bin ? bin as typeof item.bin : undefined } : item) }))} options={[{ value: '', label: 'Exact' }, ...['day', 'week', 'month', 'quarter', 'year'].map((value) => ({ value, label: value }))]} /> : null}<IconButton label="Remove dimension" onClick={() => updateQuery((query) => ({ ...query, dimensions: (query.dimensions ?? []).filter((_, itemIndex) => itemIndex !== index) }))} /></div>)}
        </StudioSection>

        <StudioSection title="Filters" onAdd={() => { const field = fields[0]; if (field) updateQuery((query) => ({ ...query, filters: [...(query.filters ?? []), { field: field.key, operator: 'eq', value: '' }] })) }}>
          {(draft.query.filters ?? []).map((filter, index) => <FilterRow key={index} filter={filter} fields={fields} onChange={(next) => updateQuery((query) => ({ ...query, filters: (query.filters ?? []).map((item, itemIndex) => itemIndex === index ? next : item) }))} onRemove={() => updateQuery((query) => ({ ...query, filters: (query.filters ?? []).filter((_, itemIndex) => itemIndex !== index) }))} />)}
        </StudioSection>
      </div>

      <div className="app-scroll min-h-0 overflow-y-auto bg-bg-subtle p-5">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">{(Object.keys(VISUALIZATIONS) as VisualizationKey[]).map((key) => <button key={key} type="button" onClick={() => update((current) => ({ ...current, visualization: key }))} className={cn('flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition [&_svg]:size-4', draft.visualization === key ? 'border-primary bg-primary-subtle text-primary' : 'border-border bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg')}>{VIZ_ICONS[key]}{VISUALIZATIONS[key].label}</button>)}</div>
          <VisualizationSettingsPanel visualization={draft.visualization} settings={draft.visualizationSettings} result={preview} onChange={(visualizationSettings) => update((current) => ({ ...current, visualizationSettings }))} />
          <div className="relative min-h-[420px] rounded-xl border border-border bg-surface p-4 shadow-sm">{running ? <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-surface/70 backdrop-blur-sm"><div className="flex items-center gap-2 text-sm text-fg-muted"><Loader2 className="size-4 animate-spin" />Running preview…</div></div> : null}{previewError ? <div role="alert" className="grid min-h-[380px] place-items-center px-8 text-center text-sm text-danger">{previewError}</div> : preview ? <div className="h-[380px]"><InsightResultView result={preview} visualization={draft.visualization} settings={draft.visualizationSettings} /></div> : null}</div>
          {preview ? <div className="flex items-center justify-between text-xs text-fg-subtle"><span>{preview.rowCount} rows · {preview.durationMs}ms</span>{preview.truncated ? <Badge variant="warning">Truncated</Badge> : null}</div> : null}
        </div>
      </div>
    </div>
    <footer className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-5 text-xs text-fg-muted"><span>{saveState === 'saving' ? 'Saving changes…' : saveState === 'error' ? saveError : 'All changes saved'}</span><div className="flex gap-2">{onDelete ? <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={async () => { await onDelete(draft) }}><Trash2 size={14} />Delete</Button> : null}{onPublishChange ? <Button type="button" variant="outline" size="sm" onClick={async () => { const published = draft.status !== 'published'; const result = await onPublishChange(published, draft); if (result.ok) update((current) => ({ ...current, status: published ? 'published' : 'draft', id: result.id ?? current.id })) }}>{draft.status === 'published' ? 'Unpublish' : 'Publish'}</Button> : null}</div></footer>
  </div>
}

function StudioSection({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return <section className="space-y-2"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-fg">{title}</h3><Button type="button" variant="ghost" size="sm" onClick={onAdd}><Plus size={13} />Add</Button></div><div className="space-y-2">{children}</div></section>
}

function MeasureRow({ measure, fields, error, onChange, onFormulaError, onRemove }: { measure: QueryMeasure; fields: AnalyticsField[]; error?: string; onChange: (measure: QueryMeasure) => void; onFormulaError: (error: string) => void; onRemove: () => void }) {
  if (measure.kind === 'formula') return <FormulaRow measure={measure} fields={fields} error={error} onChange={onChange} onError={onFormulaError} onRemove={onRemove} />
  return <div className="flex items-center gap-2"><SearchSelect className="w-32" value={measure.fn} onChange={(fn) => onChange({ ...measure, fn: fn as typeof measure.fn, field: fn === 'count' ? undefined : measure.field ?? fields.find((field) => field.canMeasure ?? ['number', 'currency'].includes(field.semanticType))?.key })} options={['count', 'count_distinct', 'sum', 'avg', 'min', 'max'].map((value) => ({ value, label: value.replace('_', ' ') }))} />{measure.fn !== 'count' ? <SearchSelect className="min-w-0 flex-1" value={measure.field ?? ''} onChange={(field) => onChange({ ...measure, field })} options={fields.filter((field) => measure.fn === 'count_distinct' || (field.canMeasure ?? ['number', 'currency'].includes(field.semanticType))).map((field) => ({ value: field.key, label: field.label }))} /> : <div className="flex-1 rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">Rows</div>}<IconButton label="Remove measure" onClick={onRemove} /></div>
}

function FormulaRow({ measure, fields, error, onChange, onError, onRemove }: { measure: QueryFormulaMeasure; fields: AnalyticsCatalog['sources'][number]['fields']; error?: string; onChange: (measure: QueryMeasure) => void; onError: (error: string) => void; onRemove: () => void }) {
  const [formula, setFormula] = React.useState(() => serializeFormula(measure.formula, (key) => fields.find((field) => field.key === key)?.label ?? key))
  function parse(value: string) {
    setFormula(value)
    const parsed = parseFormula(value, { resolveField: (label) => fields.find((field) => field.label.toLowerCase() === label.toLowerCase() || field.key === label)?.key ?? null })
    if (parsed.ok) { onError(''); onChange({ ...measure, formula: parsed.expression }) }
    else onError(`${parsed.error} at character ${parsed.position + 1}`)
  }
  return <div className="space-y-1.5 rounded-lg border border-border bg-bg-subtle p-2.5"><div className="flex gap-2"><Input value={measure.label ?? measure.alias} onChange={(event) => onChange({ ...measure, label: event.target.value, alias: event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'custom_metric' })} aria-label="Formula label" className="h-9" /><IconButton label="Remove formula" onClick={onRemove} /></div><Textarea value={formula} onChange={(event) => parse(event.target.value)} aria-invalid={!!error} className="min-h-20 font-mono text-xs" aria-label="Formula expression" />{error ? <p className="text-xs text-danger">{error}</p> : <p className="text-[11px] text-fg-subtle">Use fields like [Created at] and functions such as count(), sum(), datediff(), and case().</p>}</div>
}

function FilterRow({ filter, fields, onChange, onRemove }: { filter: QueryFilter; fields: AnalyticsCatalog['sources'][number]['fields']; onChange: (filter: QueryFilter) => void; onRemove: () => void }) {
  const selectedField = fields.find((field) => field.key === filter.field) ?? fields[0]
  const operators = selectedField ? filterOperatorsForField(selectedField) : [...FILTER_OPERATORS]
  return <div className="space-y-2 rounded-lg border border-border bg-bg-subtle p-2.5"><div className="flex gap-2"><SearchSelect className="min-w-0 flex-1" value={filter.field} onChange={(field) => { const nextField = fields.find((item) => item.key === field); const allowed = nextField ? filterOperatorsForField(nextField) : []; onChange({ ...filter, field, operator: allowed.includes(filter.operator) ? filter.operator : 'eq' }) }} options={fields.map((field) => ({ value: field.key, label: field.label }))} /><IconButton label="Remove filter" onClick={onRemove} /></div><div className="grid grid-cols-2 gap-2"><SearchSelect value={filter.operator} onChange={(operator) => onChange({ ...filter, operator: operator as QueryFilter['operator'], value: NO_VALUE_FILTERS.has(operator) ? undefined : filter.value })} options={operators.map((operator) => ({ value: operator, label: FILTER_LABELS[operator] }))} />{NO_VALUE_FILTERS.has(filter.operator) ? <div /> : <Input value={Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value ?? '')} onChange={(event) => onChange({ ...filter, value: filter.operator === 'in' || filter.operator === 'not_in' ? event.target.value.split(',').map((value) => value.trim()).filter(Boolean) : filter.operator === 'last_n_days' ? Number(event.target.value) : event.target.value })} placeholder="Value" />}</div></div>
}

function VisualizationSettingsPanel({ visualization, settings, result, onChange }: { visualization: VisualizationKey; settings: VisualizationSettings; result: QueryResult | null; onChange: (settings: VisualizationSettings) => void }) {
  const measures = result?.columns.filter((column) => column.role === 'measure') ?? []
  if (visualization === 'table') return null
  return <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-surface p-3"><div className="min-w-40 space-y-1"><Label>Value</Label><SearchSelect value={typeof settings.valueField === 'string' ? settings.valueField : ''} onChange={(valueField) => onChange({ ...settings, valueField })} options={[{ value: '', label: 'Auto' }, ...measures.map((measure) => ({ value: measure.key, label: measure.label }))]} /></div>{visualization === 'progress' || visualization === 'gauge' ? <div className="w-28 space-y-1"><Label>Goal</Label><Input type="number" value={Number(settings.goal ?? 100)} onChange={(event) => onChange({ ...settings, goal: Number(event.target.value) })} /></div> : null}{['bar', 'row', 'line', 'area'].includes(visualization) ? <label className="flex items-center gap-2 pb-2 text-sm"><Checkbox checked={settings.showValues === true} onChange={(event) => onChange({ ...settings, showValues: event.target.checked })} />Values</label> : null}</div>
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} onClick={onClick} className="grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle transition hover:bg-surface-hover hover:text-danger"><Trash2 size={14} /></button>
}
