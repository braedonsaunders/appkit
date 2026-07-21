import type { ReportColumnKind, ReportEntity, ReportEntityColumn } from './entities'

export const CUSTOM_REPORT_COLUMN_PREFIX = 'cf_'
const KEY_RE = /^[a-z][a-z0-9_]{0,62}$/
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i

export type CustomReportFieldDefinition = {
  key: string
  label: string
  fieldType: string
}

export type CustomReportFieldSource = {
  list(entity: ReportEntity): Promise<readonly CustomReportFieldDefinition[]>
}

function customColumnKind(fieldType: string): ReportColumnKind {
  if (fieldType === 'number') return 'number'
  if (fieldType === 'date') return 'date'
  if (fieldType === 'datetime') return 'timestamp'
  return 'text'
}

function metadataExpression(table: string, key: string, fieldType: string): string {
  const text = `"${table}"."metadata"->'custom'->>'${key}'`
  if (fieldType === 'number') return `(${text})::numeric`
  if (fieldType === 'date') return `(${text})::date`
  if (fieldType === 'datetime') return `(${text})::timestamptz`
  if (fieldType === 'multi_select') return `(SELECT string_agg(value, ', ') FROM jsonb_array_elements_text(coalesce("${table}"."metadata"->'custom'->'${key}', '[]'::jsonb)) AS value)`
  return `(${text})`
}

/** Converts active custom-field definitions into safe synthetic report columns. */
export function buildCustomReportColumns(table: string, definitions: readonly CustomReportFieldDefinition[]): ReportEntityColumn[] {
  if (!IDENT_RE.test(table)) throw new Error('Custom report columns require a plain allowlisted table identifier')
  return definitions.filter((definition) => KEY_RE.test(definition.key)).map((definition) => ({
    key: `${CUSTOM_REPORT_COLUMN_PREFIX}${definition.key}`,
    label: definition.label,
    kind: customColumnKind(definition.fieldType),
    expression: metadataExpression(table, definition.key, definition.fieldType),
  }))
}

export async function augmentReportEntityWithCustomFields(entity: ReportEntity, source: CustomReportFieldSource): Promise<ReportEntity> {
  if (!IDENT_RE.test(entity.from)) return entity
  const columns = buildCustomReportColumns(entity.from, await source.list(entity))
  const existing = new Set(entity.columns.map((column) => column.key))
  const added = columns.filter((column) => !existing.has(column.key))
  return added.length ? { ...entity, columns: [...entity.columns, ...added] } : entity
}

export async function augmentReportCatalogWithCustomFields(entities: readonly ReportEntity[], source: CustomReportFieldSource): Promise<ReportEntity[]> {
  return Promise.all(entities.map((entity) => augmentReportEntityWithCustomFields(entity, source)))
}
