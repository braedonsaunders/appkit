import type { InsightQuery, SemanticType } from '@braedonsaunders/appkit-analytics'

export type ReportQuery = InsightQuery

/**
 * Conditional cell tones. Deliberately a small named set rather than free
 * colours: a report is printed as well as viewed, the palette has to stay
 * legible in greyscale, and a stored definition must keep its meaning when the
 * theme changes.
 */
export const REPORT_CELL_TONES = ['critical', 'warning', 'positive', 'info', 'muted'] as const
export type ReportCellTone = (typeof REPORT_CELL_TONES)[number]

export type ReportColumn = {
  key: string
  label: string
  semanticType: SemanticType
  align?: 'left' | 'center' | 'right'
  /**
   * Value → tone, matched case-insensitively against the cell's rendered text.
   * Lets a status column read at a glance ("expired" red, "expiring" amber)
   * without inventing an expression language inside a stored report definition.
   *
   * Screen and PDF apply it identically because both render through
   * renderReportDocumentBodyHtml.
   */
  tones?: Record<string, ReportCellTone>
}

/** The tone for a cell value, or null when the column declares none. */
export function resolveCellTone(
  column: string | ReportColumn,
  value: unknown,
): ReportCellTone | null {
  if (typeof column === 'string' || !column.tones) return null
  if (value === null || value === undefined) return null
  const key = String(value).trim().toLowerCase()
  if (!key) return null
  for (const [match, tone] of Object.entries(column.tones)) {
    if (match.trim().toLowerCase() === key) return tone
  }
  return null
}

export type ReportGroup = {
  kind: 'results' | 'section' | 'summary'
  title: string
  subtitle?: string
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
  /**
   * Summarize mode: per-row scope of the aggregate — one entry per breakout
   * (eq value, date range for binned buckets, or null-bucket marker). Rows
   * whose bucket cannot be scoped exactly carry null (viewers omit the drill
   * rather than show unrelated records).
   */
  rowKeys?: (ReportRowScopeRule[] | null)[]
  /** Row indices styled as total/subtotal rows by viewers. */
  totalRows?: number[]
  isEmpty?: boolean
}

/** One exact-scope predicate for drilling into an aggregate bucket. */
export type ReportRowScopeRule =
  | { field: string; value: string }
  | { field: string; from: string; to: string }
  | { field: string; empty: true }

export type ReportSummaryItem = {
  key: string
  label: string
  value: string | number
  semanticType?: SemanticType
}

export type ReportRunResult = {
  groups: ReportGroup[]
  summary: ReportSummaryItem[]
  rowCount: number
  truncated: boolean
  durationMs: number
}

export const REPORT_PAPER_SIZES = ['letter', 'a4', 'legal'] as const
export type ReportPaperSize = (typeof REPORT_PAPER_SIZES)[number]
export const REPORT_DENSITIES = ['standard', 'compact'] as const
export type ReportDensity = (typeof REPORT_DENSITIES)[number]

export type ReportLayout = {
  paperSize: ReportPaperSize
  orientation: 'portrait' | 'landscape'
  marginMm: number
  showSummary: boolean
  density: ReportDensity
}

export const DEFAULT_REPORT_LAYOUT: ReportLayout = {
  paperSize: 'letter',
  orientation: 'portrait',
  marginMm: 15,
  showSummary: true,
  density: 'standard',
}

export type ReportDefinition = {
  schemaVersion: 1
  id: string
  slug: string
  name: string
  description?: string
  query: ReportQuery
  layout: ReportLayout
  state: 'draft' | 'published' | 'archived'
  tags?: string[]
}

export type ReportFormat = 'screen' | 'csv' | 'xlsx' | 'pdf'

export type ReportSchedule = {
  schemaVersion?: 1
  id: string
  definitionId: string
  name: string
  active: boolean
  cadence: 'daily' | 'weekly' | 'monthly'
  timezone: string
  hour: number
  minute: number
  dayOfWeek?: number | null
  dayOfMonth?: number | null
  weekOfMonth?: 1 | 2 | 3 | 4 | 5 | null
  repeatEvery: number
  startsOn?: string | null
  endsOn?: string | null
  recipientUserIds: string[]
  recipientEmails: string[]
  filters: Record<string, unknown>
  emailSubject?: string | null
  emailMessage?: string | null
  nextRunAt?: string | Date | null
  lastRunAt?: string | Date | null
}

export function resolveReportLayout(value?: Partial<ReportLayout> | null): ReportLayout {
  const margin = Number(value?.marginMm)
  return {
    paperSize: REPORT_PAPER_SIZES.includes(value?.paperSize as ReportPaperSize)
      ? (value!.paperSize as ReportPaperSize)
      : DEFAULT_REPORT_LAYOUT.paperSize,
    orientation:
      value?.orientation === 'portrait' || value?.orientation === 'landscape'
        ? value.orientation
        : DEFAULT_REPORT_LAYOUT.orientation,
    marginMm: Number.isFinite(margin) ? Math.min(30, Math.max(5, margin)) : 15,
    showSummary: value?.showSummary !== false,
    density: value?.density === 'compact' ? 'compact' : 'standard',
  }
}

export function assertReportDefinition(value: ReportDefinition): void {
  if (value.schemaVersion !== 1) throw new Error('Unsupported report schema version')
  if (!value.id.trim() || !value.name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) {
    throw new Error('A report requires an id, name, and kebab-case slug')
  }
  if (!value.query.source.trim()) throw new Error('A report requires a query source')
}
