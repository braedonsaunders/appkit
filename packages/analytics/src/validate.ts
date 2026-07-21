import { canBin, canDimension, canMeasure, fieldFromSource, filterOperatorsForField, sourceFromCatalog } from './catalog'
import type { AggregateFunction, AnalyticsCatalog, DateBin, FilterOperator, FormulaExpression, InsightQuery, QueryDimension, QueryFilter, QueryMeasure, QuerySort } from './types'

export type QueryValidationCode = 'unknown_source' | 'unknown_field' | 'invalid_measure' | 'invalid_dimension' | 'invalid_filter' | 'invalid_formula' | 'invalid_sort' | 'invalid_limit' | 'invalid_query'

export class QueryValidationError extends Error {
  override readonly name = 'QueryValidationError'
  constructor(message: string, readonly code: QueryValidationCode = 'invalid_query', readonly subject?: string) { super(message) }
}

const AGGREGATES = new Set(['count', 'count_distinct', 'sum', 'avg', 'min', 'max'])
const DATE_BINS = new Set<DateBin>(['day', 'week', 'month', 'quarter', 'year'])

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new QueryValidationError('Query entries must be objects.')
  return value as Record<string, unknown>
}

function optionalArray(value: unknown, label: string): unknown[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new QueryValidationError(`${label} must be an array.`)
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined
}

function formulaExpression(input: unknown, depth = 0): FormulaExpression {
  if (depth > 32) throw new QueryValidationError('Formula nesting exceeds 32 levels.', 'invalid_formula')
  const node = record(input)
  switch (node.expression) {
    case 'field':
      if (typeof node.field !== 'string') throw new QueryValidationError('Formula field expressions require a field key.', 'invalid_formula')
      return { expression: 'field', field: node.field }
    case 'literal':
      if (!['string', 'number', 'boolean'].includes(typeof node.value) && node.value !== null) throw new QueryValidationError('Formula literals must be strings, numbers, booleans, or null.', 'invalid_formula')
      return { expression: 'literal', value: node.value as string | number | boolean | null }
    case 'arithmetic':
      if (!['+', '-', '*', '/'].includes(String(node.operator))) throw new QueryValidationError('Formula arithmetic uses an unknown operator.', 'invalid_formula')
      return { expression: 'arithmetic', operator: node.operator as '+' | '-' | '*' | '/', left: formulaExpression(node.left, depth + 1), right: formulaExpression(node.right, depth + 1) }
    case 'compare':
      if (!['=', '!=', '<', '<=', '>', '>='].includes(String(node.operator))) throw new QueryValidationError('Formula comparison uses an unknown operator.', 'invalid_formula')
      return { expression: 'compare', operator: node.operator as '=' | '!=' | '<' | '<=' | '>' | '>=', left: formulaExpression(node.left, depth + 1), right: formulaExpression(node.right, depth + 1) }
    case 'null':
      return { expression: 'null', argument: formulaExpression(node.argument, depth + 1), negated: node.negated === true || undefined }
    case 'logic': {
      if (node.operator !== 'and' && node.operator !== 'or' && node.operator !== 'not') throw new QueryValidationError('Formula logic uses an unknown operator.', 'invalid_formula')
      const args = optionalArray(node.arguments, 'Formula logic arguments').map((argument) => formulaExpression(argument, depth + 1))
      if ((node.operator === 'not' && args.length !== 1) || (node.operator !== 'not' && args.length < 2)) throw new QueryValidationError('Formula logic has the wrong number of arguments.', 'invalid_formula')
      return { expression: 'logic', operator: node.operator, arguments: args }
    }
    case 'case': {
      const branches = optionalArray(node.branches, 'Formula case branches').map((raw) => {
        const branch = record(raw)
        return { when: formulaExpression(branch.when, depth + 1), then: formulaExpression(branch.then, depth + 1) }
      })
      if (!branches.length) throw new QueryValidationError('Formula case expressions require at least one branch.', 'invalid_formula')
      return { expression: 'case', branches, otherwise: node.otherwise == null ? undefined : formulaExpression(node.otherwise, depth + 1) }
    }
    case 'call':
      if (typeof node.fn !== 'string' || !node.fn) throw new QueryValidationError('Formula calls require a function.', 'invalid_formula')
      return { expression: 'call', fn: node.fn, arguments: optionalArray(node.arguments, 'Formula call arguments').map((argument) => formulaExpression(argument, depth + 1)) }
    case 'aggregate':
      if (typeof node.fn !== 'string' || !AGGREGATES.has(node.fn)) throw new QueryValidationError('Formula aggregates use an unknown function.', 'invalid_formula')
      return { expression: 'aggregate', fn: node.fn as AggregateFunction, argument: node.argument == null ? undefined : formulaExpression(node.argument, depth + 1) }
    default:
      throw new QueryValidationError(`Unknown formula expression "${String(node.expression)}".`, 'invalid_formula')
  }
}

