import * as React from 'react'
import type { QueryResult, VisualizationKey, VisualizationSettings } from '@appkit/analytics'
import { cn } from './utils'

const SERIES_COLORS = ['var(--color-primary)', 'var(--color-info)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)']

export function DashboardMetricCard({ label, value, detail, icon, tone = 'primary', className }: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  icon?: React.ReactNode
  tone?: 'primary' | 'info' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const tones = {
    primary: { border: 'border-l-primary', icon: 'bg-primary-subtle text-primary' },
    info: { border: 'border-l-info', icon: 'bg-info-subtle text-info' },
    success: { border: 'border-l-success', icon: 'bg-success-subtle text-success' },
    warning: { border: 'border-l-warning', icon: 'bg-warning-subtle text-warning' },
    danger: { border: 'border-l-danger', icon: 'bg-danger-subtle text-danger' },
  }
  return <div className={cn('h-full overflow-hidden rounded-xl border border-border border-l-4 bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md', tones[tone].border, className)}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-xs font-semibold uppercase tracking-wider text-fg-subtle">{label}</div><div className="mt-3 truncate text-2xl font-semibold tabular-nums text-fg">{value}</div>{detail ? <div className="mt-1 truncate text-xs text-fg-muted">{detail}</div> : null}</div>{icon ? <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tones[tone].icon)}>{icon}</span> : null}</div>
  </div>
}

