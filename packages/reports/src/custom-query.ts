import { reportColumn, reportColumnExpression, reportColumnOptions, reportEntityFrom, reportTenantColumn, type ReportEntity, type ReportEntityCatalog } from './entities'
import { compileReportRuleGroup, SqlParameters, type ReportRuleGroup } from './filters'
import type { ReportColumn, ReportGroup, ReportRowScopeRule, ReportRunResult } from './types'

// 'latest' = the value on the chronologically last underlying row (entity must
// declare latestOrderExpr) — running totals like a payroll YTD end exactly,
// where max() would overstate after a net-negative period.
export const REPORT_AGG_FNS = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'latest'] as const
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
  /** Sectioned-summarize totals: per-section subtotal rows at the first
   *  non-section breakout level, and/or a final Grand totals group across all
   *  sections. Additive and 'latest' measures total; avg/min/max stay blank.
   *  `derived` rows combine level buckets arithmetically (e.g. Net pay =
   *  earnings − deductions), appended per section and to the grand group. */
  totals?: {
    sections?: boolean
    grand?: boolean
    derived?: ReportDerivedTotal[]
  } | null
}

/** One derived footer row: plus-bucket totals minus minus-bucket totals. */
export type ReportDerivedTotal = {
  label: string
  plus: { field: string; value: string }
  minus?: { field: string; value: string }
}

export type CompiledCustomReport = {
  sql: string
  params: unknown[]
  mode: 'rows' | 'summarize'
  columns: ReportColumn[]
  /**
   * Rows mode: the catalogue column to section by. Summarize mode: the output
   * key (`dN`) of the un-binned breakout the display sections by, when the
   * query's `groupBy` names one.
   */
  groupBy: string | null
  /** Summarize mode: the compiled breakouts, in `dN` order (drives per-row drill scopes). */
  breakouts?: ReportBreakout[]
  /** Summarize mode: the compiled measures, in `mN` order (drives totals). */
  measures?: ReportMeasure[]
  /** Sectioned summarize: totals flags echoed (sanitized) for the shaper. */
  totals?: ReportCustomQuery['totals']
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
  assertVisibleQueryColumns(entity, query)
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
  // Display-level sectioning by one un-binned breakout; the shaper splits per bucket.
  const sectionIndex = query.groupBy ? breakouts.findIndex((item) => item.column === query.groupBy && !item.bin) : -1
  // Sectioned summaries read as a ledger: enum dims follow their CATALOG
  // option order (a payroll journal lists earnings before deductions before
  // employer contributions), other dims keep ordinal ascending.
  const dimOrder = (item: ReportBreakout, index: number): string => {
    if (sectionIndex >= 0 && !item.bin) {
      const column = reportColumn(entity, item.column)
      const values = column?.kind === 'enum' ? reportColumnOptions(column).map((option) => option.value) : []
      if (values.length) {
        // Option values are catalogue-authored constants, single-quoted safely.
        const list = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ')
        return `array_position(ARRAY[${list}]::text[], ${reportColumnExpression(entity, item.column)}) ASC NULLS LAST`
      }
    }
    return `${index + 1}`
  }
  const group = breakouts.length ? `GROUP BY ${breakouts.map((_, index) => index + 1).join(', ')}` : ''
  const order = breakouts.length ? `ORDER BY ${breakouts.map(dimOrder).join(', ')}` : ''
  const sql = [`SELECT ${select.join(', ')}`, `FROM ${reportEntityFrom(entity)}`, `WHERE ${where.join(' AND ')}`, group, order, `LIMIT ${limit + 1}`].filter(Boolean).join('\n')
  const columns: ReportColumn[] = [
    ...breakouts.map((item, index) => ({ key: `d${index}`, label: item.label ?? reportColumn(entity, item.column)?.label ?? item.column, semanticType: semanticType(entity, item.column), align: 'left' as const })),
    // Counts are plain numbers even over money columns; every other aggregate keeps its column's semantics.
    ...measures.map((item, index) => ({ key: `m${index}`, label: item.label ?? measureLabel(entity, item), semanticType: item.fn === 'count' || item.fn === 'count_distinct' || !item.column ? 'number' as const : semanticType(entity, item.column), align: 'right' as const })),
  ]
  // Whitelist the totals shape: ≤4 derived specs, bounded labels, legs must be
  // valid catalogue columns — anything malformed is dropped, never guessed at.
  const derivedLeg = (leg: { field: string; value: string } | undefined): { field: string; value: string } | null =>
    leg && typeof leg.field === 'string' && reportColumnExpression(entity, leg.field) && typeof leg.value === 'string' && leg.value.length <= 128
      ? { field: leg.field, value: leg.value }
      : null
  const derived = (query.totals?.derived ?? []).slice(0, 4).flatMap((entry): ReportDerivedTotal[] => {
    const label = typeof entry?.label === 'string' ? entry.label.trim() : ''
    const plus = derivedLeg(entry?.plus)
    if (!label || label.length > 64 || !plus) return []
    const minus = entry?.minus ? derivedLeg(entry.minus) : null
    return [{ label, plus, ...(minus ? { minus } : {}) }]
  })
  const totals = sectionIndex >= 0 && query.totals
    ? {
        ...(query.totals.sections === true ? { sections: true } : {}),
        ...(query.totals.grand === true ? { grand: true } : {}),
        ...(derived.length ? { derived } : {}),
      }
    : null
  return { sql, params: parameters.values, mode: 'summarize', columns, groupBy: sectionIndex >= 0 ? `d${sectionIndex}` : null, breakouts, measures, totals: totals && Object.keys(totals).length ? totals : null, limit }
}

