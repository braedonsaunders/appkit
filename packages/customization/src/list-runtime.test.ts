import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeListViewColumns,
  queryRecordList,
  resolveListColumns,
  resolveListView,
  type ListViewStore,
  type SavedListView,
} from './list-runtime'
import { createMemoryListViewStore } from './memory'
import { defaultListView } from './schema'
import { createCustomizationRegistry } from './registry'
import type { ListViewConfig, RecordTypeMeta } from './types'

const meta: RecordTypeMeta = {
  key: 'record',
  labelKey: 'records',
  category: 'entity',
  headerFields: [],
  lineFields: [],
  listColumns: [
    { key: 'number', labelKey: 'number', kind: 'reference', sortable: true, locked: true },
    { key: 'name', labelKey: 'name', kind: 'text', sortable: true },
    { key: 'value', labelKey: 'value', kind: 'amount', sortable: true },
    { key: 'status', labelKey: 'status', kind: 'status' },
    { key: '_actions', labelKey: 'actions', kind: 'actions' },
  ],
  listFilters: [],
}
const registry = createCustomizationRegistry([meta])

const systemView: ListViewConfig = {
  schemaVersion: 1,
  recordType: 'record',
  columns: meta.listColumns.map((column) => ({ key: column.key, visible: true })),
  filters: [],
  sort: { column: 'name', dir: 'asc' },
  perPage: 5,
}

function saved(id: string, scope: SavedListView['scope'], isDefault = false): SavedListView {
  return { id, recordType: 'record', name: id, scope, isDefault, isActive: true, config: structuredClone(systemView) }
}

test('resolves explicit, preferred, organization, and system views in source order', async () => {
  let preferred: string | null = 'personal'
  const rows = [saved('organization', 'organization', true), saved('personal', 'user')]
  const store: ListViewStore = {
    async list() { return rows },
    async preferred() { return preferred },
  }
  assert.equal((await resolveListView({ recordType: 'record', userId: 'user', explicitViewId: 'organization', systemView, store, meta })).source, 'explicit')
  assert.equal((await resolveListView({ recordType: 'record', userId: 'user', systemView, store, meta })).row?.id, 'personal')
  preferred = null
  assert.equal((await resolveListView({ recordType: 'record', userId: 'user', systemView, store, meta })).row?.id, 'organization')
  rows.splice(0)
  assert.equal((await resolveListView({ recordType: 'record', userId: 'user', systemView, store, meta })).source, 'system')
})

test('merges registered and live columns while preserving order and actions-last', () => {
  const stored: ListViewConfig = {
    ...structuredClone(systemView),
    columns: [
      { key: 'number', visible: true },
      { key: '_actions', visible: true },
      { key: 'cf_stale', visible: true },
    ],
  }
  const merged = mergeListViewColumns(stored, meta, [{ key: 'cf_region', label: 'Region' }])
  assert.deepEqual(merged.columns.map((column) => column.key), ['number', 'name', 'value', 'status', 'cf_region', '_actions'])
  const resolved = resolveListColumns(merged, meta, (_key, fallback) => fallback, [{ key: 'cf_region', label: 'Region' }])
  assert.equal(resolved.find((column) => column.key === 'cf_region')?.label, 'Region')
})

test('executes saved filters, ad-hoc filters, search, sort, and pagination', () => {
  const view: ListViewConfig = {
    ...structuredClone(systemView),
    filters: [{ key: 'status', operator: 'in', value: ['active', 'pending'] }],
    sort: { column: 'value', dir: 'desc' },
    perPage: 5,
  }
  const result = queryRecordList({
    meta,
    view,
    search: 'alpha',
    filters: [{ key: 'value', operator: 'gte', value: '20' }],
    page: 2,
    rows: [
      { number: 'R-1', name: 'Alpha one', value: 50, status: 'active' },
      { number: 'R-2', name: 'Alpha two', value: 40, status: 'pending' },
      { number: 'R-3', name: 'Alpha three', value: 30, status: 'active' },
      { number: 'R-6', name: 'Alpha four', value: 29, status: 'active' },
      { number: 'R-7', name: 'Alpha five', value: 28, status: 'active' },
      { number: 'R-8', name: 'Alpha six', value: 27, status: 'active' },
      { number: 'R-4', name: 'Beta', value: 100, status: 'active' },
      { number: 'R-5', name: 'Alpha archived', value: 90, status: 'archived' },
    ],
  })
  assert.equal(result.total, 6)
  assert.equal(result.pageCount, 2)
  assert.deepEqual(result.rows.map((row) => row.number), ['R-8'])
})

test('compares numeric strings numerically', () => {
  const result = queryRecordList({
    meta,
    view: { ...systemView, sort: { column: 'value', dir: 'asc' } },
    rows: [
      { number: 'R-1', name: 'Ten', value: '10', status: 'active' },
      { number: 'R-2', name: 'Nine', value: '9', status: 'active' },
    ],
  })
  assert.deepEqual(result.rows.map((row) => row.value), ['9', '10'])
})

test('memory repository enforces source ownership, defaults, preferences, and deletion', async () => {
  const store = createMemoryListViewStore({ registry, createId: (() => { let id = 0; return () => `view-${++id}` })() })
  const recordType = meta.key
  const config = defaultListView(meta)
  const personal = await store.save({
    recordType,
    name: 'Mine',
    scope: 'user',
    isDefault: true,
    config,
    actor: { userId: 'user-a' },
  })
  await assert.rejects(() => store.save({
    recordType,
    name: 'Shared',
    scope: 'organization',
    config,
    actor: { userId: 'user-a' },
  }), /requires permission/)
  const shared = await store.save({
    recordType,
    name: 'Shared',
    scope: 'organization',
    isDefault: true,
    config,
    actor: { userId: 'admin', canManageOrganizationViews: true },
  })
  assert.deepEqual((await store.list(recordType, 'user-a')).map((view) => view.id), [personal.id, shared.id])
  assert.deepEqual((await store.list(recordType, 'user-b')).map((view) => view.id), [shared.id])
  await assert.rejects(() => store.setPreferred!(recordType, 'user-b', personal.id), /not found/)
  await store.setPreferred!(recordType, 'user-a', personal.id)
  assert.equal(await store.preferred(recordType, 'user-a'), personal.id)
  await store.remove(personal.id, { userId: 'user-a' })
  assert.equal(await store.preferred(recordType, 'user-a'), null)
})
