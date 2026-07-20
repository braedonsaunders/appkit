import * as React from 'react'
import { resolveConditionalStyle, type AnalyticResult, type ConditionalRule, type QueryResult, type VisualizationKey, type VisualizationSettings } from '@appkit/analytics'
import { cn } from '@appkit/ui'

const SERIES_COLORS = ['var(--color-primary)', 'var(--color-info)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)']

export function DashboardMetricCard({ label, value, detail, icon, trend, tone = 'primary', className }: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  icon?: React.ReactNode
  trend?: React.ReactNode
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
  return <div className={cn('relative h-full overflow-hidden rounded-xl border border-border border-l-4 bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md', tones[tone].border, className)}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-xs font-semibold uppercase tracking-wider text-fg-subtle">{label}</div><div className="mt-3 truncate text-2xl font-semibold tabular-nums text-fg">{value}</div>{detail ? <div className="mt-1 truncate text-xs text-fg-muted">{detail}</div> : null}</div>{icon ? <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tones[tone].icon)}>{icon}</span> : null}</div>
    {trend ? <div className="absolute right-4 bottom-3 h-7 w-20 opacity-80">{trend}</div> : null}
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
  if (visualization === 'funnel') return <Funnel result={result} dimension={dimension} measure={selected} />
  if (visualization === 'pivot' || visualization === 'heatmap') return <ResultTable result={result} />
  return <Cartesian result={result} dimension={dimension} measures={measures} kind={visualization} />
}