export function customReportResult(compiled: CompiledCustomReport, rows: Record<string, unknown>[], durationMs = 0): ReportRunResult {
  const truncated = rows.length > compiled.limit
  const visible = rows.slice(0, compiled.limit).map((row) => normalizeRowNumbers(compiled.columns, row))
  // Exact per-row scope of each aggregate bucket: eq for plain breakouts, an
  // inclusive date range for binned buckets, is-empty for null buckets. A row
  // whose bucket cannot be scoped precisely gets null — viewers then offer NO
  // drill rather than showing records that don't add up to the clicked number.
  const rowKeys = compiled.mode === 'summarize' ? visible.map((row) => rowScope(compiled.breakouts ?? [], row)) : undefined
  const groups: ReportGroup[] = []
  if (compiled.groupBy) {
    // Summarize sections lift the sectioning breakout out of the table; the
    // row scope keys stay COMPLETE so drills still hit the exact bucket.
    const sectionColumn = compiled.mode === 'summarize' ? compiled.columns.find((column) => column.key === compiled.groupBy) : undefined
    const columns = sectionColumn ? compiled.columns.filter((column) => column.key !== compiled.groupBy) : compiled.columns
    const grouped = new Map<string, { rows: Record<string, unknown>[]; keys: (ReportRowScopeRule[] | null)[]; raw: Record<string, unknown>[]; totalRows: number[]; dataCount: number }>()
    visible.forEach((row, index) => {
      const label = String(row[compiled.groupBy!] ?? '(none)')
      const bucket = grouped.get(label) ?? { rows: [], keys: [], raw: [], totalRows: [], dataCount: 0 }
      bucket.rows.push(row)
      bucket.keys.push(rowKeys?.[index] ?? null)
      bucket.raw.push(row)
      bucket.dataCount += 1
      grouped.set(label, bucket)
    })

    const breakouts = compiled.breakouts ?? []
    const measures = compiled.measures ?? []
    const sectionIndex = sectionColumn ? Number(compiled.groupBy.slice(1)) : -1
    // Which measure columns can honestly total. Additive aggregates sum, and
    // so do 'latest' running figures: each row carries the END value of a
    // disjoint per-bucket series (one employee's component YTD), so the sum
    // of endings IS the combined ending. avg/min/max stay blank — omission
    // over a wrong number. All-null inputs stay blank too.
    const summable = measures.map((measure) => measure.fn === 'sum' || measure.fn === 'count' || measure.fn === 'count_distinct' || measure.fn === 'latest')
    const totalCells = (input: Record<string, unknown>[]): Record<string, unknown> => {
      const cells: Record<string, unknown> = {}
      measures.forEach((measure, index) => {
        const key = `m${index}`
        const values = input.map((row) => row[key])
        if (!summable[index] || values.every((value) => value === null || value === undefined)) { cells[key] = null; return }
        const total = sumExactDecimals(values)
        cells[key] = measure.fn === 'sum' || measure.fn === 'latest' ? (formatExactReportNumber(total) ?? total) : Number(total)
      })
      return cells
    }

    // A derived footer row (e.g. Net pay = earnings − deductions) over a set
    // of raw aggregate rows: per summable measure, plus-bucket sum minus
    // minus-bucket sum, exact bigint decimals. Returns null when a leg's field
    // is not an un-binned breakout of this query (fail closed: no row beats a
    // wrong row).
    const levelIndex = breakouts.findIndex((_, index) => index !== sectionIndex)
    const derivedLabelKey = levelIndex >= 0 ? `d${levelIndex}` : columns[0]?.key
    const derivedRow = (spec: ReportDerivedTotal, raws: Record<string, unknown>[]): Record<string, unknown> | null => {
      const plusIndex = breakouts.findIndex((item) => item.column === spec.plus.field && !item.bin)
      const minusIndex = spec.minus ? breakouts.findIndex((item) => item.column === spec.minus!.field && !item.bin) : plusIndex
      if (plusIndex < 0 || minusIndex < 0) return null
      const row: Record<string, unknown> = {}
      measures.forEach((measure, index) => {
        const key = `m${index}`
        row[key] = null
        if (!summable[index]) return
        const plusInputs = raws.filter((raw) => String(raw[`d${plusIndex}`] ?? '') === spec.plus.value).map((raw) => raw[key])
        const minusInputs = spec.minus ? raws.filter((raw) => String(raw[`d${minusIndex}`] ?? '') === spec.minus!.value).map((raw) => raw[key]) : []
        if (plusInputs.every((value) => value === null || value === undefined) && minusInputs.every((value) => value === null || value === undefined)) return
        const total = subtractExactDecimals(sumExactDecimals(plusInputs), sumExactDecimals(minusInputs))
        row[key] = measure.fn === 'sum' || measure.fn === 'latest' ? (formatExactReportNumber(total) ?? total) : Number(total)
      })
      if (derivedLabelKey) row[derivedLabelKey] = spec.label
      return row
    }

    // Per-section subtotal rows on the first non-section breakout level —
    // exact decimal sums over the raw aggregates, never over display strings.
    if (sectionColumn && compiled.totals?.sections && breakouts.length >= 2 && levelIndex >= 0) {
      const levelKey = `d${levelIndex}`
      for (const bucket of grouped.values()) {
        const rows: Record<string, unknown>[] = []
        const keys: (ReportRowScopeRule[] | null)[] = []
        const totalRows: number[] = []
        let run: Record<string, unknown>[] = []
        const emit = () => {
          if (!run.length) return
          rows.push({ [levelKey]: `${levelLabel(run[0]![levelKey])} — total`, ...totalCells(run) })
          keys.push(null)
          totalRows.push(rows.length - 1)
          run = []
        }
        bucket.rows.forEach((row, index) => {
          if (run.length && String(row[levelKey] ?? '') !== String(run[0]![levelKey] ?? '')) emit()
          run.push(row)
          rows.push(row)
          keys.push(bucket.keys[index] ?? null)
        })
        emit()
        bucket.rows = rows
        bucket.keys = keys
        bucket.totalRows = totalRows
      }
    }

    // Derived footer rows per section (over that bucket's raw aggregate rows).
    if (sectionColumn && compiled.totals?.derived?.length) {
      for (const bucket of grouped.values()) {
        for (const spec of compiled.totals.derived) {
          const row = derivedRow(spec, bucket.raw)
          if (!row) continue
          bucket.totalRows.push(bucket.rows.length)
          bucket.rows.push(row)
          bucket.keys.push(null)
        }
      }
    }

    for (const [label, bucket] of grouped) {
      groups.push(sectionColumn
        ? { kind: 'summary', title: `${sectionColumn.label}: ${label}`, subtitle: `${bucket.dataCount} row${bucket.dataCount === 1 ? '' : 's'}`, columns, rows: bucket.rows, rowKeys: bucket.keys, ...(bucket.totalRows.length ? { totalRows: bucket.totalRows } : {}) }
        : { kind: 'section', title: label, columns, rows: bucket.rows })
    }

    // Grand totals across every section: one row per remaining-breakout combo,
    // additive and 'latest' measures summed exactly (disjoint bucket endings
    // add), with company-wide drill scopes.
    if (sectionColumn && compiled.totals?.grand && grouped.size > 0) {
      const combos = new Map<string, { rows: Record<string, unknown>[]; scope: ReportRowScopeRule[] | null }>()
      visible.forEach((row, index) => {
        const comboKey = breakouts.map((_, i) => (i === sectionIndex ? '' : String(row[`d${i}`] ?? ''))).join('\u0000')
        const entry = combos.get(comboKey) ?? {
          rows: [],
          scope: (rowKeys?.[index] ?? null)?.filter((rule) => rule.field !== breakouts[sectionIndex]?.column) ?? null,
        }
        entry.rows.push(row)
        combos.set(comboKey, entry)
      })
      const grandRows: Record<string, unknown>[] = []
      const grandKeys: (ReportRowScopeRule[] | null)[] = []
      // Insertion order = the query's ledger order (enum dims by catalog).
      for (const entry of combos.values()) {
        const dims: Record<string, unknown> = {}
        breakouts.forEach((_, i) => { if (i !== sectionIndex) dims[`d${i}`] = entry.rows[0]![`d${i}`] })
        grandRows.push({ ...dims, ...totalCells(entry.rows) })
        grandKeys.push(entry.scope)
      }
      // Derived footer rows company-wide (over ALL raw aggregate rows).
      const grandTotalRows: number[] = []
      if (compiled.totals.derived?.length) {
        for (const spec of compiled.totals.derived) {
          const row = derivedRow(spec, visible)
          if (!row) continue
          grandTotalRows.push(grandRows.length)
          grandRows.push(row)
          grandKeys.push(null)
        }
      }
      groups.push({ kind: 'summary', title: 'Grand totals', subtitle: `${grouped.size} group${grouped.size === 1 ? '' : 's'}`, columns, rows: grandRows, rowKeys: grandKeys, ...(grandTotalRows.length ? { totalRows: grandTotalRows } : {}) })
    }

    if (!groups.length) groups.push({ kind: compiled.mode === 'summarize' ? 'summary' : 'results', title: compiled.mode === 'summarize' ? 'Summary' : 'Results', columns, rows: [], isEmpty: true })
  } else {
    groups.push({ kind: compiled.mode === 'summarize' ? 'summary' : 'results', title: compiled.mode === 'summarize' ? 'Summary' : 'Results', columns: compiled.columns, rows: visible, rowKeys, isEmpty: visible.length === 0 })
  }
  return { groups, summary: [], rowCount: visible.length, truncated, durationMs }
}

