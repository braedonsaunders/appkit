import type { InsightQuery, SemanticType } from '@appkit/analytics'

export type ReportQuery = InsightQuery

export type ReportColumn = {
  key: string
  label: string
  semanticType: SemanticType
  align?: 'left' | 'center' | 'right'
}

export type ReportGroup = {
  kind: 'results' | 'section' | 'summary'
  title: string
  subtitle?: string
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
  isEmpty?: boolean
}

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
  orientation: 'landscape',
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
  schemaVersion: 1
  id: string
  reportId: string
  name: string
  enabled: boolean
  cadence: 'daily' | 'weekly' | 'monthly'
  timezone: string
  hour: number
  minute: number
  dayOfWeek?: number
  dayOfMonth?: number
  weekOfMonth?: 1 | 2 | 3 | 4 | 5
  repeatEvery?: number
  startsOn?: string
  endsOn?: string
  format: Exclude<ReportFormat, 'screen'>
  recipients: string[]
}

export function resolveReportLayout(value?: Partial<ReportLayout> | null): ReportLayout {
  const margin = Number(value?.marginMm)
  return {
    paperSize: REPORT_PAPER_SIZES.includes(value?.paperSize as ReportPaperSize)
      ? (value!.paperSize as ReportPaperSize)
      : DEFAULT_REPORT_LAYOUT.paperSize,
    orientation: value?.orientation === 'portrait' ? 'portrait' : 'landscape',
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
