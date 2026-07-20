import { compileQuery, type AnalyticsCatalog } from '@appkit/analytics/server'
import type {
  AggregateFunction,
  DateBin,
  FormulaExpression,
  InsightQuery,
  QueryFilter,
  QueryMeasure,
  QueryResult,
} from '@appkit/analytics'
import { DEMO_AUDIT_EVENTS, DEMO_MEMBERS, DEMO_ROLES, DEMO_TENANT } from './demo-data'

type DataRow = Record<string, unknown>

const DEMO_NOW = new Date('2026-07-20T12:00:00.000Z')

const DATA: Record<string, readonly DataRow[]> = {
  members: DEMO_MEMBERS.map((item) => ({
    name: item.name,
    email: item.email,
    role: item.role,
    active: item.active,
    joined_at: item.createdAt,
  })),
  roles: DEMO_ROLES.map((item) => ({ name: item.name, key: item.key, created_at: item.createdAt })),
  audit: DEMO_AUDIT_EVENTS.map((item) => ({
    action: item.action,
    entity_type: item.entityType,
    summary: item.summary,
    created_at: item.createdAt,
  })),
}

export function executeDemoQueryInMemory(
  query: InsightQuery,
  catalog: AnalyticsCatalog,
): QueryResult {
  const compiled = compileQuery(query, DEMO_TENANT.id, catalog)
  const source = catalog.sources.find((item) => item.key === query.source)
  if (!source) throw new Error(`Unknown source "${query.source}".`)
  const input = [...(DATA[query.source] ?? [])].filter((row) =>
    (query.filters ?? []).every((filter) => matchesFilter(row, filter)),
  )
  const dimensions = query.dimensions ?? []
  const measures = query.measures ?? []

  let rows: DataRow[]
  if (dimensions.length === 0 && measures.length === 0) {
    rows = input.map((row) =>
      Object.fromEntries(
        compiled.columns.map((column, index) => [
          column.key,
          outputValue(row[source.detailColumns[index]!]),
        ]),
      ),
    )
  } else {
    const groups = new Map<string, { dimensions: unknown[]; rows: DataRow[] }>()
    for (const row of input) {
      const values = dimensions.map((dimension) =>
        dimension.bin ? binDate(row[dimension.field], dimension.bin) : row[dimension.field],
      )
      const key = JSON.stringify(values.map(outputValue))
      const group = groups.get(key) ?? { dimensions: values, rows: [] }
      group.rows.push(row)
      groups.set(key, group)
    }
    if (dimensions.length === 0) groups.set('all', { dimensions: [], rows: input })

    rows = [...groups.values()].map((group) => {
      const output: DataRow = {}
      dimensions.forEach((_, index) => {
        output[compiled.columns[index]!.key] = outputValue(group.dimensions[index])
      })
      measures.forEach((measure, index) => {
        output[compiled.columns[dimensions.length + index]!.key] = measureValue(measure, group.rows)
      })
      return output
    })
  }

  const sorts = query.sort ?? []
  if (sorts.length > 0) {
    rows.sort((left, right) => {
      for (const sort of sorts) {
        const comparison = compare(left[sort.ref], right[sort.ref])
        if (comparison !== 0) return sort.direction === 'asc' ? comparison : -comparison
      }
      return 0
    })
  } else if (measures.length > 0) {
    const firstMeasure = compiled.columns[dimensions.length]?.key
    if (firstMeasure) rows.sort((left, right) => compare(right[firstMeasure], left[firstMeasure]))
  } else if (source.defaultSort) {
    const column = compiled.columns.find((item) => item.key === source.defaultSort!.field)?.key
    if (column) rows.sort((left, right) => {
      const comparison = compare(left[column], right[column])
      return source.defaultSort!.direction === 'asc' ? comparison : -comparison
    })
  }

  const truncated = rows.length > compiled.limit
  rows = rows.slice(0, compiled.limit)
  return { columns: compiled.columns, rows, rowCount: rows.length, truncated, durationMs: 1 }
}

