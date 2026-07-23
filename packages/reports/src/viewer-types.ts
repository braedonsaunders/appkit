import { resolveReportLayout, type ReportLayout, type ReportRunResult } from './types'

export type ReportPaperCell = string | number | boolean | null | undefined

export type ReportPaperGroup<TDrillTarget = unknown> = {
  title?: string
  subtitle?: string
  columns: string[]
  rows: ReportPaperCell[][]
  align?: ('left' | 'right' | 'center')[]
  /** Per-column currency formatting. */
  money?: boolean[]
  /** Per-cell application route. */
  links?: (string | null | undefined)[][]
  /** Per-cell drill target, resolved by the consuming application. */
  drills?: (TDrillTarget | null | undefined)[][]
  /** Explicit total row. Ordinary result sets never infer that the last row is a total. */
  totalRowIndex?: number
  isEmpty?: boolean
}

export type ReportPaperData<TDrillTarget = unknown> = {
  title: string
  periodPhrase?: string
  note?: string
  summary?: { key?: string; label: string; value: ReportPaperCell; drill?: TDrillTarget }[]
  groups: ReportPaperGroup<TDrillTarget>[]
  /** Source-row drill target used when a numeric cell has no more specific target. */
  defaultDrillTarget?: TDrillTarget
  layout?: Partial<ReportLayout>
}

export function reportPaperSummary<TDrillTarget>(
  data: ReportPaperData<TDrillTarget>,
): NonNullable<ReportPaperData<TDrillTarget>['summary']> {
  if (!resolveReportLayout(data.layout).showSummary) return []
  return data.summary ?? []
}

export type ReportDrillCell = string | number | boolean | null

export type ReportDrillRecord = {
  id: string
  kind?: string
  metadata?: Record<string, string | number | boolean | null>
}

export type ReportDrillResponse<TRecord extends ReportDrillRecord = ReportDrillRecord> = {
  title: string
  description?: string
  summary: { key?: string; label: string; value: string }[]
  columns: { key?: string; label: string; align?: 'left' | 'right' | 'center' }[]
  rows: {
    key: string
    cells: ReportDrillCell[]
    record?: TRecord
  }[]
  /** Cell that opens the application's native record surface when `record` is set. */
  linkColumn?: number
  page: number
  perPage: number
  total: number
}

export type ReportDrillLoader<TDrillTarget, TRecord extends ReportDrillRecord = ReportDrillRecord> = (
  target: TDrillTarget,
  page: number,
  signal: AbortSignal,
) => Promise<ReportDrillResponse<TRecord>>

export type ReportCellContext = {
  groupIndex: number
  rowIndex: number
  columnIndex: number
  row: Record<string, unknown>
  columnKey: string
}

export function reportRunResultToPaper<TDrillTarget = unknown>(
  title: string,
  result: ReportRunResult,
  options: {
    periodPhrase?: string
    note?: string
    layout?: Partial<ReportLayout>
    drillTarget?: (context: ReportCellContext) => TDrillTarget | null | undefined
  } = {},
): ReportPaperData<TDrillTarget> {
  return {
    title,
    periodPhrase: options.periodPhrase,
    note: options.note,
    layout: options.layout,
    summary: result.summary.map((item) => ({ key: item.key, label: item.label, value: item.value })),
    groups: result.groups.map((group, groupIndex) => ({
      title: group.title,
      subtitle: group.subtitle,
      columns: group.columns.map((column) => column.label),
      align: group.columns.map((column) => column.align ?? (column.semanticType === 'number' || column.semanticType === 'currency' ? 'right' : 'left')),
      money: group.columns.map((column) => column.semanticType === 'currency'),
      rows: group.rows.map((row) => group.columns.map((column) => row[column.key] as ReportPaperCell)),
      drills: options.drillTarget
        ? group.rows.map((row, rowIndex) => group.columns.map((column, columnIndex) => options.drillTarget?.({ groupIndex, rowIndex, columnIndex, row, columnKey: column.key })))
        : undefined,
      isEmpty: group.isEmpty,
    })),
  }
}