function rowScope(breakouts: ReportBreakout[], row: Record<string, unknown>): ReportRowScopeRule[] | null {
  const scope: ReportRowScopeRule[] = []
  for (const [index, breakout] of breakouts.entries()) {
    const raw = row[`d${index}`]
    if (raw === null || raw === undefined) {
      scope.push({ field: breakout.column, empty: true })
      continue
    }
    if (breakout.bin) {
      const range = binRange(raw, breakout.bin)
      if (!range) return null
      scope.push({ field: breakout.column, ...range })
    } else {
      scope.push({ field: breakout.column, value: String(raw) })
    }
  }
  return scope
}

/**
 * Inclusive [from, to] date bounds of one temporal bucket. The raw value is
 * the bucket START (date_trunc output) — pg hands date columns back as Date at
 * LOCAL midnight, so local parts are the truth (toISOString would shift a day
 * east of UTC). Fiscal year/quarter buckets compile to integers here, which
 * cannot be scoped as a date range — those rows fail closed (null).
 */
function binRange(value: unknown, bin: ReportTemporalBin): { from: string; to: string } | null {
  let year: number, month: number, day: number
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    year = value.getFullYear(); month = value.getMonth(); day = value.getDate()
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
    if (!match) return null
    year = Number(match[1]); month = Number(match[2]) - 1; day = Number(match[3])
  }
  const start = new Date(Date.UTC(year, month, day))
  const end = new Date(start)
  switch (bin) {
    case 'day':
      break
    case 'week':
      end.setUTCDate(end.getUTCDate() + 6)
      break
    case 'month':
    case 'fiscal_period':
      end.setUTCMonth(end.getUTCMonth() + 1)
      end.setUTCDate(end.getUTCDate() - 1)
      break
    case 'quarter':
      end.setUTCMonth(end.getUTCMonth() + 3)
      end.setUTCDate(end.getUTCDate() - 1)
      break
    case 'year':
      end.setUTCMonth(end.getUTCMonth() + 12)
      end.setUTCDate(end.getUTCDate() - 1)
      break
    default:
      return null
  }
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

