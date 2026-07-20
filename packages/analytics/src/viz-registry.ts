import { resultShapeOf, type AnalyticResult, type AnalyticResultColumn, type ResultShape } from './result'
import type { RichSemanticType } from './semantic'
import type { VisualizationKey, VisualizationSettings } from './types'

export type VisualizationGroup = 'numbers' | 'tables' | 'comparison' | 'trend' | 'proportion' | 'distribution'
export type VisualizationSetting = {
  key: string
  label: string
  widget: 'field' | 'number' | 'text' | 'toggle' | 'conditional-format'
  section?: 'Data' | 'Format' | 'Display'
}

export type AdvancedVisualizationDefinition = {
  key: VisualizationKey
  label: string
  iconKey: string
  group: VisualizationGroup
  consumes: 'scalar' | 'rows' | 'series' | 'pivot'
  minSize: { w: number; h: number }
  defaultSize: { w: number; h: number }
  sensibleRank: number
  settings: VisualizationSetting[]
  isSensible: (shape: ResultShape, semanticTypes: RichSemanticType[], columns: AnalyticResultColumn[]) => boolean
  checkRenderable: (result: AnalyticResult, settings: VisualizationSettings) => void
}

const dimensions = (columns: AnalyticResultColumn[]) => columns.filter((column) => column.role === 'dimension')
const measures = (columns: AnalyticResultColumn[]) => columns.filter((column) => column.role === 'measure')
const flatColumns = (result: AnalyticResult) => result.shape === 'flat' ? result.columns : [...result.rowDimensions, ...result.columnDimensions, ...result.valueMeasures]
const requireFlat = (result: AnalyticResult): void => { if (result.shape !== 'flat') throw new Error('This visualization needs a non-pivot result') }
const requireMeasures = (result: AnalyticResult, count = 1) => {
  if (result.shape !== 'flat') throw new Error('This visualization needs a non-pivot result')
  if (measures(result.columns).length < count) throw new Error(`Add ${count === 1 ? 'a measure' : `${count} measures`} to render this visualization`)
}
const numbers: VisualizationSetting[] = [{ key: 'valueField', label: 'Value', widget: 'field', section: 'Data' }, { key: 'decimals', label: 'Decimals', widget: 'number', section: 'Format' }, { key: 'prefix', label: 'Prefix', widget: 'text', section: 'Format' }, { key: 'suffix', label: 'Suffix', widget: 'text', section: 'Format' }]
const chart: VisualizationSetting[] = [{ key: 'showValues', label: 'Show values', widget: 'toggle', section: 'Display' }, { key: 'stacked', label: 'Stacked', widget: 'toggle', section: 'Display' }]
const def = (value: AdvancedVisualizationDefinition) => value
const requireOneMeasure = (result: AnalyticResult): void => requireMeasures(result)

