'use client'

import * as React from 'react'
import { computeNextReportRun, describeReportSchedule, reportScheduleRecipientCount, resolvePreset, resolveReportLayout, type ParsedReportScheduleForm, type ReportCustomQuery, type ReportCellContext, type ReportColumn, type ReportDrillResponse, type ReportEntityCatalog, type ReportRule, type ReportRuleGroup, type ReportRunResult, type ReportSchedule } from '@appkit/reports'
import {
  ReportDrillDrawer,
  ReportFilterBar,
  ReportPaper,
  ReportRunDetail,
  ReportRunHistory,
  ReportScheduleForm,
  ReportScheduleList,
  ReportStudio,
  StatementMatrixTable,
  type ReportFilterValue,
  type ReportScheduleDefinitionOption,
  type ReportScheduleMemberOption,
  type ReportScheduleRun,
  type ReportStudioValue,
  type StatementMatrixView,
  type StatementSectionVisibility,
} from '@appkit/reports/react'
import { Button, cn } from '@appkit/ui'

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

const schedule: ReportSchedule = { schemaVersion: 1, id: 'weekly', definitionId: 'portfolio', name: 'Monday portfolio', active: true, cadence: 'weekly', timezone: 'America/Toronto', hour: 8, minute: 30, dayOfWeek: 1, repeatEvery: 1, recipientUserIds: [], recipientEmails: ['operations@example.com'], filters: {} }
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
  const [surface, setSurface] = React.useState<'builder' | 'statement' | 'schedules'>('builder')
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
    <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
      {[{ key: 'builder' as const, label: 'Report builder' }, { key: 'statement' as const, label: 'Statement viewer' }, { key: 'schedules' as const, label: 'Schedules' }].map((item) => <button key={item.key} type="button" onClick={() => setSurface(item.key)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', surface === item.key ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg')}>{item.label}</button>)}
    </div>
    {surface === 'builder' ? <CustomReportDemo /> : surface === 'statement' ? <StatementDemo /> : <SchedulesDemo />}
  </div>
}

