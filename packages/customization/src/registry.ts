import type { CustomFieldDefinition, FieldMeta, ListColumnMeta, ListFilterMeta, RecordTypeMeta } from './types'

export type CustomizationRegistry = ReturnType<typeof createCustomizationRegistry>

export function createCustomizationRegistry(recordTypes: readonly RecordTypeMeta[]) {
  const byKey = new Map<string, RecordTypeMeta>()
  for (const recordType of recordTypes) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(recordType.key)) throw new Error(`Invalid record type key: ${recordType.key}`)
    if (byKey.has(recordType.key)) throw new Error(`Duplicate record type key: ${recordType.key}`)
    assertUnique(recordType.headerFields.map((field) => field.key), `${recordType.key} header field`)
    assertUnique((recordType.lineFields ?? []).map((field) => field.key), `${recordType.key} line field`)
    assertUnique(recordType.columns.map((column) => column.key), `${recordType.key} column`)
    assertUnique(recordType.filters.map((filter) => filter.key), `${recordType.key} filter`)
    byKey.set(recordType.key, structuredClone(recordType))
  }
  return {
    list: (): RecordTypeMeta[] => [...byKey.values()].map((item) => structuredClone(item)),
    get: (key: string): RecordTypeMeta | undefined => { const item = byKey.get(key); return item ? structuredClone(item) : undefined },
    field: (recordType: string, key: string): FieldMeta | undefined => { const item = byKey.get(recordType); return [...(item?.headerFields ?? []), ...(item?.lineFields ?? [])].find((field) => field.key === key) },
    column: (recordType: string, key: string): ListColumnMeta | undefined => byKey.get(recordType)?.columns.find((column) => column.key === key),
    filter: (recordType: string, key: string): ListFilterMeta | undefined => byKey.get(recordType)?.filters.find((filter) => filter.key === key),
  }
}

export function validateCustomField(definition: CustomFieldDefinition, registry: CustomizationRegistry): string[] {
  const errors: string[] = []
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(definition.key)) errors.push('Field key must be a lowercase identifier')
  if (!definition.label.trim() || definition.label.length > 120) errors.push('Field label is required and must not exceed 120 characters')
  const recordType = registry.get(definition.recordType)
  if (!recordType) errors.push('Unknown record type')
  if (registry.field(definition.recordType, definition.key)) errors.push('Field key conflicts with a built-in field')
  if ((definition.kind === 'select' || definition.kind === 'multi_select') && !definition.options?.length) errors.push('Select fields require options')
  if (definition.options) {
    const values = definition.options.map((option) => option.value)
    if (new Set(values).size !== values.length) errors.push('Option values must be unique')
  }
  return errors
}

export function extendRecordType(recordType: RecordTypeMeta, customFields: readonly CustomFieldDefinition[]): RecordTypeMeta {
  const active = customFields.filter((field) => field.recordType === recordType.key && field.active !== false)
  const toField = (field: CustomFieldDefinition): FieldMeta => ({ key: `custom.${field.key}`, label: field.label, level: field.level, kind: field.kind, required: field.required, description: field.description, options: field.options })
  const customColumns: ListColumnMeta[] = active.map((field) => ({ key: `custom.${field.key}`, label: field.label, kind: field.kind === 'number' || field.kind === 'currency' || field.kind === 'percentage' ? 'number' : field.kind === 'date' ? 'date' : 'custom', sortable: true, defaultVisible: false }))
  const customFilters: ListFilterMeta[] = active.map((field) => ({ key: `custom.${field.key}`, label: field.label, kind: field.kind === 'select' ? 'select' : field.kind === 'multi_select' ? 'multi_select' : field.kind === 'boolean' ? 'boolean' : field.kind === 'date' ? 'date' : field.kind === 'number' || field.kind === 'currency' || field.kind === 'percentage' ? 'number' : 'text', operators: operatorsFor(field.kind), options: field.options }))
  return { ...structuredClone(recordType), headerFields: [...recordType.headerFields, ...active.filter((field) => field.level === 'header').map(toField)], lineFields: [...(recordType.lineFields ?? []), ...active.filter((field) => field.level === 'line').map(toField)], columns: [...recordType.columns, ...customColumns], filters: [...recordType.filters, ...customFilters] }
}

function operatorsFor(kind: CustomFieldDefinition['kind']): ListFilterMeta['operators'] { if (kind === 'boolean') return ['eq']; if (kind === 'number' || kind === 'currency' || kind === 'percentage' || kind === 'date' || kind === 'datetime') return ['eq','neq','gt','gte','lt','lte','is_empty','is_not_empty']; if (kind === 'select' || kind === 'multi_select') return ['in','not_in','is_empty','is_not_empty']; return ['eq','neq','contains','starts_with','is_empty','is_not_empty'] }
function assertUnique(values: string[], label: string) { const seen = new Set<string>(); for (const value of values) { if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`); seen.add(value) } }