/** Numeric/money cells often arrive as exact pg numeric strings — normalize them without losing precision. */
function normalizeRowNumbers(columns: ReportColumn[], row: Record<string, unknown>): Record<string, unknown> {
  let changed = false
  const next: Record<string, unknown> = { ...row }
  for (const column of columns) {
    if (column.semanticType !== 'number' && column.semanticType !== 'currency') continue
    const value = next[column.key]
    if (typeof value !== 'string') continue
    const formatted = formatExactReportNumber(value)
    if (formatted !== null && formatted !== value) { next[column.key] = formatted; changed = true }
  }
  return changed ? next : row
}

/** Human label for a subtotal level value — pg dates arrive as LOCAL-midnight Dates, so local parts are the truth. */
function levelLabel(value: unknown): string {
  if (value === null || value === undefined) return '(none)'
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  return String(value)
}

function decimalParts(value: unknown): { units: bigint; scale: number } | null {
  const raw = String(value ?? '').trim()
  const match = /^([-+]?)(\d+)(?:\.(\d*))?$/.exec(raw)
  if (!match) return null
  const fraction = match[3] ?? ''
  const magnitude = BigInt(match[2]! + fraction)
  return { units: match[1] === '-' ? -magnitude : magnitude, scale: fraction.length }
}

/** Exact decimal sum over raw aggregate values (never floats — a ledger total must not drift). */
/** a − b at combined scale, exact bigint decimals (reuses the sum machinery). */
function subtractExactDecimals(a: string, b: string): string {
  const negated = b.startsWith('-') ? b.slice(1) : `-${b}`
  return sumExactDecimals([a, negated])
}