function CustomReportDemo() {
  const [value, setValue] = React.useState(initial)
  const [result, setResult] = React.useState<ReportRunResult>(() => execute(value.definition.query))
  React.useEffect(() => {
    try { const stored = window.localStorage.getItem('appkit-demo:report-studio:v2'); if (stored) { const parsed = JSON.parse(stored) as ReportStudioValue; setValue(parsed); setResult(execute(parsed.definition.query)) } } catch { /* browser persistence is optional */ }
  }, [])
  return <div className="flex min-h-0 flex-1 overflow-hidden"><ReportStudio
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

const scheduleDefinitions: ReportScheduleDefinitionOption[] = [
  { id: 'portfolio', name: 'Project portfolio', category: 'Operations', kind: 'custom', description: 'Active and upcoming project work.', entity: catalog.entities[0] },
  { id: 'income-statement', name: 'Income statement', category: 'Financial statements', kind: 'built_in', description: 'Revenue, costs, and operating income.', entity: catalog.entities[0] },
  { id: 'margin-review', name: 'Project margin review', category: 'Operations', kind: 'custom', description: 'Contract value and forecast margin by project.', entity: catalog.entities[0] },
]

const scheduleMembers: ReportScheduleMemberOption[] = [
  { userId: 'member-avery', name: 'Avery Chen', email: 'avery@example.com' },
  { userId: 'member-maya', name: 'Maya Singh', email: 'maya@example.com' },
  { userId: 'member-noah', name: 'Noah Williams', email: 'noah@example.com' },
]

const initialSchedules: ReportSchedule[] = [
  { id: 'schedule-portfolio', definitionId: 'portfolio', name: 'Monday portfolio', active: true, cadence: 'weekly', timezone: 'America/Toronto', hour: 8, minute: 30, dayOfWeek: 1, dayOfMonth: null, weekOfMonth: null, repeatEvery: 1, startsOn: '2026-01-01', endsOn: null, recipientUserIds: ['member-avery'], recipientEmails: ['operations@example.com'], filters: { combinator: 'and', rules: [{ field: 'status', op: 'eq', value: 'Active' }] }, emailSubject: 'Weekly project portfolio', emailMessage: 'Please review the active portfolio before the delivery meeting.', nextRunAt: '2026-07-27T12:30:00.000Z', lastRunAt: '2026-07-20T12:30:06.000Z' },
  { id: 'schedule-income', definitionId: 'income-statement', name: 'Month-end statement', active: false, cadence: 'monthly', timezone: 'America/Toronto', hour: 7, minute: 0, dayOfWeek: 1, dayOfMonth: null, weekOfMonth: 5, repeatEvery: 1, startsOn: null, endsOn: null, recipientUserIds: ['member-maya', 'member-noah'], recipientEmails: [], filters: {}, emailSubject: null, emailMessage: null, nextRunAt: null, lastRunAt: '2026-06-30T11:00:04.000Z' },
]

const initialScheduleRuns: ReportScheduleRun[] = [
  { id: 'run-portfolio-3', scheduleId: 'schedule-portfolio', trigger: 'scheduled', status: 'succeeded', rowCount: 6, startedAt: '2026-07-20T12:30:00.000Z', finishedAt: '2026-07-20T12:30:06.000Z', artifact: { filename: 'project-portfolio-2026-07-20.pdf', sizeBytes: 148_320, contentType: 'application/pdf', createdAt: '2026-07-20T12:30:06.000Z', href: '/api/demo/pdf?kind=report' } },
  { id: 'run-portfolio-2', scheduleId: 'schedule-portfolio', trigger: 'manual', status: 'failed', error: 'The report source timed out before the tenant-scoped query completed.', rowCount: null, startedAt: '2026-07-16T15:12:00.000Z', finishedAt: '2026-07-16T15:12:30.000Z', artifact: null },
  { id: 'run-portfolio-1', scheduleId: 'schedule-portfolio', trigger: 'scheduled', status: 'succeeded', rowCount: 5, startedAt: '2026-07-13T12:30:00.000Z', finishedAt: '2026-07-13T12:30:05.000Z', artifact: { filename: 'project-portfolio-2026-07-13.pdf', sizeBytes: 143_980, contentType: 'application/pdf', createdAt: '2026-07-13T12:30:05.000Z', href: '/api/demo/pdf?kind=report' } },
  { id: 'run-income-1', scheduleId: 'schedule-income', trigger: 'scheduled', status: 'succeeded', rowCount: 9, startedAt: '2026-06-30T11:00:00.000Z', finishedAt: '2026-06-30T11:00:04.000Z', artifact: { filename: 'income-statement-2026-06.pdf', sizeBytes: 181_204, contentType: 'application/pdf', createdAt: '2026-06-30T11:00:04.000Z', href: '/api/demo/pdf?kind=report' } },
]

type ScheduleSurface = { mode: 'list' } | { mode: 'detail'; scheduleId: string } | { mode: 'edit'; scheduleId?: string }

function SchedulesDemo() {
  const [schedules, setSchedules] = React.useState(initialSchedules)
  const [runs, setRuns] = React.useState(initialScheduleRuns)
  const [surface, setSurface] = React.useState<ScheduleSurface>({ mode: 'list' })
  const [scheduleQuery, setScheduleQuery] = React.useState('')
  const [scheduleStatus, setScheduleStatus] = React.useState<'all' | 'active' | 'paused'>('all')
  const [runQuery, setRunQuery] = React.useState('')
  const [runStatus, setRunStatus] = React.useState<'all' | 'queued' | 'running' | 'succeeded' | 'failed'>('all')
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null)
  const [hydrated, setHydrated] = React.useState(false)
  const runDetailRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem('appkit-demo:report-schedules:v1')
      if (stored) {
        const parsed = JSON.parse(stored) as { schedules?: ReportSchedule[]; runs?: ReportScheduleRun[] }
        if (Array.isArray(parsed.schedules) && Array.isArray(parsed.runs)) {
          setSchedules(parsed.schedules)
          setRuns(parsed.runs)
        }
      }
    } catch { /* browser persistence is optional */ }
    setHydrated(true)
  }, [])

  React.useEffect(() => {
    if (!hydrated) return
    try { window.localStorage.setItem('appkit-demo:report-schedules:v1', JSON.stringify({ schedules, runs })) } catch { /* browser persistence is optional */ }
  }, [hydrated, runs, schedules])

  React.useEffect(() => {
    if (selectedRunId) runDetailRef.current?.scrollIntoView({ block: 'start' })
  }, [selectedRunId])

  const visibleSchedules = schedules.filter((item) => {
    if (scheduleStatus === 'active' && !item.active) return false
    if (scheduleStatus === 'paused' && item.active) return false
    const needle = scheduleQuery.trim().toLowerCase()
    if (!needle) return true
    const definition = scheduleDefinitions.find((entry) => entry.id === item.definitionId)
    return `${item.name} ${definition?.name ?? ''} ${describeReportSchedule(item)}`.toLowerCase().includes(needle)
  })
  const selectedSchedule = surface.mode === 'detail' || surface.mode === 'edit' && surface.scheduleId ? schedules.find((item) => item.id === surface.scheduleId) : undefined
  const scheduleRuns = selectedSchedule ? runs.filter((run) => {
    if (run.scheduleId !== selectedSchedule.id) return false
    if (runStatus !== 'all' && run.status !== runStatus) return false
    const needle = runQuery.trim().toLowerCase()
    return !needle || `${run.status} ${run.trigger} ${run.error ?? ''} ${run.artifact?.filename ?? ''}`.toLowerCase().includes(needle)
  }) : []
  const selectedRun = selectedRunId ? runs.find((run) => run.id === selectedRunId) : undefined

  function saveSchedule(value: ParsedReportScheduleForm) {
    const existing = surface.mode === 'edit' && surface.scheduleId ? schedules.find((item) => item.id === surface.scheduleId) : undefined
    const id = existing?.id ?? `schedule-${Date.now()}`
    const next: ReportSchedule = { ...value, id, active: existing?.active ?? true, lastRunAt: existing?.lastRunAt ?? null }
    next.nextRunAt = computeNextReportRun(next)?.toISOString() ?? null
    setSchedules((current) => existing ? current.map((item) => item.id === id ? next : item) : [next, ...current])
    setSelectedRunId(null)
    setSurface({ mode: 'detail', scheduleId: id })
  }

  function toggleSchedule(item: ReportSchedule) {
    const active = !item.active
    const next = { ...item, active, nextRunAt: null as string | Date | null }
    next.nextRunAt = active ? computeNextReportRun(next)?.toISOString() ?? null : null
    setSchedules((current) => current.map((entry) => entry.id === item.id ? next : entry))
  }

  function runSchedule(item: ReportSchedule) {
    const startedAt = new Date()
    const finishedAt = new Date(startedAt.getTime() + 4_000)
    const definition = scheduleDefinitions.find((entry) => entry.id === item.definitionId)
    const filename = `${(definition?.name ?? 'report').toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${startedAt.toISOString().slice(0, 10)}.pdf`
    const run: ReportScheduleRun = { id: `run-${Date.now()}`, scheduleId: item.id, trigger: 'manual', status: 'succeeded', rowCount: rows.length, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), artifact: { filename, sizeBytes: 152_408, contentType: 'application/pdf', createdAt: finishedAt.toISOString(), href: '/api/demo/pdf?kind=report' } }
    setRuns((current) => [run, ...current])
    setSchedules((current) => current.map((entry) => entry.id === item.id ? { ...entry, lastRunAt: finishedAt.toISOString() } : entry))
    setSelectedRunId(run.id)
    setSurface({ mode: 'detail', scheduleId: item.id })
  }

  function deleteSchedule(item: ReportSchedule) {
    if (!window.confirm(`Delete “${item.name}”?`)) return
    setSchedules((current) => current.filter((entry) => entry.id !== item.id))
    setRuns((current) => current.filter((run) => run.scheduleId !== item.id))
    setSelectedRunId(null)
    setSurface({ mode: 'list' })
  }

  if (surface.mode === 'edit') return <div key={`schedule-editor-${surface.scheduleId ?? 'new'}`} className="app-scroll min-h-0 flex-1 overflow-y-auto bg-bg-subtle p-4 lg:p-6"><section className="mx-auto max-w-5xl rounded-xl border border-border bg-surface p-4 shadow-sm lg:p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-fg">{selectedSchedule ? 'Edit schedule' : 'New schedule'}</h2><p className="mt-1 text-sm text-fg-muted">Configure delivery, recipients, filters, and report timing.</p></div><ReportScheduleForm key={selectedSchedule?.id ?? 'new'} definitions={scheduleDefinitions} members={scheduleMembers} initial={selectedSchedule} defaultTimezone="America/Toronto" submitLabel={selectedSchedule ? 'Save changes' : 'Create schedule'} onSubmit={saveSchedule} onCancel={() => setSurface(selectedSchedule ? { mode: 'detail', scheduleId: selectedSchedule.id } : { mode: 'list' })} /></section></div>

  if (surface.mode === 'detail' && selectedSchedule) {
    const definition = scheduleDefinitions.find((entry) => entry.id === selectedSchedule.definitionId)
    return <div key={`schedule-detail-${selectedSchedule.id}`} className="app-scroll min-h-0 flex-1 overflow-y-auto bg-bg-subtle p-4 lg:p-6"><div className="mx-auto max-w-7xl space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><button type="button" onClick={() => { setSelectedRunId(null); setSurface({ mode: 'list' }) }} className="mb-2 text-xs font-medium text-primary hover:underline">← All schedules</button><h2 className="text-xl font-semibold text-fg">{selectedSchedule.name}</h2><p className="mt-1 text-sm text-fg-muted">{definition?.name ?? selectedSchedule.definitionId}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setSurface({ mode: 'edit', scheduleId: selectedSchedule.id })}>Edit</Button><Button type="button" variant="outline" onClick={() => toggleSchedule(selectedSchedule)}>{selectedSchedule.active ? 'Pause' : 'Resume'}</Button><Button type="button" onClick={() => runSchedule(selectedSchedule)}>Run now</Button></div></div><section className="rounded-xl border border-border bg-surface p-4 shadow-sm"><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><ScheduleDetail label="Cadence">{describeReportSchedule(selectedSchedule)}</ScheduleDetail><ScheduleDetail label="Status">{selectedSchedule.active ? 'Active' : 'Paused'}</ScheduleDetail><ScheduleDetail label="Recipients">{reportScheduleRecipientCount(selectedSchedule)}</ScheduleDetail><ScheduleDetail label="Next run">{formatScheduleDate(selectedSchedule.nextRunAt)}</ScheduleDetail><ScheduleDetail label="Starts">{selectedSchedule.startsOn || 'No start bound'}</ScheduleDetail><ScheduleDetail label="Ends">{selectedSchedule.endsOn || 'No end bound'}</ScheduleDetail><ScheduleDetail label="Email subject">{selectedSchedule.emailSubject || 'Report default'}</ScheduleDetail><ScheduleDetail label="Filters"><code className="text-xs">{JSON.stringify(selectedSchedule.filters)}</code></ScheduleDetail></dl></section><section className="rounded-xl border border-border bg-surface p-4 shadow-sm"><div className="mb-4"><h3 className="text-base font-semibold text-fg">Run history</h3><p className="mt-1 text-sm text-fg-muted">Scheduled and manual executions, including stored output and failures.</p></div><ReportRunHistory runs={scheduleRuns} total={scheduleRuns.length} query={runQuery} status={runStatus} onQueryChange={setRunQuery} onStatusChange={setRunStatus} onOpen={(run) => setSelectedRunId(run.id)} />{selectedRun?.scheduleId === selectedSchedule.id ? <div ref={runDetailRef} className="mt-4 scroll-mt-4 border-t border-border pt-4"><ReportRunDetail run={selectedRun} schedule={selectedSchedule} definitionName={definition?.name} onDownload={() => window.open('/api/demo/pdf?kind=report', '_blank', 'noopener,noreferrer')} /></div> : null}</section></div></div>
  }

  return <div key="schedule-list" className="app-scroll min-h-0 flex-1 overflow-y-auto bg-bg-subtle p-4 lg:p-6"><div className="mx-auto max-w-7xl"><div className="mb-4"><h2 className="text-xl font-semibold text-fg">Report schedules</h2><p className="mt-1 text-sm text-fg-muted">Recurring report delivery and execution history.</p></div><ReportScheduleList schedules={visibleSchedules} definitions={scheduleDefinitions} query={scheduleQuery} status={scheduleStatus} total={visibleSchedules.length} onQueryChange={setScheduleQuery} onStatusChange={setScheduleStatus} onCreate={() => setSurface({ mode: 'edit' })} onOpen={(item) => setSurface({ mode: 'detail', scheduleId: item.id })} onToggle={toggleSchedule} onRun={runSchedule} onDelete={deleteSchedule} /></div></div>
}

