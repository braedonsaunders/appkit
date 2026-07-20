import { canBin, canDimension, canMeasure, fieldFromSource, filterOperatorsForField, sourceFromCatalog } from './catalog'
import { FORMULA_FUNCTIONS, validFormulaFunctionArity } from './expression'
import type {
  AggregateFunction,
  AnalyticsCatalog,
  AnalyticsField,
  AnalyticsSource,
  CompiledQuery,
  DateBin,
  FilterOperator,
  FormulaExpression,
  InsightQuery,
  QueryFilter,
  QueryMeasure,
  ResultColumn,
  SemanticType,
} from './types'

export type QueryErrorCode =
  | 'unknown_source' | 'unknown_field' | 'invalid_measure' | 'invalid_dimension'
  | 'invalid_filter' | 'invalid_formula' | 'empty_query'

export class QueryCompileError extends Error {
  override readonly name = 'QueryCompileError'
  constructor(readonly code: QueryErrorCode, message: string, readonly subject?: string) { super(message) }
}

const MAX_ROWS = 10_000
const DATE_BINS: readonly DateBin[] = ['day', 'week', 'month', 'quarter', 'year']
const AGGREGATES: readonly AggregateFunction[] = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max']
const SCALAR_FUNCTIONS = new Set<string>(FORMULA_FUNCTIONS)
const DATE_PARTS = new Set(['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'dow', 'doy'])
const DATE_TRUNC_PARTS = new Set(['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second'])
const DATE_DIFF_SECONDS: Record<string, number> = { week: 604800, day: 86400, hour: 3600, minute: 60, second: 1 }

type Context = { source: AnalyticsSource; params: unknown[] }
const safeAlias = (value: string | undefined, fallback: string) => {
  const normalized = (value ?? fallback).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '')
  return (normalized || fallback).slice(0, 60)
}
const bind = (context: Context, value: unknown) => { context.params.push(value); return `$${context.params.length}` }
const resultType = (field: AnalyticsField | null): SemanticType => field?.semanticType === 'currency' ? 'currency' : 'number'

function compileFilter(context: Context, filter: QueryFilter): string {
  const field = fieldFromSource(context.source, filter.field)
  if (!field) throw new QueryCompileError('unknown_field', `Unknown filter field "${filter.field}".`, filter.field)
  const expression = field.expression; const value = filter.value; const operator: FilterOperator = filter.operator
  if (!filterOperatorsForField(field).includes(operator)) throw new QueryCompileError('invalid_filter', `The ${operator} filter is not valid for "${field.label}".`, field.key)
  switch (operator) {
    case 'eq': return `${expression} = ${bind(context, value)}`
    case 'neq': return `${expression} <> ${bind(context, value)}`
    case 'gt': return `${expression} > ${bind(context, value)}`
    case 'gte': return `${expression} >= ${bind(context, value)}`
    case 'lt': return `${expression} < ${bind(context, value)}`
    case 'lte': return `${expression} <= ${bind(context, value)}`
    case 'contains': {
      if (typeof value !== 'string') throw new QueryCompileError('invalid_filter', 'Contains requires text.')
      return `${expression} ilike ${bind(context, `%${value}%`)}`
    }
    case 'in': case 'not_in': {
      const values = Array.isArray(value) ? value : value == null ? [] : [value as string | number]
      if (!values.length) return operator === 'in' ? 'false' : 'true'
      return `${expression} ${operator === 'not_in' ? 'not ' : ''}= any(${bind(context, values)})`
    }
    case 'is_null': return `${expression} is null`
    case 'is_not_null': return `${expression} is not null`
    case 'last_n_days': {
      const days = Number(value)
      if (!Number.isFinite(days) || days < 0) throw new QueryCompileError('invalid_filter', 'Last N days requires a positive number.')
      return `${expression} >= current_date - ${bind(context, Math.trunc(days))}::int`
    }
    case 'this_month': return `${expression} >= date_trunc('month', current_date) and ${expression} < date_trunc('month', current_date) + interval '1 month'`
    case 'this_quarter': return `${expression} >= date_trunc('quarter', current_date) and ${expression} < date_trunc('quarter', current_date) + interval '3 months'`
    case 'this_year': return `${expression} >= date_trunc('year', current_date) and ${expression} < date_trunc('year', current_date) + interval '1 year'`
    case 'ytd': return `${expression} >= date_trunc('year', current_date) and ${expression} <= current_date`
  }
}

function compileFormula(context: Context, formula: FormulaExpression, aggregateDepth = 0): string {
  const nested = (item: FormulaExpression): string => compileFormula(context, item, aggregateDepth)
  switch (formula.expression) {
    case 'field': {
      const field = fieldFromSource(context.source, formula.field)
      if (!field) throw new QueryCompileError('unknown_field', `Unknown formula field "${formula.field}".`, formula.field)
      if (aggregateDepth === 0) throw new QueryCompileError('invalid_formula', `Formula field "${field.label}" must be inside an aggregate function.`, field.key)
      return field.expression
    }
    case 'literal': return bind(context, formula.value)
    case 'arithmetic': return `(${nested(formula.left)} ${formula.operator} ${nested(formula.right)})`
    case 'compare': return `(${nested(formula.left)} ${formula.operator === '!=' ? '<>' : formula.operator} ${nested(formula.right)})`
    case 'null': return `(${nested(formula.argument)} is ${formula.negated ? 'not ' : ''}null)`
    case 'logic': {
      if (formula.operator === 'not') return `(not ${nested(formula.arguments[0]!)})`
      return `(${formula.arguments.map(nested).join(` ${formula.operator} `)})`
    }
    case 'case': return `(case ${formula.branches.map((branch) => `when ${nested(branch.when)} then ${nested(branch.then)}`).join(' ')}${formula.otherwise ? ` else ${nested(formula.otherwise)}` : ''} end)`
    case 'aggregate': {
      if (!AGGREGATES.includes(formula.fn)) throw new QueryCompileError('invalid_formula', `Unsupported aggregate "${formula.fn}".`)
      if (formula.fn === 'count') {
        if (formula.argument) throw new QueryCompileError('invalid_formula', 'count() does not accept an argument.')
        return 'count(*)'
      }
      if (!formula.argument) throw new QueryCompileError('invalid_formula', `${formula.fn} requires an argument.`)
      const argument = compileFormula(context, formula.argument, aggregateDepth + 1)
      if (formula.fn === 'count_distinct') return `count(distinct ${argument})`
      return `${formula.fn}(${argument})`
    }
    case 'call': {
      if (!SCALAR_FUNCTIONS.has(formula.fn)) throw new QueryCompileError('invalid_formula', `Unsupported function "${formula.fn}".`)
      if (!validFormulaFunctionArity(formula.fn, formula.arguments.length)) throw new QueryCompileError('invalid_formula', `${formula.fn}() has the wrong number of arguments.`)
      if (formula.fn === 'datepart') {
        const part = formula.arguments[0]
        if (part?.expression !== 'literal' || typeof part.value !== 'string' || !DATE_PARTS.has(part.value.toLowerCase()) || !formula.arguments[1]) throw new QueryCompileError('invalid_formula', 'datepart requires a supported literal date part and a value.')
        return `extract(${part.value.toLowerCase()} from ${nested(formula.arguments[1])})`
      }
      if (formula.fn === 'datetrunc') {
        const part = formula.arguments[0]
        if (part?.expression !== 'literal' || typeof part.value !== 'string' || !DATE_TRUNC_PARTS.has(part.value.toLowerCase()) || !formula.arguments[1]) throw new QueryCompileError('invalid_formula', 'datetrunc requires a supported literal date part and a value.')
        return `date_trunc('${part.value.toLowerCase()}', ${nested(formula.arguments[1])})`
      }
      if (formula.fn === 'datediff') {
        const part = formula.arguments[0]
        const unit = part?.expression === 'literal' && typeof part.value === 'string' ? part.value.toLowerCase() : ''
        if (!DATE_DIFF_SECONDS[unit] || !formula.arguments[1] || !formula.arguments[2]) throw new QueryCompileError('invalid_formula', 'datediff requires a supported literal date part, start, and end.')
        return `(extract(epoch from (${nested(formula.arguments[2])} - ${nested(formula.arguments[1])})) / ${DATE_DIFF_SECONDS[unit]})`
      }
      const args = formula.arguments.map(nested)
      switch (formula.fn) {
        case 'current_date': return 'current_date'
        default: return `${formula.fn}(${args.join(', ')})`
      }
    }
  }
}

function compileMeasure(context: Context, measure: QueryMeasure): { expression: string; alias: string; column: ResultColumn } {
  if (measure.kind === 'formula') {
    const alias = safeAlias(measure.alias, 'formula')
    return { expression: compileFormula(context, measure.formula), alias, column: { key: alias, label: measure.label ?? measure.alias, semanticType: 'number', role: 'measure' } }
  }
  if (!AGGREGATES.includes(measure.fn)) throw new QueryCompileError('invalid_measure', `Unknown aggregate "${measure.fn}".`)
  if (measure.fn === 'count') {
    const alias = safeAlias(measure.alias, 'count')
    return { expression: 'count(*)', alias, column: { key: alias, label: measure.label ?? 'Count', semanticType: 'number', role: 'measure' } }
  }
  const field = fieldFromSource(context.source, measure.field ?? '')
  if (!field) throw new QueryCompileError('unknown_field', `Unknown measure field "${measure.field}".`, measure.field)
  if (!canMeasure(field) && measure.fn !== 'count_distinct') throw new QueryCompileError('invalid_measure', `"${field.label}" cannot be measured.`, field.key)
  const alias = safeAlias(measure.alias, `${measure.fn}_${field.key}`)
  const expression = measure.fn === 'count_distinct' ? `count(distinct ${field.expression})` : `${measure.fn}(${field.expression})`
  return { expression, alias, column: { key: alias, label: measure.label ?? `${measure.fn === 'sum' ? 'Total' : measure.fn.replace('_', ' ')} ${field.label}`, semanticType: resultType(field), role: 'measure' } }
}

export function compileQuery(query: InsightQuery, tenantId: string, catalog: AnalyticsCatalog): CompiledQuery {
  const source = sourceFromCatalog(catalog, query.source)
  if (!source) throw new QueryCompileError('unknown_source', `Unknown source "${query.source}".`, query.source)
  const context: Context = { source, params: [tenantId] }
  const filters = [`${source.tenantColumn} = $1`, ...(query.filters ?? []).map((filter) => compileFilter(context, filter))]
  const selects: string[] = []; const columns: ResultColumn[] = []; const aliases = new Set<string>()
  const unique = (value: string) => { let candidate = value; let index = 2; while (aliases.has(candidate)) candidate = `${value}_${index++}`; aliases.add(candidate); return candidate }
  const dimensions = query.dimensions ?? []; const measures = query.measures ?? []
  if (!dimensions.length && !measures.length) {
    for (const key of source.detailColumns) {
      const field = fieldFromSource(source, key); if (!field) continue
      const alias = unique(safeAlias(field.key, 'field')); selects.push(`${field.expression} as "${alias}"`)
      columns.push({ key: alias, label: field.label, semanticType: field.semanticType, role: 'dimension' })
    }
  } else {
    for (const dimension of dimensions) {
      const field = fieldFromSource(source, dimension.field)
      if (!field) throw new QueryCompileError('unknown_field', `Unknown dimension "${dimension.field}".`, dimension.field)
      if (!canDimension(field)) throw new QueryCompileError('invalid_dimension', `"${field.label}" cannot be grouped.`, field.key)
      if (dimension.bin && (!DATE_BINS.includes(dimension.bin) || !canBin(field))) throw new QueryCompileError('invalid_dimension', `"${field.label}" cannot use that date bin.`, field.key)
      const expression = dimension.bin ? `date_trunc('${dimension.bin}', ${field.expression})::date` : field.expression
      const alias = unique(safeAlias(dimension.alias, dimension.bin ? `${field.key}_${dimension.bin}` : field.key))
      selects.push(`${expression} as "${alias}"`); columns.push({ key: alias, label: dimension.bin ? `${field.label} (${dimension.bin})` : field.label, semanticType: dimension.bin ? 'date' : field.semanticType, role: 'dimension' })
    }
    for (const measure of measures) {
      const compiled = compileMeasure(context, measure); const alias = unique(compiled.alias)
      selects.push(`${compiled.expression} as "${alias}"`); columns.push({ ...compiled.column, key: alias })
    }
  }
  if (!selects.length) throw new QueryCompileError('empty_query', 'The query selects no columns.')
  const groupBy = dimensions.length ? `\ngroup by ${dimensions.map((_, index) => index + 1).join(', ')}` : ''
  const orderParts = (query.sort ?? []).flatMap((sort) => { const index = columns.findIndex((column) => column.key === sort.ref); return index < 0 ? [] : [`${index + 1} ${sort.direction} nulls last`] })
  const defaultSortIndex = !dimensions.length && !measures.length && source.defaultSort ? columns.findIndex((column) => column.key === safeAlias(source.defaultSort?.field, 'field')) : -1
  const fallbackOrder = !orderParts.length && measures.length ? `${dimensions.length + 1} desc nulls last` : defaultSortIndex >= 0 ? `${defaultSortIndex + 1} ${source.defaultSort!.direction} nulls last` : ''
  const orderBy = orderParts.length || fallbackOrder ? `\norder by ${orderParts.join(', ') || fallbackOrder}` : ''
  const limit = query.limit == null || !Number.isFinite(query.limit) ? MAX_ROWS : Math.max(1, Math.min(MAX_ROWS, Math.trunc(query.limit)))
  return { sql: `select ${selects.join(', ')}\nfrom ${source.from}\nwhere ${filters.join(' and ')}${groupBy}${orderBy}\nlimit ${limit + 1}`, params: context.params, columns, limit }
}

export const QUERY_MAX_ROWS = MAX_ROWS