export const VISUALIZATION_REGISTRY: Record<VisualizationKey, AdvancedVisualizationDefinition> = {
  scalar: def({ key: 'scalar', label: 'Number', iconKey: 'Hash', group: 'numbers', consumes: 'scalar', minSize: { w: 2, h: 2 }, defaultSize: { w: 3, h: 2 }, sensibleRank: 10, settings: numbers, isSensible: (shape) => shape === 'scalar', checkRenderable: requireOneMeasure }),
  progress: def({ key: 'progress', label: 'Progress', iconKey: 'Gauge', group: 'numbers', consumes: 'scalar', minSize: { w: 3, h: 2 }, defaultSize: { w: 4, h: 2 }, sensibleRank: 7, settings: [...numbers, { key: 'goal', label: 'Goal', widget: 'number', section: 'Data' }], isSensible: (shape, types) => shape === 'scalar' && types.includes('percentage'), checkRenderable: requireOneMeasure }),
  table: def({ key: 'table', label: 'Table', iconKey: 'Table', group: 'tables', consumes: 'rows', minSize: { w: 3, h: 3 }, defaultSize: { w: 8, h: 6 }, sensibleRank: 0, settings: [{ key: 'conditionalFormats', label: 'Conditional formatting', widget: 'conditional-format' }], isSensible: () => true, checkRenderable: requireFlat }),
  pivot: def({ key: 'pivot', label: 'Pivot table', iconKey: 'Grid3x3', group: 'tables', consumes: 'pivot', minSize: { w: 4, h: 4 }, defaultSize: { w: 8, h: 6 }, sensibleRank: 10, settings: [{ key: 'showRowTotals', label: 'Row totals', widget: 'toggle' }, { key: 'showColumnTotals', label: 'Column totals', widget: 'toggle' }, { key: 'conditionalFormats', label: 'Conditional formatting', widget: 'conditional-format' }], isSensible: (shape) => shape === 'pivot', checkRenderable: (result) => { if (result.shape !== 'pivot') throw new Error('Summarize as a pivot first') } }),
  heatmap: def({ key: 'heatmap', label: 'Heatmap', iconKey: 'Grid2x2', group: 'tables', consumes: 'pivot', minSize: { w: 4, h: 4 }, defaultSize: { w: 8, h: 6 }, sensibleRank: 8, settings: [{ key: 'conditionalFormats', label: 'Color scale', widget: 'conditional-format' }], isSensible: (shape) => shape === 'pivot', checkRenderable: (result) => { if (result.shape !== 'pivot') throw new Error('Summarize as a pivot first') } }),
  bar: def({ key: 'bar', label: 'Bar', iconKey: 'BarChart3', group: 'comparison', consumes: 'series', minSize: { w: 3, h: 3 }, defaultSize: { w: 6, h: 4 }, sensibleRank: 6, settings: chart, isSensible: (shape, _types, columns) => shape === 'rows' && dimensions(columns).length > 0 && measures(columns).length > 0, checkRenderable: requireOneMeasure }),
  row: def({ key: 'row', label: 'Row chart', iconKey: 'AlignStartVertical', group: 'comparison', consumes: 'series', minSize: { w: 3, h: 3 }, defaultSize: { w: 6, h: 4 }, sensibleRank: 5, settings: chart, isSensible: (shape, _types, columns) => shape === 'rows' && dimensions(columns).length > 0 && measures(columns).length > 0, checkRenderable: requireOneMeasure }),
  line: def({ key: 'line', label: 'Line', iconKey: 'LineChart', group: 'trend', consumes: 'series', minSize: { w: 3, h: 3 }, defaultSize: { w: 6, h: 4 }, sensibleRank: 9, settings: chart, isSensible: (shape, types, columns) => shape === 'rows' && types.includes('temporal') && measures(columns).length > 0, checkRenderable: requireOneMeasure }),
  area: def({ key: 'area', label: 'Area', iconKey: 'AreaChart', group: 'trend', consumes: 'series', minSize: { w: 3, h: 3 }, defaultSize: { w: 6, h: 4 }, sensibleRank: 7, settings: chart, isSensible: (shape, types, columns) => shape === 'rows' && types.includes('temporal') && measures(columns).length > 0, checkRenderable: requireOneMeasure }),
  combo: def({ key: 'combo', label: 'Combo', iconKey: 'ChartNoAxesCombined', group: 'comparison', consumes: 'series', minSize: { w: 4, h: 3 }, defaultSize: { w: 6, h: 4 }, sensibleRank: 4, settings: chart, isSensible: (shape, _types, columns) => shape === 'rows' && dimensions(columns).length > 0 && measures(columns).length > 1, checkRenderable: (result) => requireMeasures(result, 2) }),
  pie: def({ key: 'pie', label: 'Pie', iconKey: 'PieChart', group: 'proportion', consumes: 'series', minSize: { w: 3, h: 3 }, defaultSize: { w: 5, h: 4 }, sensibleRank: 5, settings: [], isSensible: (shape, _types, columns) => shape === 'rows' && dimensions(columns).length === 1 && measures(columns).length === 1, checkRenderable: requireOneMeasure }),
  donut: def({ key: 'donut', label: 'Donut', iconKey: 'CircleDashed', group: 'proportion', consumes: 'series', minSize: { w: 3, h: 3 }, defaultSize: { w: 5, h: 4 }, sensibleRank: 5, settings: [], isSensible: (shape, _types, columns) => shape === 'rows' && dimensions(columns).length === 1 && measures(columns).length === 1, checkRenderable: requireOneMeasure }),
  funnel: def({ key: 'funnel', label: 'Funnel', iconKey: 'Filter', group: 'proportion', consumes: 'series', minSize: { w: 3, h: 3 }, defaultSize: { w: 6, h: 4 }, sensibleRank: 2, settings: [], isSensible: (shape, _types, columns) => shape === 'rows' && dimensions(columns).length === 1 && measures(columns).length === 1, checkRenderable: requireOneMeasure }),
  gauge: def({ key: 'gauge', label: 'Gauge', iconKey: 'Gauge', group: 'numbers', consumes: 'scalar', minSize: { w: 3, h: 3 }, defaultSize: { w: 4, h: 3 }, sensibleRank: 4, settings: [...numbers, { key: 'goal', label: 'Goal', widget: 'number', section: 'Data' }], isSensible: (shape, _types, columns) => shape === 'scalar' && measures(columns).length === 1, checkRenderable: requireOneMeasure }),
  scatter: def({ key: 'scatter', label: 'Scatter', iconKey: 'ScatterChart', group: 'distribution', consumes: 'series', minSize: { w: 4, h: 3 }, defaultSize: { w: 6, h: 4 }, sensibleRank: 4, settings: [], isSensible: (shape, _types, columns) => shape === 'rows' && measures(columns).length >= 2, checkRenderable: (result) => requireMeasures(result, 2) }),
}

export const VISUALIZATION_LIST = Object.values(VISUALIZATION_REGISTRY)

export function suggestAdvancedVisualization(result: AnalyticResult): VisualizationKey {
  const columns = flatColumns(result)
  const types = columns.map((column) => column.semanticType)
  const shape = resultShapeOf(result)
  return [...VISUALIZATION_LIST]
    .filter((definition) => definition.isSensible(shape, types, columns))
    .sort((left, right) => right.sensibleRank - left.sensibleRank)[0]?.key ?? 'table'
}

export function assertVisualizationRenderable(key: VisualizationKey, result: AnalyticResult, settings: VisualizationSettings = {}): void {
  VISUALIZATION_REGISTRY[key].checkRenderable(result, settings)
}
