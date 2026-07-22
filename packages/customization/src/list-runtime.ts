import type {
  FilterClause,
  ListColumnKind,
  ListColumnMeta,
  ListViewConfig,
  RecordTypeMeta,
} from './types'
import { parseListView } from './schema'

export interface SavedListView {
  id: string
  recordType: string
  name: string
  scope: 'organization' | 'user'
  ownerId?: string | null
  isDefault: boolean
  isActive: boolean
  config: ListViewConfig
}

export interface ListViewStore {
  list(recordType: string, userId: string): Promise<SavedListView[]>
  preferred(recordType: string, userId: string): Promise<string | null>
  setPreferred?(recordType: string, userId: string, viewId: string | null): Promise<void>
}

export interface ListViewActor {
  userId: string
  canManageOrganizationViews?: boolean
}

export interface SaveListViewInput {
  id?: string
  recordType: string
  name: string
  scope: SavedListView['scope']
  isDefault?: boolean
  isActive?: boolean
  config: ListViewConfig
  actor: ListViewActor
}

/** Complete saved-view persistence contract used by the extracted designers. */
export interface MutableListViewStore extends ListViewStore {
  save(input: SaveListViewInput): Promise<SavedListView>
  remove(id: string, actor: ListViewActor): Promise<void>
}

export function normalizeSavedListViewInput(input: SaveListViewInput): Omit<SavedListView, 'id'> {
  const name = input.name.trim()
  if (!name) throw new Error('A view name is required')
  if (input.config.recordType !== input.recordType) throw new Error('View config record type does not match')
  const parsed = parseListView(input.config)
  if (!parsed.success || !parsed.data) {
    throw new Error(`Invalid view config: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`)
  }
  return {
    recordType: input.recordType,
    name,
    scope: input.scope,
    ownerId: input.scope === 'user' ? input.actor.userId : null,
    isDefault: input.isDefault ?? false,
    isActive: input.isActive ?? true,
    config: parsed.data,
  }
}

export function assertListViewWriteAllowed(
  view: Pick<SavedListView, 'scope' | 'ownerId'>,
  actor: ListViewActor,
): void {
  if (view.scope === 'organization' && !actor.canManageOrganizationViews) {
    throw new Error('Managing organization views requires permission')
  }
  if (view.scope === 'user' && view.ownerId !== actor.userId) {
    throw new Error('A personal view can only be changed by its owner')
  }
}

export interface ResolvedListView {
  view: ListViewConfig
  source: 'explicit' | 'user' | 'organization' | 'system'
  row: SavedListView | null
  available: SavedListView[]
}

export interface DynamicListColumn {
  key: string
  label: string
  kind?: ListColumnKind
  width?: number | null
}

export interface ResolvedListColumn extends ListColumnMeta {
  label: string
  width?: number
}

export interface RecordListQuery<R extends Record<string, unknown>> {
  rows: R[]
  view: ListViewConfig
  meta: RecordTypeMeta
  search?: string
  searchFields?: string[]
  filters?: FilterClause[]
  page?: number
  perPage?: number
}

export interface RecordListResult<R extends Record<string, unknown>> {
  rows: R[]
  total: number
  page: number
  perPage: number
  pageCount: number
}

/**
 * Preserve the source precedence exactly: explicit view, user preference,
 * organization default, first accessible view, then the supplied system view.
 */
export async function resolveListView(options: {
  recordType: string
  userId: string
  explicitViewId?: string | null
  systemView: ListViewConfig
  store: ListViewStore
  dynamicColumns?: DynamicListColumn[]
  meta: RecordTypeMeta
}): Promise<ResolvedListView> {
  const available = (await options.store.list(options.recordType, options.userId))
    .filter((view) => view.isActive && view.recordType === options.recordType)
    .sort(compareViews)
  const byId = (id: string | null | undefined) => id ? available.find((view) => view.id === id) : undefined
  let chosen = byId(options.explicitViewId)
  let source: ResolvedListView['source'] = 'explicit'
  if (!chosen) {
    chosen = byId(await options.store.preferred(options.recordType, options.userId))
    source = 'user'
  }
  if (!chosen) {
    chosen = available.find((view) => view.scope === 'organization' && view.isDefault)
    source = 'organization'
  }
  if (!chosen) {
    chosen = available[0]
    source = chosen?.scope === 'user' ? 'user' : 'organization'
  }
  const base = structuredClone(chosen?.config ?? options.systemView)
  return {
    view: mergeListViewColumns(base, options.meta, options.dynamicColumns),
    source: chosen ? source : 'system',
    row: chosen ?? null,
    available,
  }
}

