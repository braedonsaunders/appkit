import { CalendarClock, Download, FileBarChart } from 'lucide-react'
import { computeNextReportRun, createReportDocument, queryResultToReport, type ReportSchedule } from '@appkit/reports'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, PageHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@appkit/ui'

export const metadata = { title: 'Reports — appkit' }

const schedule: ReportSchedule = { schemaVersion: 1, id: 'weekly', reportId: 'project-summary', name: 'Monday project summary', enabled: true, cadence: 'weekly', timezone: 'America/Toronto', hour: 8, minute: 30, dayOfWeek: 1, format: 'pdf', recipients: ['operations@example.com'] }

const result = queryResultToReport({ columns: [{ key: 'project', label: 'Project', semanticType: 'text', role: 'dimension' }, { key: 'status', label: 'Status', semanticType: 'category', role: 'dimension' }, { key: 'value', label: 'Contract value', semanticType: 'currency', role: 'measure' }], rows: [{ project: 'North Tower', status: 'Active', value: 1840000 }, { project: 'Civic Library', status: 'Bidding', value: 725000 }, { project: 'Harbour Plant', status: 'Active', value: 2430000 }], rowCount: 3, truncated: false, durationMs: 14 })
const document = createReportDocument('Project portfolio', result, { subtitle: 'Active and bidding work', generatedAt: new Date('2026-07-20T12:00:00Z') })

export default function ReportsPage() {
  const nextRun = computeNextReportRun(schedule, new Date('2026-07-20T12:00:00Z'))
  const group = document.groups[0]!
  return <div className="space-y-6 p-4 lg:p-6"><PageHeader title="Project portfolio" description="Saved queries, grouped results, export layouts, and delivery schedules." actions={<Button asChild><a href="/api/demo/pdf?kind=report"><Download className="size-4" />Download PDF</a></Button>} />
    <div className="grid gap-3 md:grid-cols-3"><Metric label="Rows" value={String(document.rowCount)} /><Metric label="Query time" value={`${result.durationMs} ms`} /><Metric label="Output" value="PDF · CSV · XLSX" /></div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><FileBarChart className="size-4 text-primary" />{group.title}</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow>{group.columns.map((column) => <TableHead key={column.key} className={column.align === 'right' ? 'text-right' : undefined}>{column.label}</TableHead>)}</TableRow></TableHeader><TableBody>{group.rows.map((row) => <TableRow key={String(row.project)}>{group.columns.map((column) => <TableCell key={column.key} className={column.align === 'right' ? 'text-right tabular-nums' : undefined}>{column.semanticType === 'currency' ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(Number(row[column.key])) : String(row[column.key] ?? '')}</TableCell>)}</TableRow>)}</TableBody></Table></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-4 text-primary" />Delivery schedule</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><Row label="Cadence" value="Every Monday at 8:30 AM" /><Row label="Timezone" value={schedule.timezone} /><Row label="Format" value={<Badge variant="secondary">PDF</Badge>} /><Row label="Recipients" value={schedule.recipients[0]!} /><Row label="Next run" value={nextRun?.toLocaleString('en-CA', { timeZone: schedule.timezone, dateStyle: 'medium', timeStyle: 'short' }) ?? 'Ended'} /></CardContent></Card></div>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs font-medium text-fg-muted">{label}</p><p className="mt-1 text-xl font-semibold text-fg tabular-nums">{value}</p></CardContent></Card> }
function Row({ label, value }: { label: string; value: React.ReactNode }) { return <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-3 last:border-0 last:pb-0"><span className="text-fg-muted">{label}</span><span className="text-right font-medium text-fg">{value}</span></div> }