function matchesFilter(row: DataRow, filter: QueryFilter): boolean {
  const left = row[filter.field]
  const right = filter.value
  switch (filter.operator) {
    case 'eq': return comparable(left) === comparable(right)
    case 'neq': return comparable(left) !== comparable(right)
    case 'gt': return compare(left, right) > 0
    case 'gte': return compare(left, right) >= 0
    case 'lt': return compare(left, right) < 0
    case 'lte': return compare(left, right) <= 0
    case 'contains': return String(left ?? '').toLocaleLowerCase().includes(String(right ?? '').toLocaleLowerCase())
    case 'in': return (Array.isArray(right) ? right : right == null ? [] : [right]).some((value) => comparable(left) === comparable(value))
    case 'not_in': return !(Array.isArray(right) ? right : right == null ? [] : [right]).some((value) => comparable(left) === comparable(value))
    case 'is_null': return left == null
    case 'is_not_null': return left != null
    case 'last_n_days': return asDate(left).getTime() >= DEMO_NOW.getTime() - Math.max(0, Number(right)) * 86_400_000
    case 'this_month': return samePeriod(left, 'month')
    case 'this_quarter': return samePeriod(left, 'quarter')
    case 'this_year': return samePeriod(left, 'year')
    case 'ytd': {
      const date = asDate(left)
      return date.getUTCFullYear() === DEMO_NOW.getUTCFullYear() && date <= DEMO_NOW
    }
  }
}

function samePeriod(value: unknown, period: 'month' | 'quarter' | 'year'): boolean {
  const date = asDate(value)
  if (date.getUTCFullYear() !== DEMO_NOW.getUTCFullYear()) return false
  if (period === 'year') return true
  if (period === 'month') return date.getUTCMonth() === DEMO_NOW.getUTCMonth()
  return Math.floor(date.getUTCMonth() / 3) === Math.floor(DEMO_NOW.getUTCMonth() / 3)
}

function measureValue(measure: QueryMeasure, rows: DataRow[]): unknown {
  if (measure.kind === 'formula') return evaluateFormula(measure.formula, rows)
  return aggregate(measure.fn, rows, measure.field)
}

function aggregate(fn: AggregateFunction, rows: DataRow[], field?: string): unknown {
  if (fn === 'count') return rows.length
  const values = rows.map((row) => row[field ?? '']).filter((value) => value != null)
  if (fn === 'count_distinct') return new Set(values.map(comparable)).size
  const numbers = values.map(Number).filter(Number.isFinite)
  if (numbers.length === 0) return 0
  if (fn === 'sum') return numbers.reduce((total, value) => total + value, 0)
  if (fn === 'avg') return numbers.reduce((total, value) => total + value, 0) / numbers.length
  if (fn === 'min') return Math.min(...numbers)
  return Math.max(...numbers)
}

function evaluateFormula(expression: FormulaExpression, rows: DataRow[], row?: DataRow): unknown {
  const nested = (item: FormulaExpression) => evaluateFormula(item, rows, row)
  switch (expression.expression) {
    case 'field': return row?.[expression.field]
    case 'literal': return expression.value
    case 'aggregate': {
      if (expression.fn === 'count') return rows.length
      const values = rows.map((item) => evaluateFormula(expression.argument!, rows, item)).filter((value) => value != null)
      if (expression.fn === 'count_distinct') return new Set(values.map(comparable)).size
      const numbers = values.map(Number).filter(Number.isFinite)
      if (numbers.length === 0) return 0
      if (expression.fn === 'sum') return numbers.reduce((total, value) => total + value, 0)
      if (expression.fn === 'avg') return numbers.reduce((total, value) => total + value, 0) / numbers.length
      if (expression.fn === 'min') return Math.min(...numbers)
      return Math.max(...numbers)
    }
    case 'arithmetic': {
      const left = Number(nested(expression.left)); const right = Number(nested(expression.right))
      if (expression.operator === '+') return left + right
      if (expression.operator === '-') return left - right
      if (expression.operator === '*') return left * right
      return right === 0 ? null : left / right
    }
    case 'compare': {
      const result = compare(nested(expression.left), nested(expression.right))
      if (expression.operator === '=') return result === 0
      if (expression.operator === '!=') return result !== 0
      if (expression.operator === '<') return result < 0
      if (expression.operator === '<=') return result <= 0
      if (expression.operator === '>') return result > 0
      return result >= 0
    }
    case 'null': return expression.negated ? nested(expression.argument) != null : nested(expression.argument) == null
    case 'logic': {
      if (expression.operator === 'not') return !nested(expression.arguments[0]!)
      if (expression.operator === 'and') return expression.arguments.every((item) => Boolean(nested(item)))
      return expression.arguments.some((item) => Boolean(nested(item)))
    }
    case 'case': {
      for (const branch of expression.branches) if (nested(branch.when)) return nested(branch.then)
      return expression.otherwise ? nested(expression.otherwise) : null
    }
    case 'call': return callFunction(expression.fn, expression.arguments.map(nested))
  }
}

