/**
 * Application-supplied record catalogue boundary.
 *
 * Stored layouts and views refer to stable string keys. AppKit owns the
 * complete registry behavior, but not a consuming application's records,
 * labels, tables, routes, or lifecycle actions.
 */

import type {
  FieldMeta,
  FilterOperator,
  ListColumnMeta,
  ListFilterKind,
  ListFilterMeta,
  RecordTypeMeta,
} from './types'

/** Operators available for each filter kind. */
export const OPERATORS_BY_KIND: Record<ListFilterKind, readonly FilterOperator[]> = {
  select: ['eq', 'ne', 'in', 'not_in'],
  multi_select: ['in', 'not_in', 'is_set', 'is_not_set'],
  entity_ref: ['eq', 'ne'],
  date: ['eq', 'gte', 'lte', 'between'],
  boolean: ['eq'],
  text: ['eq', 'contains', 'is_set', 'is_not_set'],
}

export interface CustomFieldTarget {
  table: string | null
  kind: string | undefined
  lineTable: string | null
  lineKind: string | undefined
}

export interface CustomizationRegistry {
  readonly recordTypes: readonly RecordTypeMeta[]
  getRecordType(key: string): RecordTypeMeta | undefined
  isBuiltInField(recordType: string, key: string): boolean
  isBuiltInColumn(recordType: string, key: string): boolean
  isBuiltInFilter(recordType: string, key: string): boolean
  headerFieldMeta(recordType: string, key: string): FieldMeta | undefined
  lineFieldMeta(recordType: string, key: string): FieldMeta | undefined
  fieldMetaFor(recordType: string, key: string): FieldMeta | undefined
  listColumnMeta(recordType: string, key: string): ListColumnMeta | undefined
  listFilterMeta(recordType: string, key: string): ListFilterMeta | undefined
  customFieldTargetFor(recordType: string): CustomFieldTarget
}

/**
 * Bind the extracted customization engine to one application's catalogue.
 * Duplicate stable keys are rejected immediately instead of becoming
 * ambiguous persisted configuration later.
 */
export function createCustomizationRegistry(
  recordTypes: readonly RecordTypeMeta[],
): CustomizationRegistry {
  const records = recordTypes.map(cloneRecordType)
  const byKey = new Map<string, RecordTypeMeta>()

  for (const record of records) {
    assertUniqueKey(byKey, record.key, 'record type')
    assertUniqueMembers(record.headerFields, `${record.key} header field`)
    assertUniqueMembers(record.lineFields, `${record.key} line field`)
    assertUniqueMembers(record.listColumns, `${record.key} list column`)
    assertUniqueMembers(record.listFilters, `${record.key} list filter`)
    assertUniqueMembers(record.formActions ?? [], `${record.key} form action`)
    byKey.set(record.key, record)
  }

  const getRecordType = (key: string) => byKey.get(key)
  const registry: CustomizationRegistry = {
    recordTypes: Object.freeze(records),
    getRecordType,
    isBuiltInField(recordType, key) {
      const meta = getRecordType(recordType)
      return Boolean(meta?.headerFields.some((field) => field.key === key)
        || meta?.lineFields.some((field) => field.key === key))
    },
    isBuiltInColumn(recordType, key) {
      return Boolean(getRecordType(recordType)?.listColumns.some((column) => column.key === key))
    },
    isBuiltInFilter(recordType, key) {
      return Boolean(getRecordType(recordType)?.listFilters.some((filter) => filter.key === key))
    },
    headerFieldMeta(recordType, key) {
      return getRecordType(recordType)?.headerFields.find((field) => field.key === key)
    },
    lineFieldMeta(recordType, key) {
      return getRecordType(recordType)?.lineFields.find((field) => field.key === key)
    },
    fieldMetaFor(recordType, key) {
      const meta = getRecordType(recordType)
      return meta?.headerFields.find((field) => field.key === key)
        ?? meta?.lineFields.find((field) => field.key === key)
    },
    listColumnMeta(recordType, key) {
      return getRecordType(recordType)?.listColumns.find((column) => column.key === key)
    },
    listFilterMeta(recordType, key) {
      return getRecordType(recordType)?.listFilters.find((filter) => filter.key === key)
    },
    customFieldTargetFor(recordType) {
      const meta = getRecordType(recordType)
      if (!meta) return { table: null, kind: undefined, lineTable: null, lineKind: undefined }
      return {
        table: meta.customFieldTable ?? null,
        kind: meta.customFieldKind ?? undefined,
        lineTable: meta.customFieldLineTable ?? null,
        lineKind: meta.customFieldLineKind ?? undefined,
      }
    },
  }
  return Object.freeze(registry)
}

/** Is `key` a custom-field reference (`cf_<defKey>`)? */
export function isCustomFieldKey(key: string): boolean {
  return key.startsWith('cf_') && key.length > 3
}

/** The custom field definition key portion of a `cf_<key>` reference. */
export function customFieldDefKey(key: string): string {
  return isCustomFieldKey(key) ? key.slice(3) : key
}

function assertUniqueKey<T>(map: Map<string, T>, key: string, label: string): void {
  if (!key.trim()) throw new Error(`${label} key is required`)
  if (map.has(key)) throw new Error(`duplicate ${label} key: ${key}`)
}

function assertUniqueMembers(items: readonly { key: string }[], label: string): void {
  const seen = new Map<string, true>()
  for (const item of items) {
    assertUniqueKey(seen, item.key, label)
    seen.set(item.key, true)
  }
}

function cloneRecordType(record: RecordTypeMeta): RecordTypeMeta {
  return structuredClone(record)
}