/** Merge newly registered and live custom columns without disturbing user order. */
export function mergeListViewColumns(
  view: ListViewConfig,
  meta: RecordTypeMeta,
  dynamicColumns: DynamicListColumn[] = [],
): ListViewConfig {
  const next = structuredClone(view)
  const placed = new Set(next.columns.map((column) => column.key))
  for (const column of meta.listColumns) {
    if (placed.has(column.key)) continue
    next.columns.push({
      key: column.key,
      visible: !column.defaultHidden,
      width: column.defaultWidth ?? null,
      labelOverride: null,
    })
    placed.add(column.key)
  }
  const liveDynamic = new Set(dynamicColumns.map((column) => column.key))
  for (const column of dynamicColumns) {
    if (placed.has(column.key)) continue
    next.columns.push({ key: column.key, visible: true, width: column.width ?? null, labelOverride: null })
    placed.add(column.key)
  }
  next.columns = next.columns.filter((column) => !column.key.startsWith('cf_') || liveDynamic.has(column.key))
  const actions = next.columns.findIndex((column) => column.key === '_actions')
  if (actions >= 0 && actions !== next.columns.length - 1) {
    const [column] = next.columns.splice(actions, 1)
    if (column) next.columns.push(column)
  }
  return next
}

export function resolveListColumns(
  view: ListViewConfig,
  meta: RecordTypeMeta,
  labels: (messageKey: string, fallback: string) => string,
  dynamicColumns: DynamicListColumn[] = [],
): ResolvedListColumn[] {
  const dynamic = new Map(dynamicColumns.map((column) => [column.key, column]))
  return view.columns.flatMap((placement) => {
    if (!placement.visible) return []
    const registered = meta.listColumns.find((column) => column.key === placement.key)
    const custom = dynamic.get(placement.key)
    if (!registered && !custom) return []
    const fallback = custom?.label ?? humanize(placement.key)
    const label = placement.labelOverride?.trim()
      || (registered ? labels(registered.labelKey, fallback) : fallback)
    return [{
      ...(registered ?? {
        key: placement.key,
        labelKey: placement.key,
        kind: custom?.kind ?? 'custom',
      }),
      label,
      width: placement.width ?? registered?.defaultWidth ?? custom?.width ?? undefined,
    }]
  })
}

/** Database-free execution for demos, local-first apps, and contract tests. */
export function queryRecordList<R extends Record<string, unknown>>(query: RecordListQuery<R>): RecordListResult<R> {
  const search = query.search?.trim().toLocaleLowerCase()
  const fields = query.searchFields?.length
    ? query.searchFields
    : query.meta.listColumns.filter((column) => column.kind !== 'actions').map((column) => column.key)
  const filters = [...query.view.filters, ...(query.filters ?? [])]
  let rows = query.rows.filter((row) => {
    if (search && !fields.some((key) => displayValue(row[key]).toLocaleLowerCase().includes(search))) return false
    return filters.every((filter) => matchesFilter(row[filter.key], filter))
  })
  const sort = query.view.sort
  if (sort) {
    rows = [...rows].sort((left, right) => compareValues(left[sort.column], right[sort.column]) * (sort.dir === 'asc' ? 1 : -1))
  }
  const total = rows.length
  const perPage = clamp(query.perPage ?? query.view.perPage ?? 25, 5, 100)
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const page = clamp(query.page ?? 1, 1, pageCount)
  return { rows: rows.slice((page - 1) * perPage, page * perPage), total, page, perPage, pageCount }
}

export function matchesFilter(value: unknown, filter: FilterClause): boolean {
  const expected = filter.value
  const scalar = Array.isArray(expected) ? expected[0] : expected
  switch (filter.operator) {
    case 'eq': return compareValues(value, scalar) === 0
    case 'ne': return compareValues(value, scalar) !== 0
    case 'in': return Array.isArray(expected) && expected.some((item) => compareValues(value, item) === 0)
    case 'not_in': return Array.isArray(expected) && expected.every((item) => compareValues(value, item) !== 0)
    case 'gte': return compareValues(value, scalar) >= 0
    case 'lte': return compareValues(value, scalar) <= 0
    case 'between': return compareValues(value, scalar) >= 0 && compareValues(value, filter.to) <= 0
    case 'contains': return displayValue(value).toLocaleLowerCase().includes(displayValue(scalar).toLocaleLowerCase())
    case 'is_set': return value !== null && value !== undefined && value !== ''
    case 'is_not_set': return value === null || value === undefined || value === ''
  }
}

function compareViews(left: SavedListView, right: SavedListView): number {
  if (left.scope !== right.scope) return left.scope === 'organization' ? -1 : 1
  if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1
  return left.name.localeCompare(right.name)
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0
  if (left === null || left === undefined || left === '') return 1
  if (right === null || right === undefined || right === '') return -1
  const leftNumber = numericValue(left)
  const rightNumber = numericValue(right)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber
  const leftDate = dateValue(left)
  const rightDate = dateValue(right)
  if (leftDate !== null && rightDate !== null) return leftDate - rightDate
  return displayValue(left).localeCompare(displayValue(right), undefined, { numeric: true, sensitivity: 'base' })
}

function numericValue(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || value.trim() === '') return Number.NaN
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function dateValue(value: unknown): number | null {
  if (value instanceof Date) return value.getTime()
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.join(', ')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function humanize(value: string): string {
  return value.replace(/^cf_/, '').replace(/^_/, '').replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase())
}

function clamp(value: number, min: number, max: number): number {
  const number = Math.trunc(Number(value))
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min))
}