function ScheduleDetail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-medium tracking-wide text-fg-muted uppercase">{label}</dt><dd className="mt-1 text-fg">{children}</dd></div>
}

function formatScheduleDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

type StatementDrillTarget = { account: string; label: string; column: string }

const statementView: StatementMatrixView = {
  columns: [
    { key: 'actual', label: 'Actual', group: 'Current period', kind: 'amount' },
    { key: 'budget', label: 'Budget', group: 'Current period', kind: 'amount' },
    { key: 'variance', label: 'Variance', group: 'Current period', kind: 'variance_pct' },
    { key: 'prior', label: 'Prior year', group: 'Comparison', kind: 'amount' },
  ],
  lines: [
    { key: 'revenue', kind: 'section', label: 'Revenue', depth: 0 },
    { key: 'services', kind: 'account', accountId: 'services', label: 'Services', number: '4100', depth: 0, values: [1_842_000, 1_760_000, 4.7, 1_611_000] },
    { key: 'maintenance', kind: 'account', accountId: 'maintenance', label: 'Maintenance', number: '4200', depth: 0, values: [428_000, 455_000, -5.9, 398_000] },
    { key: 'revenue-total', kind: 'subtotal', label: 'Total revenue', depth: 0, emphasis: true, values: [2_270_000, 2_215_000, 2.5, 2_009_000] },
    { key: 'costs', kind: 'section', label: 'Operating costs', depth: 0 },
    { key: 'delivery', kind: 'account', accountId: 'delivery', label: 'Project delivery', number: '5100', depth: 0, values: [-1_106_000, -1_084_000, -2, -982_000] },
    { key: 'labour', kind: 'account', accountId: 'labour', label: 'Labour', number: '5110', depth: 1, values: [-712_000, -690_000, -3.2, -641_000] },
    { key: 'materials', kind: 'account', accountId: 'materials', label: 'Materials', number: '5120', depth: 1, values: [-394_000, -394_000, 0, -341_000] },
    { key: 'overhead', kind: 'account', accountId: 'overhead', label: 'Overhead', number: '5200', depth: 0, values: [-386_000, -401_000, 3.7, -372_000] },
    { key: 'income', kind: 'total', label: 'Operating income', depth: 0, values: [778_000, 730_000, 6.6, 655_000] },
  ],
}

