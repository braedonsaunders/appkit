import type { QueryResult } from '@appkit/analytics'
import type { ReportGroup, ReportRunResult, ReportSummaryItem } from './types'

export type ReportDocument = {
  title: string
  subtitle?: string
  generatedAt: Date
  groups: ReportGroup[]
  summary: ReportSummaryItem[]
  rowCount: number
}

export function queryResultToReport(
  result: QueryResult,
  options: { title?: string; groupBy?: string; summary?: ReportSummaryItem[] } = {},
): ReportRunResult {
  const columns = result.columns.map((column) => ({
    key: column.key,
    label: column.label,
    semanticType: column.semanticType,
    align: column.semanticType === 'number' || column.semanticType === 'currency' ? 'right' as const : 'left' as const,
  }))
  const groupKey = options.groupBy
  const groups: ReportGroup[] = []
  if (groupKey) {
    const buckets = new Map<string, Record<string, unknown>[]>()
    for (const row of result.rows) {
      const label = displayCell(row[groupKey])
      const bucket = buckets.get(label) ?? []
      bucket.push(row)
      buckets.set(label, bucket)
    }
    for (const [title, rows] of buckets) {
      groups.push({ kind: 'section', title, subtitle: `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`, columns, rows })
    }
  } else {
    groups.push({ kind: 'results', title: options.title ?? 'Results', columns, rows: result.rows, isEmpty: result.rows.length === 0 })
  }
  return {
    groups,
    summary: options.summary ?? [],
    rowCount: result.rowCount,
    truncated: result.truncated,
    durationMs: result.durationMs,
  }
}

export function createReportDocument(
  title: string,
  result: ReportRunResult,
  options: { subtitle?: string; generatedAt?: Date } = {},
): ReportDocument {
  if (!title.trim()) throw new Error('A report document requires a title')
  return {
    title,
    subtitle: options.subtitle,
    generatedAt: options.generatedAt ?? new Date(),
    groups: result.groups,
    summary: result.summary,
    rowCount: result.rowCount,
  }
}

export function displayCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