/** Validates persisted or request JSON before it reaches the SQL compiler. */
export function validateQuery(input: unknown, catalog: AnalyticsCatalog): InsightQuery {
  const query = record(input)
  if (typeof query.source !== 'string') throw new QueryValidationError('query.source is required.')
  const source = sourceFromCatalog(catalog, query.source)
  if (!source) throw new QueryValidationError(`Unknown source "${query.source}".`, 'unknown_source', query.source)

  const measures: QueryMeasure[] = optionalArray(query.measures, 'query.measures').map((raw) => {
    const measure = record(raw)
    if (measure.kind === 'formula') {
      if (typeof measure.alias !== 'string' || !measure.alias) throw new QueryValidationError('Formula measures require an alias.', 'invalid_formula')
      return { kind: 'formula', alias: measure.alias, label: optionalString(measure.label), formula: formulaExpression(measure.formula) }
    }
    if (typeof measure.fn !== 'string' || !AGGREGATES.has(measure.fn)) throw new QueryValidationError(`Unknown aggregate "${String(measure.fn)}".`, 'invalid_measure', String(measure.fn))
    const fieldKey = optionalString(measure.field)
    if (measure.fn !== 'count') {
      if (!fieldKey) throw new QueryValidationError(`The ${measure.fn} measure requires a field.`, 'invalid_measure', measure.fn)
      const field = fieldFromSource(source, fieldKey)
      if (!field) throw new QueryValidationError(`Unknown measure field "${fieldKey}".`, 'unknown_field', fieldKey)
      if (measure.fn !== 'count_distinct' && !canMeasure(field)) throw new QueryValidationError(`"${field.label}" cannot be measured.`, 'invalid_measure', field.key)
    }
    return { fn: measure.fn as Exclude<QueryMeasure, { kind: 'formula' }>['fn'], field: fieldKey, alias: optionalString(measure.alias), label: optionalString(measure.label) }
  })

  const dimensions: QueryDimension[] = optionalArray(query.dimensions, 'query.dimensions').map((raw) => {
    const dimension = record(raw)
    if (typeof dimension.field !== 'string') throw new QueryValidationError('Every dimension requires a field.', 'invalid_dimension')
    const field = fieldFromSource(source, dimension.field)
    if (!field) throw new QueryValidationError(`Unknown dimension "${dimension.field}".`, 'unknown_field', dimension.field)
    if (!canDimension(field)) throw new QueryValidationError(`"${field.label}" cannot be grouped.`, 'invalid_dimension', field.key)
    const bin = dimension.bin
    if (bin != null && (typeof bin !== 'string' || !DATE_BINS.has(bin as DateBin) || !canBin(field))) throw new QueryValidationError(`"${field.label}" cannot use the requested date bin.`, 'invalid_dimension', field.key)
    return { field: dimension.field, bin: bin as DateBin | undefined, alias: optionalString(dimension.alias) }
  })

  const filters: QueryFilter[] = optionalArray(query.filters, 'query.filters').map((raw) => {
    const filter = record(raw)
    if (typeof filter.field !== 'string') throw new QueryValidationError('Every filter requires a field.', 'invalid_filter')
    const field = fieldFromSource(source, filter.field)
    if (!field) throw new QueryValidationError(`Unknown filter field "${filter.field}".`, 'unknown_field', filter.field)
    if (typeof filter.operator !== 'string' || !filterOperatorsForField(field).includes(filter.operator as FilterOperator)) throw new QueryValidationError(`The ${String(filter.operator)} filter is not valid for "${field.label}".`, 'invalid_filter', field.key)
    return { field: filter.field, operator: filter.operator as FilterOperator, value: filter.value as QueryFilter['value'] }
  })

  const sort: QuerySort[] = optionalArray(query.sort, 'query.sort').map((raw) => {
    const item = record(raw)
    if (typeof item.ref !== 'string') throw new QueryValidationError('sort.ref must be a string.', 'invalid_sort')
    if (item.direction !== 'asc' && item.direction !== 'desc') throw new QueryValidationError('sort.direction must be asc or desc.', 'invalid_sort', item.ref)
    return { ref: item.ref, direction: item.direction }
  })

  if (query.limit != null && (typeof query.limit !== 'number' || !Number.isFinite(query.limit))) throw new QueryValidationError('query.limit must be a finite number or null.', 'invalid_limit')
  return { source: source.key, measures, dimensions, filters, sort, limit: query.limit as number | null | undefined }
}
