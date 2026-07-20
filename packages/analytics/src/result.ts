import type { DateBin } from './types'
import type { RichSemanticType } from './semantic'

export type ResultDataType = 'string' | 'number' | 'date' | 'timestamp' | 'boolean'

export type AnalyticResultColumn = {
  key: string
  label: string
  role: 'dimension' | 'measure'
  semanticType: RichSemanticType
  dataType: ResultDataType
  bin?: DateBin
}

export type FlatAnalyticResult = {
  shape: 'flat'
  columns: AnalyticResultColumn[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  durationMs?: number
}

export type PivotAxisKey = { values: unknown[]; labels: string[] }
export type PivotCell = Record<string, unknown>

export type PivotAnalyticResult = {
  shape: 'pivot'
  rowDimensions: AnalyticResultColumn[]
  columnDimensions: AnalyticResultColumn[]
  valueMeasures: AnalyticResultColumn[]
  rowKeys: PivotAxisKey[]
  columnKeys: PivotAxisKey[]
  cells: (PivotCell | null)[][]
  rowCount: number
  truncated: boolean
  durationMs?: number
}

export type AnalyticResult = FlatAnalyticResult | PivotAnalyticResult
export type ResultShape = 'scalar' | 'rows' | 'pivot'

export function resultShapeOf(result: AnalyticResult): ResultShape {
  if (result.shape === 'pivot') return 'pivot'
  const dimensions = result.columns.filter((column) => column.role === 'dimension')
  const measures = result.columns.filter((column) => column.role === 'measure')
  return dimensions.length === 0 && measures.length > 0 && result.rows.length <= 1 ? 'scalar' : 'rows'
}

export function pivotResult(
  result: FlatAnalyticResult,
  options: { rows: string[]; columns: string[]; values: string[] },
): PivotAnalyticResult {
  const byKey = new Map(result.columns.map((column) => [column.key, column]))
  const rowDimensions = options.rows.map((key) => byKey.get(key)).filter(isColumn)
  const columnDimensions = options.columns.map((key) => byKey.get(key)).filter(isColumn)
  const valueMeasures = options.values.map((key) => byKey.get(key)).filter(isColumn)
  if (!rowDimensions.length || !columnDimensions.length || !valueMeasures.length) {
    throw new Error('A pivot requires at least one row, column, and value field')
  }
  const rowKeys: PivotAxisKey[] = []
  const columnKeys: PivotAxisKey[] = []
  const rowIndex = new Map<string, number>()
  const columnIndex = new Map<string, number>()
  const keyOf = (values: unknown[]) => JSON.stringify(values)
  for (const row of result.rows) {
    const rowValues = rowDimensions.map((column) => row[column.key])
    const columnValues = columnDimensions.map((column) => row[column.key])
    const rowKey = keyOf(rowValues)
    const columnKey = keyOf(columnValues)
    if (!rowIndex.has(rowKey)) {
      rowIndex.set(rowKey, rowKeys.length)
      rowKeys.push({ values: rowValues, labels: rowValues.map(displayValue) })
    }
    if (!columnIndex.has(columnKey)) {
      columnIndex.set(columnKey, columnKeys.length)
      columnKeys.push({ values: columnValues, labels: columnValues.map(displayValue) })
    }
  }
  const cells: (PivotCell | null)[][] = rowKeys.map(() => columnKeys.map(() => null))
  for (const row of result.rows) {
    const ri = rowIndex.get(keyOf(rowDimensions.map((column) => row[column.key])))!
    const ci = columnIndex.get(keyOf(columnDimensions.map((column) => row[column.key])))!
    cells[ri]![ci] = Object.fromEntries(valueMeasures.map((column) => [column.key, row[column.key]]))
  }
  return { shape: 'pivot', rowDimensions, columnDimensions, valueMeasures, rowKeys, columnKeys, cells, rowCount: result.rowCount, truncated: result.truncated, durationMs: result.durationMs }
}

function displayValue(value: unknown): string {
  return value == null || value === '' ? '(none)' : String(value)
}

function isColumn(value: AnalyticResultColumn | undefined): value is AnalyticResultColumn {
  return value !== undefined
}
