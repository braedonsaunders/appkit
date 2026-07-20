export type FieldLevel = 'header' | 'line'
export type FieldKind = 'text' | 'textarea' | 'number' | 'currency' | 'percentage' | 'boolean' | 'date' | 'datetime' | 'select' | 'multi_select' | 'reference' | 'email' | 'phone' | 'url'
export type FilterOperator = 'eq' | 'neq' | 'contains' | 'starts_with' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_empty' | 'is_not_empty'

export type FieldMeta = { key: string; label: string; kind: FieldKind; level: FieldLevel; required?: boolean; readOnly?: boolean; description?: string; options?: { value: string; label: string }[]; width?: 1 | 2 | 3 | 4 | 6 | 12 }
export type ListColumnMeta = { key: string; label: string; kind: 'text' | 'number' | 'amount' | 'date' | 'datetime' | 'status' | 'reference' | 'custom'; sortable?: boolean; defaultVisible?: boolean; width?: number }
export type ListFilterMeta = { key: string; label: string; kind: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select'; operators: FilterOperator[]; options?: { value: string; label: string }[] }
export type RecordTypeMeta = { key: string; label: string; pluralLabel: string; description?: string; headerFields: FieldMeta[]; lineFields?: FieldMeta[]; columns: ListColumnMeta[]; filters: ListFilterMeta[]; defaultSort?: { key: string; direction: 'asc' | 'desc' }; actions?: { key: string; label: string }[] }

export type HeaderFieldPlacement = { field: string; span?: 1 | 2 | 3 | 4 | 6 | 12; hidden?: boolean }
export type HeaderGroup = { id: string; label: string; columns?: 1 | 2 | 3 | 4; fields: HeaderFieldPlacement[] }
export type LineColumnPlacement = { field: string; width?: number; hidden?: boolean }
export type FormActionPlacement = { action: string; hidden?: boolean }
export type FormLayoutConfig = { schemaVersion: 1; recordType: string; groups: HeaderGroup[]; lineColumns?: LineColumnPlacement[]; actions?: FormActionPlacement[] }

export type FilterClause = { field: string; operator: FilterOperator; value?: unknown }
export type ListColumnPlacement = { column: string; width?: number; hidden?: boolean }
export type ListViewConfig = { schemaVersion: 1; recordType: string; columns: ListColumnPlacement[]; filters?: FilterClause[]; sort?: { column: string; direction: 'asc' | 'desc' }; perPage?: number }
export type LintIssue = { path: string; code: string; message: string; severity: 'error' | 'warning' }
export type CustomFieldDefinition = { key: string; label: string; recordType: string; level: FieldLevel; kind: FieldKind; required?: boolean; active?: boolean; options?: { value: string; label: string }[]; description?: string }
