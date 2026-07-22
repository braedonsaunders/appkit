import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertScheduleFilters,
  compileCustomReport,
  createReportDefinitionRegistry,
  customReportResult,
  resolveReportLayout,
  validateScheduleRecipients,
  type ReportEntityCatalog,
} from './index'

const catalog: ReportEntityCatalog = { entities: [{
  key: 'records', label: 'Records', category: 'Operations', from: 'records r', tenantColumn: 'r.tenant_id',
  columns: [
    { key: 'created_at', label: 'Created at', kind: 'timestamp', expression: 'r.created_at' },
    { key: 'status', label: 'Status', kind: 'enum', expression: 'r.status' },
    { key: 'amount', label: 'Amount', kind: 'number', expression: 'r.amount' },
  ],
  defaultColumns: ['created_at', 'status', 'amount'], defaultSort: { column: 'created_at', direction: 'desc' },
}] }

test('row report compiler scopes the tenant and binds every authored value', () => {
  const compiled = compileCustomReport({ entity: 'records', mode: 'rows', columns: ['created_at', 'status'], filters: { combinator: 'and', rules: [{ field: 'status', op: 'contains', value: 'open' }] }, sort: { column: 'created_at', direction: 'desc' } }, 'tenant-1', catalog)
  assert.deepEqual(compiled.params, ['tenant-1', '%open%'])
  assert.match(compiled.sql, /r\.tenant_id = \$1/)
  assert.match(compiled.sql, /r\.status::text ILIKE \$2/)
  assert.doesNotMatch(compiled.sql, /open/)
})

test('summary compiler supports fiscal bins and validates numeric aggregates', () => {
  const compiled = compileCustomReport({ entity: 'records', mode: 'summarize', columns: [], breakouts: [{ column: 'created_at', bin: 'fiscal_year' }], measures: [{ fn: 'sum', column: 'amount' }] }, 'tenant-1', catalog, { fiscalStartMonth: 4 })
  assert.match(compiled.sql, /make_interval\(months => 9\)/)
  assert.match(compiled.sql, /sum\(r\.amount\)/)
  assert.throws(() => compileCustomReport({ entity: 'records', mode: 'summarize', columns: [], measures: [{ fn: 'sum', column: 'status' }] }, 'tenant-1', catalog), /numeric/)
})

test('compiled rows become grouped document results and preserve truncation', () => {
  const compiled = compileCustomReport({ entity: 'records', mode: 'rows', columns: ['amount'], groupBy: 'status', limit: 2 }, 'tenant-1', catalog)
  const result = customReportResult(compiled, [{ status: 'open', amount: 10 }, { status: 'open', amount: 20 }, { status: 'closed', amount: 30 }])
  assert.equal(result.groups.length, 1)
  assert.equal(result.groups[0]?.title, 'open')
  assert.equal(result.rowCount, 2)
  assert.equal(result.truncated, true)
})

test('definition registry rejects duplicates and filters published reports', () => {
  const definition = { schemaVersion: 1 as const, id: 'one', slug: 'report-one', name: 'Report one', query: { entity: 'records', mode: 'rows' as const, columns: ['status'] }, layout: resolveReportLayout(), state: 'published' as const, tags: ['operations'] }
  const registry = createReportDefinitionRegistry([definition])
  assert.equal(registry.get('report-one')?.id, 'one')
  assert.equal(registry.list({ state: 'published', tags: ['operations'] }).length, 1)
  assert.throws(() => createReportDefinitionRegistry([definition, definition]), /Duplicate/)
})

test('schedule policy normalizes recipients and rejects hostile filter objects', () => {
  assert.deepEqual(validateScheduleRecipients([' Team@Example.com ', 'team@example.com']), ['team@example.com'])
  const hostile = Object.create(null) as Record<string, unknown>
  Object.defineProperty(hostile, '__proto__', { value: 'bad', enumerable: true })
  assert.throws(() => assertScheduleFilters(hostile), /invalid key/)
})