function sumExactDecimals(values: unknown[]): string {
  const parts = values.map(decimalParts).filter((part): part is { units: bigint; scale: number } => part !== null)
  const scale = parts.reduce((maximum, part) => Math.max(maximum, part.scale), 0)
  const units = parts.reduce((total, part) => total + part.units * 10n ** BigInt(scale - part.scale), 0n)
  const negative = units < 0n
  const absolute = negative ? -units : units
  if (scale === 0) return `${negative ? '-' : ''}${absolute}`
  const digits = absolute.toString().padStart(scale + 1, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}

/**
 * Exact display normalization for decimal strings: trailing zeros collapse to
 * ledger-style two places ("2938.0000" → "2938.00") while genuine precision
 * (rates like 0.0625) passes through untouched. True integers (years, counts)
 * stay integers — only values that carry a decimal point normalize to two
 * places. Non-numeric input returns null.
 */
export function formatExactReportNumber(value: unknown): string | null {
  const raw = String(value ?? '').trim().replace(/^\+/, '')
  if (!/^[-+]?\d+(\.\d*)?$/.test(raw)) return null
  if (!raw.includes('.')) return raw
  const [whole, fraction = ''] = raw.split('.')
  if (fraction.length <= 2 || /^\d{0,2}0*$/.test(fraction)) {
    return `${whole}.${fraction.slice(0, 2).padEnd(2, '0')}`
  }
  return raw
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
  const kind = reportColumn(entity, measure.column!)?.kind
  if ((measure.fn === 'sum' || measure.fn === 'avg') && kind !== 'number' && kind !== 'money') throw new Error(`${measure.fn} requires a numeric column`)
  if (measure.fn === 'latest') {
    // Exact end-of-window value of a running figure: the value carried by the
    // chronologically last row in the group.
    if (!entity.latestOrderExpr) throw new Error(`Report entity "${entity.key}" does not support the 'latest' aggregate (no latestOrderExpr)`)
    return `(ARRAY_AGG(${expression} ORDER BY ${entity.latestOrderExpr}))[1]`
  }
  return measure.fn === 'count_distinct' ? `count(distinct ${expression})` : `${measure.fn}(${expression})`
}
function measureLabel(entity: ReportEntity, measure: ReportMeasure): string { return measure.fn === 'count' ? 'Count' : `${measure.fn.replace('_', ' ')} of ${reportColumn(entity, measure.column ?? '')?.label ?? measure.column}` }
function toOutputColumn(entity: ReportEntity, key: string, label?: string): ReportColumn { const kind = reportColumn(entity, key)?.kind; return { key, label: label?.trim() || reportColumn(entity, key)?.label || key, semanticType: semanticType(entity, key), align: kind === 'number' || kind === 'money' ? 'right' : 'left' } }
function semanticType(entity: ReportEntity, key: string): ReportColumn['semanticType'] { const kind = reportColumn(entity, key)?.kind; return kind === 'money' ? 'currency' : kind === 'number' ? 'number' : kind === 'date' || kind === 'timestamp' ? 'date' : kind === 'boolean' ? 'boolean' : kind === 'enum' ? 'category' : 'text' }
function resolveLimit(value: number | null | undefined, maxRows = 10_000): number { const hard = Math.max(1, Math.min(10_000, Math.trunc(maxRows))); return Math.max(1, Math.min(hard, Number.isFinite(value) ? Math.trunc(value!) : 1000)) }
function unique(values: string[]): string[] { return [...new Set(values)] }

function assertVisibleQueryColumns(entity: ReportEntity, query: ReportCustomQuery): void {
  const referenced = [
    ...query.columns,
    ...(query.groupBy ? [query.groupBy] : []),
    ...(query.breakouts ?? []).map((breakout) => breakout.column),
    ...(query.measures ?? []).flatMap((measure) => measure.column ? [measure.column] : []),
    ...(query.sorts?.length ? query.sorts : query.sort ? [query.sort] : []).map((sort) => sort.column),
    ...filterFields(query.filters),
  ]
  const hidden = unique(referenced.filter((key) => reportColumn(entity, key)?.hidden))
  if (hidden.length) {
    throw new Error(`Report query references internal column${hidden.length === 1 ? '' : 's'}: ${hidden.join(', ')}`)
  }
}

function filterFields(group: ReportRuleGroup | null | undefined): string[] {
  if (!group) return []
  return group.rules.flatMap((rule) => 'rules' in rule ? filterFields(rule) : [rule.field])
}

function appendImplicitFilters(entity: ReportEntity, where: string[], parameters: SqlParameters): void {
  if (entity.softDeleteExpression) where.push(`${entity.softDeleteExpression} IS NULL`)
  else if (entity.softDelete && entity.table && /^[a-z_][a-z0-9_]*$/i.test(entity.table)) where.push(`"${entity.table}"."deleted_at" IS NULL`)
  else if (entity.softDelete && entity.from && /^[a-z_][a-z0-9_]*$/i.test(entity.from)) where.push(`"${entity.from}"."deleted_at" IS NULL`)
  if (entity.baseFilter) {
    const compiled = compileReportRuleGroup(entity, entity.baseFilter, parameters)
    if (compiled) where.push(compiled)
  }
}