function StatementDemo() {
  const [filters, setFilters] = React.useState<ReportFilterValue>({ period: 'this_fiscal_year', breakout: 'none', compare: 'prior_year', basis: 'accrual', scale: 'actual' })
  const [visibility, setVisibility] = React.useState<StatementSectionVisibility>('expand')
  const [visibilityRevision, setVisibilityRevision] = React.useState(0)
  const [drillTarget, setDrillTarget] = React.useState<StatementDrillTarget | null>(null)
  const commandVisibility = (next: StatementSectionVisibility) => { setVisibility(next); setVisibilityRevision((current) => current + 1) }
  return <div className="flex min-h-0 flex-1 flex-col bg-bg-subtle">
    <div className="shrink-0 border-b border-border bg-surface p-3">
      <ReportFilterBar
        value={filters}
        onChange={setFilters}
        controls={{ period: true, breakout: true, compare: true, basis: true, scale: true, showZero: true, sections: true, dimensions: true }}
        dimensions={{ departments: [{ id: 'delivery', name: 'Delivery' }, { id: 'operations', name: 'Operations' }], projects: [], locations: [], classes: [] }}
        options={{ onExpandAll: () => commandVisibility('expand'), onCollapseAll: () => commandVisibility('collapse') }}
      />
    </div>
    <div className="app-scroll min-h-0 flex-1 overflow-auto p-4 lg:p-6">
      <ReportPaper organization="Northstar Works" title="Income statement" periodPhrase="Fiscal year to date">
        <StatementMatrixTable
          view={statementView}
          scale={filters.scale === 'thousands' || filters.scale === 'millions' ? filters.scale : 'actual'}
          currency="USD"
          visibility={visibility}
          visibilityRevision={visibilityRevision}
          drillTarget={({ line, column }) => line.accountId ? { account: line.accountId, label: `${line.label} · ${column.label}`, column: column.key } : null}
          onDrill={setDrillTarget}
          onOpenRow={(line) => line.accountId && setDrillTarget({ account: line.accountId, label: line.label, column: 'account' })}
        />
      </ReportPaper>
    </div>
    <ReportDrillDrawer target={drillTarget} load={loadStatementDrill} onClose={() => setDrillTarget(null)} />
  </div>
}

