import { reportColumn, reportColumnExpression, reportEntityFrom, reportTenantColumn, type ReportEntity, type ReportEntityCatalog } from './entities'
import { compileReportRuleGroup, SqlParameters, type ReportRuleGroup } from './filters'
import type { ReportColumn, ReportGroup, ReportRunResult } from './types'

export const REPORT_AGG_FNS = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'] as const
export type ReportAggFn = (typeof REPORT_AGG_FNS)[number]
export const REPORT_TEMPORAL_BINS = ['day', 'week', 'month', 'quarter', 'year', 'fiscal_period', 'fiscal_quarter', 'fiscal_year'] as const
export type ReportTemporalBin = (typeof REPORT_TEMPORAL_BINS)[number]
export type ReportBreakout = { column: string; bin?: ReportTemporalBin; label?: string }
export type ReportMeasure = { fn: ReportAggFn; column?: string; label?: string }
export type ReportCustomQuery = {
  entity: string
  mode?: 'rows' | 'summarize'
  columns: string[]
  breakouts?: ReportBreakout[]
  measures?: ReportMeasure[]
  filters?: ReportRuleGroup | null
  groupBy?: string | null
  sort?: { column: string; direction: 'asc' | 'desc' } | null
  sorts?: { column: string; direction: 'asc' | 'desc' }[] | null
  columnLabels?: Record<string, string> | null
  limit?: number | null
}

export type CompiledCustomReport = {
  sql: string
  params: unknown[]
  mode: 'rows' | 'summarize'
  columns: ReportColumn[]
  groupBy: string | null
  limit: number
}

export function compileCustomReport(
  query: ReportCustomQuery,
  tenantId: string,
  catalog: ReportEntityCatalog,
  options: { maxRows?: number; fiscalStartMonth?: number } = {},
): CompiledCustomReport {
  const entity = catalog.entities.find((item) => item.key === query.entity)
  if (!entity) throw new Error(`Unknown report entity "${query.entity}"`)
  return query.mode === 'summarize'
    ? compileSummary(entity, query, tenantId, options)
    : compileRows(entity, query, tenantId, options)
}

function compileRows(entity: ReportEntity, query: ReportCustomQuery, tenantId: string, options: { maxRows?: number; fiscalStartMonth?: number }): CompiledCustomReport {
  const keys = unique(query.columns.filter((key) => reportColumnExpression(entity, key)))
  if (!keys.length) throw new Error('A row report requires at least one valid column')
  const groupBy = query.groupBy && reportColumnExpression(entity, query.groupBy) ? query.groupBy : null
  const selectKeys = groupBy && !keys.includes(groupBy) ? [...keys, groupBy] : keys
  const parameters = new SqlParameters()
  const where = [`${reportTenantColumn(entity)} = ${parameters.add(tenantId)}`]
  appendImplicitFilters(entity, where, parameters)
  if (query.filters) {
    const filters = compileReportRuleGroup(entity, query.filters, parameters, { fiscalStartMonth: options.fiscalStartMonth })
    if (filters) where.push(filters)
  }
  const sorts = (query.sorts?.length ? query.sorts : query.sort ? [query.sort] : entity.defaultSort ? [entity.defaultSort] : [])
    .flatMap((sort) => { const expression = reportColumnExpression(entity, sort.column); return expression ? [`${expression} ${sort.direction.toUpperCase()} NULLS LAST`] : [] }).slice(0, 3)
  const limit = resolveLimit(query.limit, options.maxRows)
  const sql = [`SELECT ${selectKeys.map((key) => `${reportColumnExpression(entity, key)} AS "${key}"`).join(', ')}`, `FROM ${reportEntityFrom(entity)}`, `WHERE ${where.join(' AND ')}`, sorts.length ? `ORDER BY ${sorts.join(', ')}` : '', `LIMIT ${limit + 1}`].filter(Boolean).join('\n')
  const columns = keys.map((key) => toOutputColumn(entity, key, query.columnLabels?.[key]))
  return { sql, params: parameters.values, mode: 'rows', columns, groupBy, limit }
}

function compileSummary(entity: ReportEntity, query: ReportCustomQuery, tenantId: string, options: { maxRows?: number; fiscalStartMonth?: number }): CompiledCustomReport {
  const breakouts = (query.breakouts ?? []).filter((item) => reportColumnExpression(entity, item.column))
  let measures = (query.measures ?? []).filter((item) => REPORT_AGG_FNS.includes(item.fn) && (item.fn === 'count' || Boolean(item.column && reportColumnExpression(entity, item.column))))
  if (!measures.length) measures = [{ fn: 'count' }]
  const startMonth = Math.max(1, Math.min(12, Math.trunc(options.fiscalStartMonth ?? 1)))
  const parameters = new SqlParameters()
  const where = [`${reportTenantColumn(entity)} = ${parameters.add(tenantId)}`]
  appendImplicitFilters(entity, where, parameters)
  if (query.filters) {
    const filters = compileReportRuleGroup(entity, query.filters, parameters, { fiscalStartMonth: options.fiscalStartMonth })
    if (filters) where.push(filters)
  }
  const dimensionSql = breakouts.map((item, index) => `${breakoutExpression(entity, item, startMonth)} AS "d${index}"`)
  const measureSql = measures.map((item, index) => `${measureExpression(entity, item)} AS "m${index}"`)
  const select = [...dimensionSql, ...measureSql]
  const limit = resolveLimit(query.limit, options.maxRows)
  const group = breakouts.length ? `GROUP BY ${breakouts.map((_, index) => index + 1).join(', ')}` : ''
  const order = breakouts.length ? `ORDER BY ${breakouts.map((_, index) => index + 1).join(', ')}` : ''
  const sql = [`SELECT ${select.join(', ')}`, `FROM ${reportEntityFrom(entity)}`, `WHERE ${where.join(' AND ')}`, group, order, `LIMIT ${limit + 1}`].filter(Boolean).join('\n')
  const columns: ReportColumn[] = [
    ...breakouts.map((item, index) => ({ key: `d${index}`, label: item.label ?? reportColumn(entity, item.column)?.label ?? item.column, semanticType: semanticType(entity, item.column), align: 'left' as const })),
    ...measures.map((item, index) => ({ key: `m${index}`, label: item.label ?? measureLabel(entity, item), semanticType: item.column ? semanticType(entity, item.column) : 'number', align: 'right' as const })),
  ]
  return { sql, params: parameters.values, mode: 'summarize', columns, groupBy: null, limit }
}