function callFunction(fn: string, args: unknown[]): unknown {
  if (fn === 'now') return DEMO_NOW
  if (fn === 'current_date') return new Date(Date.UTC(DEMO_NOW.getUTCFullYear(), DEMO_NOW.getUTCMonth(), DEMO_NOW.getUTCDate()))
  if (fn === 'coalesce') return args.find((value) => value != null) ?? null
  if (fn === 'nullif') return comparable(args[0]) === comparable(args[1]) ? null : args[0]
  if (fn === 'abs') return Math.abs(Number(args[0]))
  if (fn === 'round') { const precision = Number(args[1] ?? 0); const scale = 10 ** precision; return Math.round(Number(args[0]) * scale) / scale }
  if (fn === 'ceil') return Math.ceil(Number(args[0]))
  if (fn === 'floor') return Math.floor(Number(args[0]))
  if (fn === 'power') return Number(args[0]) ** Number(args[1])
  if (fn === 'sqrt') return Math.sqrt(Number(args[0]))
  if (fn === 'lower') return String(args[0] ?? '').toLocaleLowerCase()
  if (fn === 'upper') return String(args[0] ?? '').toLocaleUpperCase()
  if (fn === 'length') return String(args[0] ?? '').length
  if (fn === 'trim') return String(args[0] ?? '').trim()
  if (fn === 'concat') return args.map((value) => String(value ?? '')).join('')
  if (fn === 'datediff') {
    const unit = String(args[0]); const milliseconds = asDate(args[2]).getTime() - asDate(args[1]).getTime()
    const units: Record<string, number> = { week: 604_800_000, day: 86_400_000, hour: 3_600_000, minute: 60_000, second: 1_000 }
    return milliseconds / (units[unit] ?? 1)
  }
  if (fn === 'datetrunc') return binDate(args[1], String(args[0]) as DateBin)
  if (fn === 'datepart') {
    const date = asDate(args[1]); const part = String(args[0])
    if (part === 'year') return date.getUTCFullYear()
    if (part === 'quarter') return Math.floor(date.getUTCMonth() / 3) + 1
    if (part === 'month') return date.getUTCMonth() + 1
    if (part === 'day') return date.getUTCDate()
    if (part === 'dow') return date.getUTCDay()
  }
  return null
}

function binDate(value: unknown, bin: DateBin): Date {
  const date = asDate(value)
  const year = date.getUTCFullYear(); const month = date.getUTCMonth(); const day = date.getUTCDate()
  if (bin === 'year') return new Date(Date.UTC(year, 0, 1))
  if (bin === 'quarter') return new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1))
  if (bin === 'month') return new Date(Date.UTC(year, month, 1))
  if (bin === 'week') {
    const result = new Date(Date.UTC(year, month, day)); const offset = (result.getUTCDay() + 6) % 7
    result.setUTCDate(result.getUTCDate() - offset); return result
  }
  return new Date(Date.UTC(year, month, day))
}

function asDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

function comparable(value: unknown): string | number | boolean | null {
  if (value == null) return null
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' || typeof value === 'boolean') return value
  return String(value).toLocaleLowerCase()
}

function compare(left: unknown, right: unknown): number {
  const a = comparable(left); const b = comparable(right)
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function outputValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value
}
