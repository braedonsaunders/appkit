export type ReportColumnKind = 'text' | 'number' | 'date' | 'timestamp' | 'boolean' | 'enum' | 'uuid'

export type ReportEntityColumn = {
  key: string
  label: string
  kind: ReportColumnKind
  /** Application-authored SQL expression. */
  expression: string
  /** Physical column override for schema-discovered catalogues. */
  sql?: string
  /** Synthetic JSON/array columns are omitted from printable documents. */
  arrayUnnest?: 'array' | 'jsonb'
  description?: string
  enumOptions?: { value: string; label: string }[]
}

export type ReportEntity = {
  key: string
  label: string
  category: string
  description?: string
  /** Application-authored FROM clause and tenant column. */
  from: string
  tenantColumn: string
  columns: ReportEntityColumn[]
  defaultColumns: string[]
  defaultSort?: { column: string; direction: 'asc' | 'desc' }
  softDelete?: boolean
  /** Explicit authored predicate when `from` is not a plain table. */
  softDeleteExpression?: string
  /** Implicit permission/scope filter applied to every custom query. */
  baseFilter?: import('./filters').ReportRuleGroup
  relations?: { via: string; target: string; foreignColumn: string; label: string }[]
}

export type ReportEntityCatalog = { entities: ReportEntity[] }

export function reportEntity(catalog: ReportEntityCatalog, key: string): ReportEntity | null {
  return catalog.entities.find((entity) => entity.key === key) ?? null
}

export function reportColumn(entity: ReportEntity, key: string): ReportEntityColumn | null {
  return entity.columns.find((column) => column.key === key) ?? null
}

export function reportColumnExpression(entity: ReportEntity, key: string): string | null {
  return reportColumn(entity, key)?.expression ?? null
}