export function customReportResult(compiled: CompiledCustomReport, rows: Record<string, unknown>[], durationMs = 0): ReportRunResult {
  const truncated = rows.length > compiled.limit
  const visible = rows.slice(0, compiled.limit)
  const groups: ReportGroup[] = []
  if (compiled.groupBy) {
    const grouped = new Map<string, Record<string, unknown>[]>()
    for (const row of visible) { const label = String(row[compiled.groupBy] ?? '(none)'); grouped.set(label, [...(grouped.get(label) ?? []), row]) }
    for (const [title, groupRows] of grouped) groups.push({ kind: 'section', title, columns: compiled.columns, rows: groupRows })
  } else {
    groups.push({ kind: compiled.mode === 'summarize' ? 'summary' : 'results', title: compiled.mode === 'summarize' ? 'Summary' : 'Results', columns: compiled.columns, rows: visible, isEmpty: visible.length === 0 })
  }
  return { groups, summary: [], rowCount: visible.length, truncated, durationMs }
}

function breakoutExpression(entity: ReportEntity, breakout: ReportBreakout, startMonth: number): string {
  const expression = reportColumnExpression(entity, breakout.column)!
  if (!breakout.bin) return expression
  if (!REPORT_TEMPORAL_BINS.includes(breakout.bin)) throw new Error(`Unknown temporal bin "${breakout.bin}"`)
  if (breakout.bin === 'fiscal_period') return `date_trunc('month', ${expression})::date`
  if (breakout.bin === 'fiscal_year') return `(extract(year from (${expression} + make_interval(months => ${13 - startMonth})))::int)`
  if (breakout.bin === 'fiscal_quarter') return `(extract(year from (${expression} + make_interval(months => ${13 - startMonth})))::int * 10 + extract(quarter from (${expression} + make_interval(months => ${13 - startMonth})))::int)`
  return `date_trunc('${breakout.bin}', ${expression})::date`
}

function measureExpression(entity: ReportEntity, measure: ReportMeasure): string {
  if (measure.fn === 'count') return 'count(*)'
  const expression = reportColumnExpression(entity, measure.column ?? '')
  if (!expression) throw new Error(`${measure.fn} requires a valid column`)
  if ((measure.fn === 'sum' || measure.fn === 'avg') && reportColumn(entity, measure.column!)?.kind !== 'number') throw new Error(`${measure.fn} requires a numeric column`)
  return measure.fn === 'count_distinct' ? `count(distinct ${expression})` : `${measure.fn}(${expression})`
}
function measureLabel(entity: ReportEntity, measure: ReportMeasure): string { return measure.fn === 'count' ? 'Count' : `${measure.fn.replace('_', ' ')} of ${reportColumn(entity, measure.column ?? '')?.label ?? measure.column}` }
function toOutputColumn(entity: ReportEntity, key: string, label?: string): ReportColumn { return { key, label: label?.trim() || reportColumn(entity, key)?.label || key, semanticType: semanticType(entity, key), align: reportColumn(entity, key)?.kind === 'number' ? 'right' : 'left' } }
function semanticType(entity: ReportEntity, key: string): ReportColumn['semanticType'] { const kind = reportColumn(entity, key)?.kind; return kind === 'number' ? 'number' : kind === 'date' || kind === 'timestamp' ? 'date' : kind === 'boolean' ? 'boolean' : kind === 'enum' ? 'category' : 'text' }
function resolveLimit(value: number | null | undefined, maxRows = 10_000): number { const hard = Math.max(1, Math.min(10_000, Math.trunc(maxRows))); return Math.max(1, Math.min(hard, Number.isFinite(value) ? Math.trunc(value!) : 1000)) }
function unique(values: string[]): string[] { return [...new Set(values)] }

function appendImplicitFilters(entity: ReportEntity, where: string[], parameters: SqlParameters): void {
  if (entity.softDeleteExpression) where.push(`${entity.softDeleteExpression} IS NULL`)
  else if (entity.softDelete && entity.table && /^[a-z_][a-z0-9_]*$/i.test(entity.table)) where.push(`"${entity.table}"."deleted_at" IS NULL`)
  else if (entity.softDelete && entity.from && /^[a-z_][a-z0-9_]*$/i.test(entity.from)) where.push(`"${entity.from}"."deleted_at" IS NULL`)
  if (entity.baseFilter) {
    const compiled = compileReportRuleGroup(entity, entity.baseFilter, parameters)
    if (compiled) where.push(compiled)
  }
}
