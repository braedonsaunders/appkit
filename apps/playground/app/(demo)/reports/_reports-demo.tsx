'use client'

import * as React from 'react'
import { resolvePreset, resolveReportLayout, type CustomReportQuery, type ReportCellContext, type ReportColumn, type ReportDrillResponse, type ReportEntityCatalog, type ReportRule, type ReportRuleGroup, type ReportRunResult, type ReportSchedule } from '@appkit/reports'
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

type PortfolioDrillTarget = { project: string; column: 'value' | 'margin'; label: string }

function portfolioDrillTarget(context: ReportCellContext): PortfolioDrillTarget | null {
  if (context.columnKey !== 'value' && context.columnKey !== 'margin') return null
  return { project: String(context.row.name), column: context.columnKey, label: `${context.row.name} · ${context.columnKey === 'value' ? 'Contract value' : 'Margin'}` }
}

const supportingActivity = [
  { date: '2026-07-18', type: 'Approved change', owner: 'Delivery', amount: 184000 },
  { date: '2026-07-11', type: 'Progress claim', owner: 'Finance', amount: 426500 },
  { date: '2026-06-28', type: 'Forecast revision', owner: 'Project controls', amount: -37500 },
  { date: '2026-06-14', type: 'Purchase commitment', owner: 'Procurement', amount: 218750 },
  { date: '2026-05-30', type: 'Labour forecast', owner: 'Operations', amount: 96300 },
]

async function loadPortfolioDrill(target: PortfolioDrillTarget, page: number, signal: AbortSignal): Promise<ReportDrillResponse> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const perPage = 3
  const start = (page - 1) * perPage
  const project = rows.find((row) => row.name === target.project)
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  return {
    title: target.label,
    description: `Supporting activity for ${target.project}`,
    summary: [
      { label: 'Contract value', value: currency.format(project?.value ?? 0) },
      { label: 'Forecast margin', value: `${project?.margin ?? 0}%` },
    ],
    columns: [{ label: 'Date' }, { label: 'Activity' }, { label: 'Owner' }, { label: 'Amount', align: 'right' }],
    rows: supportingActivity.slice(start, start + perPage).map((activity, index) => ({ key: `${page}-${index}`, cells: [activity.date, activity.type, activity.owner, currency.format(activity.amount)] })),
    page,
    perPage,
    total: supportingActivity.length,
  }
}

export function ReportsDemo() {
  const [value, setValue] = React.useState(initial)
  const [result, setResult] = React.useState<ReportRunResult>(() => execute(value.definition.query))
  React.useEffect(() => {
    try { const stored = window.localStorage.getItem('appkit-demo:report-studio:v2'); if (stored) { const parsed = JSON.parse(stored) as ReportStudioValue; setValue(parsed); setResult(execute(parsed.definition.query)) } } catch { /* browser persistence is optional */ }
  }, [])
  return <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface shadow-sm"><ReportStudio
    value={value}
    catalog={catalog}
    result={result}
    organization="Northstar Works"
    currency="USD"
    drill={{ target: portfolioDrillTarget, load: loadPortfolioDrill }}
    exports={[
      { format: 'pdf', label: 'PDF', href: '/api/demo/pdf?kind=report' },
      { format: 'csv', label: 'CSV', onSelect: () => downloadCsv(result) },
    ]}
    printHref="/api/demo/pdf?kind=report"
    onChange={setValue}
    onPreview={async (next) => { const output = execute(next.definition.query); setResult(output); return output }}
    onSave={async (next) => { try { window.localStorage.setItem('appkit-demo:report-studio:v2', JSON.stringify(next)); setValue(next); return { ok: true } } catch { return { ok: false, error: 'The browser could not save this report.' } } }}
  /></div>
}

function downloadCsv(result: ReportRunResult): void {
  const lines: string[] = []
  for (const group of result.groups) {
    if (result.groups.length > 1) lines.push(csvCell(group.title))
    lines.push(group.columns.map((column) => csvCell(column.label)).join(','))
    for (const row of group.rows) lines.push(group.columns.map((column) => csvCell(row[column.key])).join(','))
    lines.push('')
  }
  const href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = 'project-portfolio.csv'
  anchor.click()
  URL.revokeObjectURL(href)
}

function csvCell(value: unknown): string { return `"${String(value ?? '').replaceAll('"', '""')}"` }

function execute(query: CustomReportQuery): ReportRunResult {
  const entity = catalog.entities[0]!
  let selected = rows.filter((row) => query.filters ? matchesGroup(row, query.filters) : true)
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
function matchesGroup(row: typeof rows[number], group: ReportRuleGroup): boolean {
  const values = group.rules.map((rule) => isRule(rule) ? matches(row, rule) : matchesGroup(row, rule))
  const matched = group.combinator === 'or' ? values.some(Boolean) : values.every(Boolean)
  return group.not ? !matched : matched
}
function matches(row: typeof rows[number], rule: ReportRule): boolean {
  const value = row[rule.field as keyof typeof row], expected = rule.value
  if (rule.operator === 'eq') return String(value) === String(expected)
  if (rule.operator === 'neq') return String(value) !== String(expected)
  if (rule.operator === 'contains') return String(value).toLowerCase().includes(String(expected).toLowerCase())
  if (rule.operator === 'gte') return compare(value, expected) >= 0
  if (rule.operator === 'lte') return compare(value, expected) <= 0
  if (rule.operator === 'is_null') return value == null || value === ''
  if (rule.operator === 'is_not_null') return value != null && value !== ''
  if (rule.operator === 'is_true') return String(value) === 'true'
  if (rule.operator === 'is_false') return String(value) === 'false'
  if (rule.operator === 'in') return Array.isArray(expected) ? expected.map(String).includes(String(value)) : false
  if (rule.operator === 'not_in') return !matches(row, { ...rule, operator: 'in' })
  const today = '2026-07-21'
  if (rule.operator === 'period_preset' && typeof expected === 'string') { const range = resolvePreset(expected, { startMonth: 1, today }); return Boolean(range && String(value) >= range.from && String(value) <= range.to) }
  const valueDate = new Date(String(value)), now = new Date(`${today}T12:00:00Z`)
  if (Number.isNaN(valueDate.valueOf())) return false
  if (rule.operator === 'between_days_ago') return valueDate >= new Date(now.valueOf() - Number(expected ?? 30) * 86_400_000) && valueDate <= now
  if (rule.operator === 'due_within_days') return valueDate <= new Date(now.valueOf() + Number(expected ?? 30) * 86_400_000)
  if (rule.operator === 'before_now') return valueDate < now
  if (rule.operator === 'since_today') return String(value).slice(0, 10) === today
  if (rule.operator === 'this_month') return String(value).slice(0, 7) === today.slice(0, 7)
  if (rule.operator === 'this_year') return String(value).slice(0, 4) === today.slice(0, 4)
  if (rule.operator === 'this_week') { const day = now.getUTCDay() || 7; const from = new Date(now.valueOf() - (day - 1) * 86_400_000); const to = new Date(from.valueOf() + 7 * 86_400_000); return valueDate >= from && valueDate < to }
  return false
}
function compare(left: unknown, right: unknown): number { if (typeof left === 'number' || typeof right === 'number') return Number(left) - Number(right); return String(left).localeCompare(String(right)) }
function isRule(value: ReportRule | { rules: unknown[] }): value is ReportRule { return !('rules' in value) }
