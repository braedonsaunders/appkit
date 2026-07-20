import type { CustomizationRegistry } from './registry'
import type { FormLayoutConfig, LintIssue, ListViewConfig, RecordTypeMeta } from './types'

export function defaultFormLayout(recordType: string, registry: CustomizationRegistry): FormLayoutConfig {
  const meta = requiredRecordType(recordType, registry)
  return { schemaVersion: 1, recordType, groups: [{ id: 'details', label: 'Details', columns: 2, fields: meta.headerFields.map((field) => ({ field: field.key, span: field.width ?? 6 })) }], lineColumns: (meta.lineFields ?? []).map((field) => ({ field: field.key })), actions: (meta.actions ?? []).map((action) => ({ action: action.key })) }
}

export function defaultListView(recordType: string, registry: CustomizationRegistry): ListViewConfig {
  const meta = requiredRecordType(recordType, registry)
  const columns = meta.columns.filter((column) => column.defaultVisible !== false).map((column) => ({ column: column.key, width: column.width }))
  return { schemaVersion: 1, recordType, columns: columns.length ? columns : meta.columns.slice(0, 6).map((column) => ({ column: column.key })), sort: meta.defaultSort ? { column: meta.defaultSort.key, direction: meta.defaultSort.direction } : undefined, perPage: 25 }
}

export function lintFormLayout(layout: FormLayoutConfig, registry: CustomizationRegistry): LintIssue[] {
  const meta = registry.get(layout.recordType)
  if (!meta) return [issue('recordType', 'unknown_record_type', 'The form references an unknown record type')]
  const fields = new Set([...meta.headerFields, ...(meta.lineFields ?? [])].map((field) => field.key))
  const seen = new Set<string>()
  const issues: LintIssue[] = []
  if (!layout.groups.length) issues.push(issue('groups', 'empty_layout', 'The form requires at least one field group'))
  layout.groups.forEach((group, groupIndex) => {
    if (!group.id.trim() || !group.label.trim()) issues.push(issue(`groups.${groupIndex}`, 'invalid_group', 'Groups require an id and label'))
    group.fields.forEach((placement, fieldIndex) => {
      const path = `groups.${groupIndex}.fields.${fieldIndex}`
      if (!fields.has(placement.field)) issues.push(issue(path, 'unknown_field', `Unknown field: ${placement.field}`))
      if (seen.has(placement.field)) issues.push(issue(path, 'duplicate_field', `Field is placed more than once: ${placement.field}`, 'warning'))
      seen.add(placement.field)
    })
  })
  for (const field of meta.headerFields.filter((field) => field.required)) if (!seen.has(field.key)) issues.push(issue('groups', 'missing_required_field', `Required field is not placed: ${field.label}`))
  for (const [index, placement] of (layout.lineColumns ?? []).entries()) if (!fields.has(placement.field)) issues.push(issue(`lineColumns.${index}`, 'unknown_field', `Unknown line field: ${placement.field}`))
  return issues
}

export function lintListView(view: ListViewConfig, registry: CustomizationRegistry): LintIssue[] {
  const meta = registry.get(view.recordType)
  if (!meta) return [issue('recordType', 'unknown_record_type', 'The list references an unknown record type')]
  const columns = new Set(meta.columns.map((column) => column.key))
  const filters = new Map(meta.filters.map((filter) => [filter.key, filter]))
  const issues: LintIssue[] = []
  const seen = new Set<string>()
  if (!view.columns.length || view.columns.every((column) => column.hidden)) issues.push(issue('columns', 'no_visible_columns', 'The list requires a visible column'))
  view.columns.forEach((column, index) => { if (!columns.has(column.column)) issues.push(issue(`columns.${index}`, 'unknown_column', `Unknown column: ${column.column}`)); if (seen.has(column.column)) issues.push(issue(`columns.${index}`, 'duplicate_column', `Column is placed more than once: ${column.column}`, 'warning')); seen.add(column.column) })
  view.filters?.forEach((clause, index) => { const filter = filters.get(clause.field); if (!filter) issues.push(issue(`filters.${index}`, 'unknown_filter', `Unknown filter: ${clause.field}`)); else if (!filter.operators.includes(clause.operator)) issues.push(issue(`filters.${index}.operator`, 'invalid_operator', `Operator ${clause.operator} is not valid for ${filter.label}`)) })
  if (view.sort && !columns.has(view.sort.column)) issues.push(issue('sort.column', 'unknown_sort', `Unknown sort column: ${view.sort.column}`))
  if (view.perPage !== undefined && (!Number.isInteger(view.perPage) || view.perPage < 5 || view.perPage > 200)) issues.push(issue('perPage', 'invalid_page_size', 'Page size must be between 5 and 200'))
  return issues
}

export function refreshFormLayout(layout: FormLayoutConfig, registry: CustomizationRegistry): FormLayoutConfig {
  const defaults = defaultFormLayout(layout.recordType, registry)
  const placed = new Set(layout.groups.flatMap((group) => group.fields.map((field) => field.field)))
  const missing = defaults.groups[0]!.fields.filter((field) => !placed.has(field.field))
  if (!missing.length) return structuredClone(layout)
  const groups = structuredClone(layout.groups)
  groups[0] = { ...groups[0]!, fields: [...groups[0]!.fields, ...missing] }
  return { ...structuredClone(layout), groups }
}

function requiredRecordType(key: string, registry: CustomizationRegistry): RecordTypeMeta { const meta = registry.get(key); if (!meta) throw new Error(`Unknown record type: ${key}`); return meta }
function issue(path: string, code: string, message: string, severity: LintIssue['severity'] = 'error'): LintIssue { return { path, code, message, severity } }
