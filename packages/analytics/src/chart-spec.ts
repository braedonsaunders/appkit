import type { FlatAnalyticResult } from './result'
import type { VisualizationKey, VisualizationSettings } from './types'

export type ChartSeries = {
  name: string
  data: (number | null)[]
  type?: 'bar' | 'line'
  yAxisIndex?: 0 | 1
  area?: boolean
  pointColors?: (string | null)[]
}

export type ChartSpec = {
  kind: 'cartesian' | 'pie' | 'scatter' | 'funnel' | 'gauge'
  cartesianType?: 'bar' | 'line' | 'area'
  orientation?: 'vertical' | 'horizontal'
  stacked?: boolean
  labels: string[]
  series: ChartSeries[]
  secondaryAxis?: boolean
  showValues?: boolean
  gauge?: { value: number; min: number; max: number }
}

export function buildChartSpec(
  result: FlatAnalyticResult,
  visualization: VisualizationKey,
  settings: VisualizationSettings = {},
): ChartSpec | null {
  const dimensions = result.columns.filter((column) => column.role === 'dimension')
  const measures = result.columns.filter((column) => column.role === 'measure')
  if (!measures.length) return null
  const dimension = dimensions[0]
  const rawLabels = dimension ? result.rows.map((row) => row[dimension.key]) : []
  const labels = dimension ? rawLabels.map(displayLabel) : measures.map((measure) => measure.label)
  if (visualization === 'pie' || visualization === 'donut' || visualization === 'funnel') {
    const measure = measures[0]!
    return { kind: visualization === 'funnel' ? 'funnel' : 'pie', labels, series: [{ name: measure.label, data: result.rows.map((row) => number(row[measure.key])) }] }
  }
  if (visualization === 'gauge' || visualization === 'progress') {
    const measure = measures[0]!
    const value = number(result.rows[0]?.[measure.key]) ?? 0
    const maximum = finiteNumber(settings.goal) ?? Math.max(value, 100)
    return { kind: 'gauge', labels: [], series: [], gauge: { value, min: finiteNumber(settings.minimum) ?? 0, max: maximum } }
  }
  if (visualization === 'scatter') {
    if (measures.length < 2) return null
    return { kind: 'scatter', labels, series: measures.slice(0, 2).map((measure) => ({ name: measure.label, data: result.rows.map((row) => number(row[measure.key])) })) }
  }
  if (!['bar', 'row', 'line', 'area', 'combo'].includes(visualization)) return null
  const cartesianType = visualization === 'line' ? 'line' : visualization === 'area' ? 'area' : 'bar'
  const colorMap = isRecord(settings.colors) ? settings.colors : null
  const series = measures.map((measure, index): ChartSeries => ({
    name: measure.label,
    data: result.rows.map((row) => number(row[measure.key])),
    type: visualization === 'combo' && index > 0 ? 'line' : cartesianType === 'line' ? 'line' : 'bar',
    yAxisIndex: visualization === 'combo' && index > 0 ? 1 : 0,
    area: cartesianType === 'area',
    pointColors: index === 0 && colorMap ? rawLabels.map((label) => typeof colorMap[String(label)] === 'string' ? String(colorMap[String(label)]) : null) : undefined,
  }))
  return { kind: 'cartesian', cartesianType, orientation: visualization === 'row' ? 'horizontal' : 'vertical', stacked: settings.stacked === true, labels, series, secondaryAxis: visualization === 'combo' && measures.length > 1, showValues: settings.showValues === true }
}

function number(value: unknown): number | null { const parsed = Number(value); return value == null || !Number.isFinite(parsed) ? null : parsed }
function finiteNumber(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function displayLabel(value: unknown): string {
  if (value == null || value === '') return '(none)'
  const text = String(value)
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(text)) return text
  const spaced = text.replaceAll('_', ' ')
  return spaced[0]!.toUpperCase() + spaced.slice(1)
}
