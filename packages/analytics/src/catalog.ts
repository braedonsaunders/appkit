import type { AnalyticsCatalog, AnalyticsField, AnalyticsSource, FilterOperator } from './types'

export function sourceFromCatalog(catalog: AnalyticsCatalog, key: string): AnalyticsSource | null {
  return catalog.sources.find((source) => source.key === key) ?? null
}

export function fieldFromSource(source: AnalyticsSource, key: string): AnalyticsField | null {
  return source.fields.find((field) => field.key === key) ?? null
}

export function canDimension(field: AnalyticsField): boolean {
  return field.canDimension ?? (field.semanticType !== 'number' && field.semanticType !== 'currency')
}

export function canMeasure(field: AnalyticsField): boolean {
  return field.canMeasure ?? (field.semanticType === 'number' || field.semanticType === 'currency')
}

export function canBin(field: AnalyticsField): boolean {
  return field.canBin ?? field.semanticType === 'date'
}

const NULL_OPERATORS: FilterOperator[] = ['is_null', 'is_not_null']
export function filterOperatorsForField(field: AnalyticsField): FilterOperator[] {
  switch (field.semanticType) {
    case 'text': case 'category': return ['eq', 'neq', 'in', 'not_in', 'contains', ...NULL_OPERATORS]
    case 'number': case 'currency': return ['eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', ...NULL_OPERATORS]
    case 'date': return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'last_n_days', 'this_month', 'this_quarter', 'this_year', 'ytd', ...NULL_OPERATORS]
    case 'boolean': return ['eq', 'neq', ...NULL_OPERATORS]
  }
}