export function AdvancedInsightResultView({ result, visualization, settings = {} }: { result: AnalyticResult; visualization: VisualizationKey; settings?: VisualizationSettings }) {
  if (result.shape === 'pivot') return <PivotResultView result={result} heatmap={visualization === 'heatmap'} settings={settings} />
  const compatible: QueryResult = {
    columns: result.columns.map((column) => ({ key: column.key, label: column.label, role: column.role, semanticType: toSimpleSemanticType(column.semanticType) })),
    rows: result.rows,
    rowCount: result.rowCount,
    truncated: result.truncated,
    durationMs: result.durationMs ?? 0,
  }
  return <InsightResultView result={compatible} visualization={visualization} settings={settings} />
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

function Cartesian({ result, dimension, measures, kind }: { result: QueryResult; dimension?: QueryResult['columns'][number]; measures: QueryResult['columns']; kind: VisualizationKey }) {
  if (!dimension || !measures.length) return <div className="grid h-full place-items-center text-sm text-fg-subtle">Add a dimension and measure to chart.</div>
  const rows = result.rows.slice(0, 20); const values = rows.flatMap((row) => measures.map((measure) => Number(row[measure.key]) || 0)); const maximum = Math.max(...values.map(Math.abs), 1)
  if (kind === 'row') return <div className="app-scroll h-full space-y-2 overflow-auto pr-2">{rows.map((row, index) => <div key={index} className="grid grid-cols-[minmax(80px,1fr)_3fr] items-center gap-3"><div className="truncate text-xs text-fg-muted">{formatValue(row[dimension.key], dimension.semanticType)}</div><div className="flex h-6 items-center gap-1">{measures.map((measure, series) => <div key={measure.key} className="h-4 rounded-sm" title={`${measure.label}: ${formatValue(row[measure.key], measure.semanticType)}`} style={{ width: `${Math.abs(Number(row[measure.key]) || 0) / maximum * 100}%`, background: SERIES_COLORS[series % SERIES_COLORS.length] }} />)}</div></div>)}</div>
  const width = 720, height = 260, padding = 28; const plotWidth = width - padding * 2, plotHeight = height - padding * 2
  if (kind === 'scatter') {
    const [xMeasure, yMeasure] = measures
    if (!xMeasure || !yMeasure) return <div className="grid h-full place-items-center text-sm text-fg-subtle">Add two measures to plot a scatter chart.</div>
    const xValues = rows.map((row) => Number(row[xMeasure.key]) || 0), yValues = rows.map((row) => Number(row[yMeasure.key]) || 0)
    const xMax = Math.max(...xValues.map(Math.abs), 1), yMax = Math.max(...yValues.map(Math.abs), 1)
    return <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-40 w-full" role="img" aria-label="Scatter chart"><line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--color-border)" /><line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--color-border)" />{rows.map((row, index) => <circle key={index} cx={padding + xValues[index]! / xMax * plotWidth} cy={padding + plotHeight - yValues[index]! / yMax * plotHeight} r="5" fill="var(--color-primary)" opacity="0.8"><title>{`${dimension ? row[dimension.key] : index + 1}: ${xValues[index]}, ${yValues[index]}`}</title></circle>)}</svg>
  }
  const points = (measure: QueryResult['columns'][number]) => rows.map((row, index) => ({ x: padding + (rows.length === 1 ? plotWidth / 2 : index / (rows.length - 1) * plotWidth), y: padding + plotHeight - (Number(row[measure.key]) || 0) / maximum * plotHeight }))
  return <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-40 w-full" role="img" aria-label={`${kind} chart`}><line x1={padding} y1={padding + plotHeight} x2={padding + plotWidth} y2={padding + plotHeight} stroke="var(--color-border)" />
    {kind === 'bar' || kind === 'combo' ? rows.map((row, index) => measures.map((measure, series) => { if (kind === 'combo' && series > 0) return null; const group = plotWidth / Math.max(rows.length, 1), barWidth = Math.max(3, group / Math.max(kind === 'combo' ? 1 : measures.length, 1) * .72); const value = Math.abs(Number(row[measure.key]) || 0); return <rect key={`${index}-${measure.key}`} x={padding + index * group + (kind === 'combo' ? 0 : series * barWidth) + group * .12} y={padding + plotHeight - value / maximum * plotHeight} width={barWidth} height={value / maximum * plotHeight} rx={3} fill={SERIES_COLORS[series % SERIES_COLORS.length]} /> })) : null}{kind !== 'bar' ? measures.map((measure, series) => { if (kind === 'combo' && series === 0) return null; const seriesPoints = points(measure); const path = seriesPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '); return <g key={measure.key}>{kind === 'area' ? <path d={`${path} L ${seriesPoints.at(-1)?.x} ${padding + plotHeight} L ${seriesPoints[0]?.x} ${padding + plotHeight} Z`} fill={SERIES_COLORS[series % SERIES_COLORS.length]} opacity="0.16" /> : null}<path d={path} fill="none" stroke={SERIES_COLORS[series % SERIES_COLORS.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{seriesPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3" fill={SERIES_COLORS[series % SERIES_COLORS.length]} />)}</g> }) : null}
    {rows.map((row, index) => <text key={index} x={padding + (index + .5) / rows.length * plotWidth} y={height - 7} textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{String(row[dimension.key] ?? '').slice(0, 12)}</text>)}
  </svg>
}

function Funnel({ result, dimension, measure }: { result: QueryResult; dimension?: QueryResult['columns'][number]; measure?: QueryResult['columns'][number] }) {
  if (!dimension || !measure) return <div className="grid h-full place-items-center text-sm text-fg-subtle">Add one dimension and one measure.</div>
  const rows = result.rows.slice(0, 10), maximum = Math.max(...rows.map((row) => Math.abs(Number(row[measure.key]) || 0)), 1)
  return <div className="flex h-full flex-col items-center justify-center gap-1.5">{rows.map((row, index) => { const value = Math.abs(Number(row[measure.key]) || 0); return <div key={index} className="flex h-8 items-center justify-center rounded-md bg-primary-subtle px-3 text-xs text-primary" style={{ width: `${Math.max(24, value / maximum * 100)}%` }} title={`${dimension.label}: ${String(row[dimension.key])}`}><span className="truncate">{formatValue(row[dimension.key], dimension.semanticType)} · {formatValue(row[measure.key], measure.semanticType)}</span></div> })}</div>
}

function PivotResultView({ result, heatmap, settings }: { result: Extract<AnalyticResult, { shape: 'pivot' }>; heatmap: boolean; settings: VisualizationSettings }) {
  const rules = Array.isArray(settings.conditionalFormats) ? settings.conditionalFormats as ConditionalRule[] : []
  const showRowTotals = settings.showRowTotals === true
  return <div className="app-scroll h-full overflow-auto rounded-lg border border-border"><table className="min-w-full border-collapse text-sm"><thead className="sticky top-0 z-10 bg-bg-subtle"><tr><th className="border-b border-r border-border px-3 py-2 text-left text-xs font-semibold text-fg-muted">{result.rowDimensions.map((column) => column.label).join(' · ')}</th>{result.columnKeys.map((key, index) => <th key={index} className="border-b border-border px-3 py-2 text-right text-xs font-semibold text-fg-muted">{key.labels.join(' · ')}</th>)}{showRowTotals ? <th className="border-b border-l border-border px-3 py-2 text-right text-xs font-semibold text-fg-muted">Total</th> : null}</tr></thead><tbody>{result.rowKeys.map((rowKey, rowIndex) => { const values = result.columnKeys.map((_, columnIndex) => Number(result.cells[rowIndex]?.[columnIndex]?.[result.valueMeasures[0]?.key ?? '']) || 0); return <tr key={rowIndex} className="border-b border-border-subtle last:border-0"><th className="border-r border-border px-3 py-2 text-left font-medium text-fg">{rowKey.labels.join(' · ')}</th>{values.map((value, columnIndex) => { const style = heatmap ? resolveConditionalStyle(value, result.valueMeasures[0]?.key ?? '', rules.length ? rules : [{ type: 'scale', column: result.valueMeasures[0]?.key ?? '', min: Math.min(...values), max: Math.max(...values), lowTone: 'info', highTone: 'primary' }]) : {}; return <td key={columnIndex} className={cn('px-3 py-2 text-right tabular-nums text-fg', style.className)} style={style.background ? { background: style.background } : undefined}>{formatNumber(value)}</td> })}{showRowTotals ? <td className="border-l border-border px-3 py-2 text-right font-semibold tabular-nums text-fg">{formatNumber(values.reduce((sum, value) => sum + value, 0))}</td> : null}</tr> })}</tbody></table></div>
}

function toSimpleSemanticType(type: string): QueryResult['columns'][number]['semanticType'] {
  if (type === 'currency') return 'currency'
  if (type === 'measure' || type === 'percentage' || type === 'lat' || type === 'lng') return 'number'
  if (type === 'temporal') return 'date'
  if (type === 'category') return 'category'
  return 'text'
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