export function DashboardPanel({ title, icon, actions, children, className }: { title: React.ReactNode; icon?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={cn('flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm', className)}>
    <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4"><h3 className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-fg">{icon ? <span className="text-primary">{icon}</span> : null}{title}</h3>{actions}</header>
    <div className="min-h-0 flex-1 p-4">{children}</div>
  </section>
}

export function InsightCard({ title, description, result, visualization, settings, className }: {
  title: string
  description?: string | null
  result: QueryResult
  visualization: VisualizationKey
  settings?: VisualizationSettings
  className?: string
}) {
  return <DashboardPanel title={title} className={className}><div className="flex h-full min-h-0 flex-col">{description ? <p className="mb-3 shrink-0 text-xs text-fg-muted">{description}</p> : null}<div className="min-h-0 flex-1"><InsightResultView result={result} visualization={visualization} settings={settings} /></div></div></DashboardPanel>
}

export function InsightResultView({ result, visualization, settings = {} }: { result: QueryResult; visualization: VisualizationKey; settings?: VisualizationSettings }) {
  if (!result.rows.length) return <div className="grid h-full min-h-32 place-items-center text-sm text-fg-subtle">No data for this query.</div>
  const dimension = result.columns.find((column) => column.role === 'dimension')
  const measures = result.columns.filter((column) => column.role === 'measure')
  const selected = typeof settings.valueField === 'string' ? result.columns.find((column) => column.key === settings.valueField) : measures[0]
  if (visualization === 'table') return <ResultTable result={result} />
  if (visualization === 'scalar') return <Scalar result={result} column={selected} settings={settings} />
  if (visualization === 'progress' || visualization === 'gauge') return <Gauge result={result} column={selected} settings={settings} compact={visualization === 'progress'} />
  if (visualization === 'pie' || visualization === 'donut') return <Pie result={result} dimension={dimension} measure={selected} donut={visualization === 'donut'} />
  return <Cartesian result={result} dimension={dimension} measures={measures} kind={visualization} settings={settings} />
}

function ResultTable({ result }: { result: QueryResult }) {
  return <div className="app-scroll h-full overflow-auto rounded-lg border border-border"><table className="w-full border-collapse text-sm"><thead className="sticky top-0 bg-bg-subtle"><tr>{result.columns.map((column) => <th key={column.key} className={cn('border-b border-border px-3 py-2 text-left text-xs font-semibold text-fg-muted', column.role === 'measure' && 'text-right')}>{column.label}</th>)}</tr></thead><tbody className="divide-y divide-border">{result.rows.map((row, index) => <tr key={index} className="hover:bg-surface-hover">{result.columns.map((column) => <td key={column.key} className={cn('px-3 py-2 text-fg', column.role === 'measure' && 'text-right tabular-nums')}>{formatValue(row[column.key], column.semanticType)}</td>)}</tr>)}</tbody></table></div>
}

function Scalar({ result, column, settings }: { result: QueryResult; column?: QueryResult['columns'][number]; settings: VisualizationSettings }) {
  const value = column ? result.rows[0]?.[column.key] : null
  return <div className="flex h-full min-h-28 flex-col items-center justify-center text-center"><div className="text-4xl font-semibold tabular-nums text-fg">{String(settings.prefix ?? '')}{formatValue(value, column?.semanticType)}{String(settings.suffix ?? '')}</div>{column ? <div className="mt-2 text-sm text-fg-muted">{column.label}</div> : null}</div>
}

function Gauge({ result, column, settings, compact }: { result: QueryResult; column?: QueryResult['columns'][number]; settings: VisualizationSettings; compact: boolean }) {
  const value = Number(column ? result.rows[0]?.[column.key] : 0) || 0
  const goal = Number(settings.goal ?? 100) || 100
  const percentage = Math.max(0, Math.min(100, value / goal * 100))
  if (compact) return <div className="flex h-full min-h-24 flex-col justify-center"><div className="mb-2 flex items-baseline justify-between"><span className="text-2xl font-semibold tabular-nums text-fg">{formatNumber(value)}</span><span className="text-xs text-fg-muted">of {formatNumber(goal)}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-bg-subtle"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percentage}%` }} /></div></div>
  return <div className="grid h-full min-h-36 place-items-center"><div className="relative grid size-36 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-primary) ${percentage}%, var(--color-bg-subtle) 0)` }}><div className="grid size-28 place-items-center rounded-full bg-surface text-center"><div><div className="text-2xl font-semibold tabular-nums">{formatNumber(value)}</div><div className="text-xs text-fg-muted">{Math.round(percentage)}%</div></div></div></div></div>
}

function Cartesian({ result, dimension, measures, kind, settings }: { result: QueryResult; dimension?: QueryResult['columns'][number]; measures: QueryResult['columns']; kind: VisualizationKey; settings: VisualizationSettings }) {
  if (!dimension || !measures.length) return <div className="grid h-full place-items-center text-sm text-fg-subtle">Add a dimension and measure to chart.</div>
  const rows = result.rows.slice(0, 20); const values = rows.flatMap((row) => measures.map((measure) => Number(row[measure.key]) || 0)); const maximum = Math.max(...values.map(Math.abs), 1)
  if (kind === 'row') return <div className="app-scroll h-full space-y-2 overflow-auto pr-2">{rows.map((row, index) => <div key={index} className="grid grid-cols-[minmax(80px,1fr)_3fr] items-center gap-3"><div className="truncate text-xs text-fg-muted">{formatValue(row[dimension.key], dimension.semanticType)}</div><div className="flex h-6 items-center gap-1">{measures.map((measure, series) => <div key={measure.key} className="h-4 rounded-sm" title={`${measure.label}: ${formatValue(row[measure.key], measure.semanticType)}`} style={{ width: `${Math.abs(Number(row[measure.key]) || 0) / maximum * 100}%`, background: SERIES_COLORS[series % SERIES_COLORS.length] }} />)}</div></div>)}</div>
  const width = 720, height = 260, padding = 28; const plotWidth = width - padding * 2, plotHeight = height - padding * 2
  const points = (measure: QueryResult['columns'][number]) => rows.map((row, index) => ({ x: padding + (rows.length === 1 ? plotWidth / 2 : index / (rows.length - 1) * plotWidth), y: padding + plotHeight - (Number(row[measure.key]) || 0) / maximum * plotHeight }))
  return <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-40 w-full" role="img" aria-label={`${kind} chart`}><line x1={padding} y1={padding + plotHeight} x2={padding + plotWidth} y2={padding + plotHeight} stroke="var(--color-border)" />
    {kind === 'bar' ? rows.map((row, index) => measures.map((measure, series) => { const group = plotWidth / Math.max(rows.length, 1), barWidth = Math.max(3, group / measures.length * .72); const value = Math.abs(Number(row[measure.key]) || 0); return <rect key={`${index}-${measure.key}`} x={padding + index * group + series * barWidth + group * .12} y={padding + plotHeight - value / maximum * plotHeight} width={barWidth} height={value / maximum * plotHeight} rx={3} fill={SERIES_COLORS[series % SERIES_COLORS.length]} /> })) : measures.map((measure, series) => { const seriesPoints = points(measure); const path = seriesPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '); return <g key={measure.key}>{kind === 'area' ? <path d={`${path} L ${seriesPoints.at(-1)?.x} ${padding + plotHeight} L ${seriesPoints[0]?.x} ${padding + plotHeight} Z`} fill={SERIES_COLORS[series % SERIES_COLORS.length]} opacity="0.16" /> : null}<path d={path} fill="none" stroke={SERIES_COLORS[series % SERIES_COLORS.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{seriesPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3" fill={SERIES_COLORS[series % SERIES_COLORS.length]} />)}</g> })}
    {rows.map((row, index) => <text key={index} x={padding + (index + .5) / rows.length * plotWidth} y={height - 7} textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{String(row[dimension.key] ?? '').slice(0, 12)}</text>)}
  </svg>
}

function Pie({ result, dimension, measure, donut }: { result: QueryResult; dimension?: QueryResult['columns'][number]; measure?: QueryResult['columns'][number]; donut: boolean }) {
  if (!dimension || !measure) return <div className="grid h-full place-items-center text-sm text-fg-subtle">Add one dimension and one measure.</div>
  const rows = result.rows.slice(0, 12); const values = rows.map((row) => Math.max(0, Number(row[measure.key]) || 0)); const total = values.reduce((sum, value) => sum + value, 0) || 1
  let offset = 0
  return <div className="flex h-full min-h-40 items-center justify-center gap-5"><svg viewBox="0 0 120 120" className="size-40 shrink-0 -rotate-90" role="img" aria-label={`${donut ? 'Donut' : 'Pie'} chart`}>{values.map((value, index) => { const fraction = value / total; const dash = `${fraction * 100} ${100 - fraction * 100}`; const current = offset; offset += fraction * 100; return <circle key={index} cx="60" cy="60" r="45" fill="none" stroke={SERIES_COLORS[index % SERIES_COLORS.length]} strokeWidth={donut ? 20 : 45} pathLength="100" strokeDasharray={dash} strokeDashoffset={-current} /> })}</svg><div className="min-w-0 space-y-1.5">{rows.slice(0, 6).map((row, index) => <div key={index} className="flex items-center gap-2 text-xs"><span className="size-2.5 rounded-sm" style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} /><span className="max-w-32 truncate text-fg-muted">{formatValue(row[dimension.key], dimension.semanticType)}</span><span className="ml-auto tabular-nums text-fg">{formatValue(row[measure.key], measure.semanticType)}</span></div>)}</div></div>
}

function formatNumber(value: number): string { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value) }
function formatValue(value: unknown, semanticType?: string): string {
  if (value == null) return '—'
  if (semanticType === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value))
  if (semanticType === 'number') return formatNumber(Number(value))
  if (semanticType === 'date') { const date = new Date(String(value)); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  if (semanticType === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}
