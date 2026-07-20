'use client'

import * as React from 'react'
import { resolveReportLayout, type CustomReportQuery, type ReportColumn, type ReportEntityCatalog, type ReportRule, type ReportRunResult, type ReportSchedule } from '@appkit/reports'
import { ReportStudio, type ReportStudioValue } from '@appkit/reports/react'

const catalog: ReportEntityCatalog = { entities: [{
  key: 'projects', label: 'Projects', category: 'Operations', description: 'Projects, owners, status, value, and key dates.', from: 'projects p', tenantColumn: 'p.tenant_id',
  columns: [
    { key: 'name', label: 'Project', kind: 'text', expression: 'p.name' },
    { key: 'owner', label: 'Owner', kind: 'text', expression: 'p.owner' },
    { key: 'region', label: 'Region', kind: 'enum', expression: 'p.region' },
    { key: 'status', label: 'Status', kind: 'enum', expression: 'p.status' },
    { key: 'value', label: 'Contract value', kind: 'number', expression: 'p.value' },
    { key: 'margin', label: 'Margin', kind: 'number', expression: 'p.margin' },
    { key: 'start_date', label: 'Start date', kind: 'date', expression: 'p.start_date' },
  ],
  defaultColumns: ['name', 'owner', 'region', 'status', 'value', 'start_date'], defaultSort: { column: 'start_date', direction: 'desc' },
}] }

const rows = [
  { name: 'North Tower', owner: 'Avery Chen', region: 'Central', status: 'Active', value: 1840000, margin: 18.4, start_date: '2026-02-03' },
  { name: 'Civic Library', owner: 'Noah Williams', region: 'East', status: 'Bidding', value: 725000, margin: 14.1, start_date: '2026-08-15' },
  { name: 'Harbour Plant', owner: 'Maya Singh', region: 'West', status: 'Active', value: 2430000, margin: 21.8, start_date: '2025-11-18' },
  { name: 'Lakeside School', owner: 'Avery Chen', region: 'Central', status: 'Planning', value: 960000, margin: 16.3, start_date: '2026-09-01' },
  { name: 'Transit Annex', owner: 'Maya Singh', region: 'West', status: 'Active', value: 1310000, margin: 19.7, start_date: '2026-04-27' },
  { name: 'Research Wing', owner: 'Noah Williams', region: 'East', status: 'Complete', value: 3175000, margin: 23.2, start_date: '2024-10-12' },
]

const schedule: ReportSchedule = { schemaVersion: 1, id: 'weekly', reportId: 'portfolio', name: 'Monday portfolio', enabled: true, cadence: 'weekly', timezone: 'America/Toronto', hour: 8, minute: 30, dayOfWeek: 1, format: 'pdf', recipients: ['operations@example.com'] }
const initial: ReportStudioValue = { definition: { schemaVersion: 1, id: 'portfolio', slug: 'project-portfolio', name: 'Project portfolio', description: 'Active and upcoming project work.', query: { entity: 'projects', mode: 'rows', columns: ['name', 'owner', 'region', 'status', 'value', 'start_date'], filters: null, groupBy: 'status', sorts: [{ column: 'start_date', direction: 'desc' }] }, layout: resolveReportLayout(), state: 'published', tags: ['operations'] }, schedule }

export function ReportsDemo() {
  const [value, setValue] = React.useState(initial)
  const [result, setResult] = React.useState<ReportRunResult>(() => execute(value.definition.query))
  React.useEffect(() => {
    try { const stored = window.localStorage.getItem('appkit-demo:report-studio:v1'); if (stored) { const parsed = JSON.parse(stored) as ReportStudioValue; setValue(parsed); setResult(execute(parsed.definition.query)) } } catch { /* browser persistence is optional */ }
  }, [])
  return <div className="flex min-h-[720px] flex-1 overflow-hidden rounded-xl border border-border bg-surface shadow-sm"><ReportStudio value={value} catalog={catalog} result={result} onChange={setValue} onPreview={async (next) => { const output = execute(next.definition.query); setResult(output); return output }} onSave={async (next) => { try { window.localStorage.setItem('appkit-demo:report-studio:v1', JSON.stringify(next)); setValue(next); return { ok: true } } catch { return { ok: false, error: 'The browser could not save this report.' } } }} /></div>
}

