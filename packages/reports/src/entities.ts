export type ReportColumnKind = 'text' | 'number' | 'date' | 'timestamp' | 'boolean' | 'enum' | 'uuid'

export type ReportEntityColumn = {
  key: string
  label: string
  kind: ReportColumnKind
  /** Application-authored SQL expression. */
  expression?: string
  /** Source-compatible expression key used by the production catalogues. */
  expr?: string
  /** Physical column override for schema-discovered catalogues. */
  sql?: string
  /** Synthetic JSON/array columns are omitted from printable documents. */
  arrayUnnest?: 'array' | 'jsonb'
  description?: string
  enumOptions?: { value: string; label: string }[]
  /** Source-compatible raw enum values. */
  options?: readonly string[]
}

export type ReportEntity = {
  key: string
  label: string
  category: string
  description?: string
  /** Application-authored FROM clause, or a physical RLS-scoped table. */
  from?: string
  table?: string
  tenantColumn?: string
  /** Source-compatible organization scope expression. */
  orgColumn?: string
  columns: ReportEntityColumn[]
  defaultColumns?: string[]
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
  const column = reportColumn(entity, key)
  if (!column) return null
  if (column.expression) return column.expression
  if (column.expr) return column.expr
  if (entity.table && IDENTIFIER.test(entity.table)) return `"${entity.table}"."${column.sql ?? column.key}"`
  return null
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i

export function reportEntityFrom(entity: ReportEntity): string {
  if (entity.from) return entity.from
  if (entity.table && IDENTIFIER.test(entity.table)) return `"${entity.table}"`
  throw new Error(`Report entity "${entity.key}" does not define a safe source`)
}

export function reportTenantColumn(entity: ReportEntity): string {
  if (entity.tenantColumn) return entity.tenantColumn
  if (entity.orgColumn) return entity.orgColumn
  if (entity.table && IDENTIFIER.test(entity.table)) return `"${entity.table}"."tenant_id"`
  throw new Error(`Report entity "${entity.key}" does not define a tenant scope`)
}

export function defaultColumnsFor(entity: ReportEntity, limit = 7): string[] {
  if (entity.defaultColumns?.length) return entity.defaultColumns.filter((key) => Boolean(reportColumn(entity, key)))
  const operational = entity.columns.filter((column) => column.kind !== 'uuid' && column.key !== 'id' && column.key !== 'tenant_id' && column.key !== 'deleted_at')
  return (operational.length ? operational : entity.columns).slice(0, limit).map((column) => column.key)
}

export function reportColumnOptions(column: ReportEntityColumn): { value: string; label: string }[] {
  if (column.enumOptions?.length) return column.enumOptions
  return (column.options ?? []).map((value) => ({ value, label: value.replaceAll('_', ' ') }))
}