async function loadStatementDrill(target: StatementDrillTarget, page: number, signal: AbortSignal): Promise<ReportDrillResponse> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const activity = supportingActivity.slice((page - 1) * 3, page * 3)
  return {
    title: target.label,
    description: `Supporting entries for account ${target.account}`,
    summary: [{ label: 'Entries', value: String(supportingActivity.length) }, { label: 'Column', value: target.column }],
    columns: [{ label: 'Date' }, { label: 'Entry' }, { label: 'Owner' }, { label: 'Amount', align: 'right' }],
    rows: activity.map((item, index) => ({ key: `${page}-${index}`, cells: [item.date, item.type, item.owner, new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.amount)] })),
    page,
    perPage: 3,
    total: supportingActivity.length,
  }
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

function execute(query: ReportCustomQuery): ReportRunResult {
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

function summarize(query: ReportCustomQuery, input: typeof rows): ReportRunResult {
  const breakouts = query.breakouts ?? [], measures = query.measures?.length ? query.measures : [{ fn: 'count' as const }]
  const groups = new Map<string, typeof rows>()
  for (const row of input) { const values = breakouts.map((breakout) => bucket(row[breakout.column as keyof typeof row], breakout.bin)); const key = JSON.stringify(values); groups.set(key, [...(groups.get(key) ?? []), row]) }
  const columns: ReportColumn[] = [...breakouts.map((breakout, index) => ({ key: `d${index}`, label: catalog.entities[0]!.columns.find((column) => column.key === breakout.column)?.label ?? breakout.column, semanticType: breakout.bin ? 'date' as const : 'category' as const })), ...measures.map((measure, index) => ({ key: `m${index}`, label: measure.label ?? (measure.fn === 'count' ? 'Count' : `${measure.fn} of ${measure.column}`), semanticType: measure.column === 'value' ? 'currency' as const : 'number' as const, align: 'right' as const }))]
  const output = [...groups].map(([key, groupRows]) => { const dimensions = JSON.parse(key) as unknown[]; return Object.fromEntries([...dimensions.map((dimension, index) => [`d${index}`, dimension] as const), ...measures.map((measure, index) => [`m${index}`, aggregate(groupRows, measure.fn, measure.column)] as const)]) })
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
  if (rule.op === 'eq') return String(value) === String(expected)
  if (rule.op === 'neq') return String(value) !== String(expected)
  if (rule.op === 'contains') return String(value).toLowerCase().includes(String(expected).toLowerCase())
  if (rule.op === 'gte') return compare(value, expected) >= 0
  if (rule.op === 'lte') return compare(value, expected) <= 0
  if (rule.op === 'is_null') return value == null || value === ''
  if (rule.op === 'is_not_null') return value != null && value !== ''
  if (rule.op === 'is_true') return String(value) === 'true'
  if (rule.op === 'is_false') return String(value) === 'false'
  if (rule.op === 'in') return Array.isArray(expected) ? expected.map(String).includes(String(value)) : false
  if (rule.op === 'not_in') return !matches(row, { ...rule, op: 'in' })
  const today = '2026-07-21'
  if (rule.op === 'period_preset' && typeof expected === 'string') { const range = resolvePreset(expected, { startMonth: 1, today }); return Boolean(range && String(value) >= range.from && String(value) <= range.to) }
  const valueDate = new Date(String(value)), now = new Date(`${today}T12:00:00Z`)
  if (Number.isNaN(valueDate.valueOf())) return false
  if (rule.op === 'between_days_ago') return valueDate >= new Date(now.valueOf() - Number(expected ?? 30) * 86_400_000) && valueDate <= now
  if (rule.op === 'due_within_days') return valueDate <= new Date(now.valueOf() + Number(expected ?? 30) * 86_400_000)
  if (rule.op === 'before_now') return valueDate < now
  if (rule.op === 'since_today') return String(value).slice(0, 10) === today
  if (rule.op === 'this_month') return String(value).slice(0, 7) === today.slice(0, 7)
  if (rule.op === 'this_year') return String(value).slice(0, 4) === today.slice(0, 4)
  if (rule.op === 'this_week') { const day = now.getUTCDay() || 7; const from = new Date(now.valueOf() - (day - 1) * 86_400_000); const to = new Date(from.valueOf() + 7 * 86_400_000); return valueDate >= from && valueDate < to }
  return false
}
function compare(left: unknown, right: unknown): number { if (typeof left === 'number' || typeof right === 'number') return Number(left) - Number(right); return String(left).localeCompare(String(right)) }
function isRule(value: ReportRule | { rules: unknown[] }): value is ReportRule { return !('rules' in value) }
