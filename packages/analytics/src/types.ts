export type SemanticType = 'text' | 'category' | 'number' | 'currency' | 'date' | 'boolean'
export type AggregateFunction = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max'
export type DateBin = 'day' | 'week' | 'month' | 'quarter' | 'year'
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'is_null'
  | 'is_not_null'
  | 'last_n_days'
  | 'this_month'
  | 'this_quarter'
  | 'this_year'
  | 'ytd'

export const FILTER_OPERATORS: readonly FilterOperator[] = [
  'eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'contains',
  'is_null', 'is_not_null', 'last_n_days', 'this_month', 'this_quarter', 'this_year', 'ytd',
]

export type AnalyticsField = {
  key: string
  label: string
  /** Authored SQL expression. Never accepts caller input. */
  expression: string
  semanticType: SemanticType
  description?: string
  enumOptions?: { value: string; label: string }[]
  canDimension?: boolean
  canMeasure?: boolean
  canBin?: boolean
}

export type AnalyticsSource = {
  key: string
  label: string
  description?: string
  /** Authored FROM expression and tenant column; both are application code. */
  from: string
  tenantColumn: string
  fields: AnalyticsField[]
  detailColumns: string[]
  defaultSort?: { field: string; direction: 'asc' | 'desc' }
}

export type AnalyticsCatalog = { sources: AnalyticsSource[] }

export type QueryFilter = {
  field: string
  operator: FilterOperator
  value?: string | number | boolean | Array<string | number> | null
}

export type QueryDimension = { field: string; bin?: DateBin; alias?: string }

export type QueryAggregateMeasure = {
  kind?: 'aggregate'
  field?: string
  fn: AggregateFunction
  alias?: string
  label?: string
}

export type FormulaExpression =
  | { expression: 'field'; field: string }
  | { expression: 'literal'; value: string | number | boolean | null }
  | { expression: 'arithmetic'; operator: '+' | '-' | '*' | '/'; left: FormulaExpression; right: FormulaExpression }
  | { expression: 'compare'; operator: '=' | '!=' | '<' | '<=' | '>' | '>='; left: FormulaExpression; right: FormulaExpression }
  | { expression: 'null'; argument: FormulaExpression; negated?: boolean }
  | { expression: 'logic'; operator: 'and' | 'or' | 'not'; arguments: FormulaExpression[] }
  | { expression: 'case'; branches: { when: FormulaExpression; then: FormulaExpression }[]; otherwise?: FormulaExpression }
  | { expression: 'call'; fn: string; arguments: FormulaExpression[] }
  | { expression: 'aggregate'; fn: AggregateFunction; argument?: FormulaExpression }

export type QueryFormulaMeasure = {
  kind: 'formula'
  alias: string
  label?: string
  formula: FormulaExpression
}

export type QueryMeasure = QueryAggregateMeasure | QueryFormulaMeasure
export type QuerySort = { ref: string; direction: 'asc' | 'desc' }

export type InsightQuery = {
  source: string
  measures?: QueryMeasure[]
  dimensions?: QueryDimension[]
  filters?: QueryFilter[]
  sort?: QuerySort[]
  limit?: number | null
}

export type ResultColumn = {
  key: string
  label: string
  semanticType: SemanticType
  role: 'dimension' | 'measure'
}

export type QueryResult = {
  columns: ResultColumn[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  durationMs: number
}

export type CompiledQuery = { sql: string; params: unknown[]; columns: ResultColumn[]; limit: number }

export type VisualizationKey =
  | 'scalar' | 'progress' | 'table' | 'bar' | 'row' | 'line' | 'area' | 'pie' | 'donut' | 'gauge'
export type VisualizationSettings = Record<string, string | number | boolean | string[] | undefined>
