import type { QueryResult, SemanticType, VisualizationKey } from './types'

export type VisualizationDefinition = {
  key: VisualizationKey
  label: string
  iconKey: string
  group: 'numbers' | 'tables' | 'comparison' | 'trend' | 'proportion'
  minSize: { w: number; h: number }
  defaultSize: { w: number; h: number }
  sensibleRank: number
  isSensible: (result: QueryResult) => boolean
}
const dimensions = (result: QueryResult) => result.columns.filter((column) => column.role === 'dimension')
const measures = (result: QueryResult) => result.columns.filter((column) => column.role === 'measure')
const hasType = (result: QueryResult, type: SemanticType) => result.columns.some((column) => column.semanticType === type)

export const VISUALIZATIONS: Record<VisualizationKey, VisualizationDefinition> = {
  scalar: { key: 'scalar', label: 'Number', iconKey: 'hash', group: 'numbers', minSize: { w: 2, h: 2 }, defaultSize: { w: 3, h: 2 }, sensibleRank: 10, isSensible: (r) => !dimensions(r).length && !!measures(r).length },
  progress: { key: 'progress', label: 'Progress', iconKey: 'gauge', group: 'numbers', minSize: { w: 3, h: 2 }, defaultSize: { w: 4, h: 2 }, sensibleRank: 8, isSensible: (r) => hasType(r, 'number') && r.rows.length === 1 },
  table: { key: 'table', label: 'Table', iconKey: 'table', group: 'tables', minSize: { w: 3, h: 3 }, defaultSize: { w: 8, h: 5 }, sensibleRank: 0, isSensible: () => true },
  bar: { key: 'bar', label: 'Bar', iconKey: 'chart', group: 'comparison', minSize: { w: 3, h: 3 }, defaultSize: { w: 6, h: 4 }, sensibleRank: 6, isSensible: (r) => !!dimensions(r).length && !!measures(r).length },
  row: { key: 'row', label: 'Row', iconKey: 'chart', group: 'comparison', minSize: { w: 3, h: 3 }, defaultSize: { w: 6, h: 4 }, sensibleRank: 5, isSensible: (r) => !!dimensions(r).length && !!measures(r).length },
  line: { key: 'line', label: 'Line', iconKey: 'activity', group: 'trend', minSize: { w: 3, h: 3 }, defaultSize: { w: 6, h: 4 }, sensibleRank: 9, isSensible: (r) => hasType(r, 'date') && !!measures(r).length },
  area: { key: 'area', label: 'Area', iconKey: 'activity', group: 'trend', minSize: { w: 3, h: 3 }, defaultSize: { w: 6, h: 4 }, sensibleRank: 7, isSensible: (r) => hasType(r, 'date') && !!measures(r).length },
  pie: { key: 'pie', label: 'Pie', iconKey: 'chart', group: 'proportion', minSize: { w: 3, h: 3 }, defaultSize: { w: 5, h: 4 }, sensibleRank: 4, isSensible: (r) => dimensions(r).length === 1 && measures(r).length === 1 && r.rows.length <= 12 },
  donut: { key: 'donut', label: 'Donut', iconKey: 'chart', group: 'proportion', minSize: { w: 3, h: 3 }, defaultSize: { w: 5, h: 4 }, sensibleRank: 3, isSensible: (r) => dimensions(r).length === 1 && measures(r).length === 1 && r.rows.length <= 12 },
  gauge: { key: 'gauge', label: 'Gauge', iconKey: 'gauge', group: 'numbers', minSize: { w: 3, h: 2 }, defaultSize: { w: 4, h: 3 }, sensibleRank: 5, isSensible: (r) => r.rows.length === 1 && !!measures(r).length },
}

export function suggestVisualization(result: QueryResult): VisualizationKey {
  return Object.values(VISUALIZATIONS).filter((definition) => definition.isSensible(result)).sort((a, b) => b.sensibleRank - a.sensibleRank)[0]?.key ?? 'table'
}