function execute(query: CustomReportQuery): ReportRunResult {
  const entity = catalog.entities[0]!
  let selected = rows.filter((row) => query.filters?.rules.filter(isRule).every((rule) => matches(row, rule)) ?? true)
  for (const sort of [...(query.sorts ?? [])].reverse()) selected = [...selected].sort((left, right) => compare(left[sort.column as keyof typeof left], right[sort.column as keyof typeof right]) * (sort.direction === 'asc' ? 1 : -1))
  if (query.mode === 'summarize') return summarize(query, selected)
  const columns = query.columns.map((key): ReportColumn => { const column = entity.columns.find((item) => item.key === key)!; return { key, label: column.label, semanticType: column.kind === 'number' ? key === 'value' ? 'currency' : 'number' : column.kind === 'date' ? 'date' : column.kind === 'enum' ? 'category' : 'text', align: column.kind === 'number' ? 'right' : 'left' } })
  if (query.groupBy) {
    const groups = new Map<string, typeof rows>()
    for (const row of selected) { const label = String(row[query.groupBy as keyof typeof row] ?? '(none)'); groups.set(label, [...(groups.get(label) ?? []), row]) }
    return { groups: [...groups].map(([title, groupRows]) => ({ kind: 'section' as const, title, subtitle: `${groupRows.length} projects`, columns, rows: groupRows })), summary: [], rowCount: selected.length, truncated: false, durationMs: 8 }
  }
  return { groups: [{ kind: 'results', title: 'Results', columns, rows: selected, isEmpty: !selected.length }], summary: [], rowCount: selected.length, truncated: false, durationMs: 8 }
}

function summarize(query: CustomReportQuery, input: typeof rows): ReportRunResult {
  const breakouts = query.breakouts ?? [], measures = query.measures?.length ? query.measures : [{ aggregate: 'count' as const }]
  const groups = new Map<string, typeof rows>()
  for (const row of input) { const values = breakouts.map((breakout) => bucket(row[breakout.column as keyof typeof row], breakout.bin)); const key = JSON.stringify(values); groups.set(key, [...(groups.get(key) ?? []), row]) }
  const columns: ReportColumn[] = [...breakouts.map((breakout, index) => ({ key: `d${index}`, label: catalog.entities[0]!.columns.find((column) => column.key === breakout.column)?.label ?? breakout.column, semanticType: breakout.bin ? 'date' as const : 'category' as const })), ...measures.map((measure, index) => ({ key: `m${index}`, label: measure.label ?? (measure.aggregate === 'count' ? 'Count' : `${measure.aggregate} of ${measure.column}`), semanticType: measure.column === 'value' ? 'currency' as const : 'number' as const, align: 'right' as const }))]
  const output = [...groups].map(([key, groupRows]) => { const dimensions = JSON.parse(key) as unknown[]; return Object.fromEntries([...dimensions.map((dimension, index) => [`d${index}`, dimension] as const), ...measures.map((measure, index) => [`m${index}`, aggregate(groupRows, measure.aggregate, measure.column)] as const)]) })
  return { groups: [{ kind: 'summary', title: 'Summary', columns, rows: output, isEmpty: !output.length }], summary: [], rowCount: output.length, truncated: false, durationMs: 6 }
}

function aggregate(input: typeof rows, aggregateName: string, column?: string): number { const values = column ? input.map((row) => Number(row[column as keyof typeof row])).filter(Number.isFinite) : []; if (aggregateName === 'count') return input.length; if (aggregateName === 'count_distinct') return new Set(input.map((row) => row[column as keyof typeof row])).size; if (!values.length) return 0; if (aggregateName === 'sum') return values.reduce((sum, value) => sum + value, 0); if (aggregateName === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length; return aggregateName === 'min' ? Math.min(...values) : Math.max(...values) }
function bucket(value: unknown, bin?: string): unknown { if (!bin) return value; const date = new Date(String(value)); if (Number.isNaN(date.valueOf())) return value; if (bin === 'year' || bin === 'fiscal_year') return String(date.getUTCFullYear()); if (bin === 'quarter' || bin === 'fiscal_quarter') return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`; return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` }
function matches(row: typeof rows[number], rule: ReportRule): boolean { const value = row[rule.field as keyof typeof row], expected = rule.value; if (rule.operator === 'eq') return String(value) === String(expected); if (rule.operator === 'neq') return String(value) !== String(expected); if (rule.operator === 'contains') return String(value).toLowerCase().includes(String(expected).toLowerCase()); if (rule.operator === 'gte') return compare(value, expected) >= 0; if (rule.operator === 'lte') return compare(value, expected) <= 0; if (rule.operator === 'is_null') return value == null || value === ''; if (rule.operator === 'is_not_null') return value != null && value !== ''; if (rule.operator === 'in') return Array.isArray(expected) ? expected.map(String).includes(String(value)) : String(expected).split(',').map((item) => item.trim()).includes(String(value)); if (rule.operator === 'not_in') return !matches(row, { ...rule, operator: 'in' }); return true }
function compare(left: unknown, right: unknown): number { if (typeof left === 'number' || typeof right === 'number') return Number(left) - Number(right); return String(left).localeCompare(String(right)) }
function isRule(value: ReportRule | { rules: unknown[] }): value is ReportRule { return !('rules' in value) }
