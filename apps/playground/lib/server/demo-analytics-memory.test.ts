import assert from 'node:assert/strict'
import test from 'node:test'
import type { AnalyticsCatalog } from '@appkit/analytics'
import { executeDemoQueryInMemory } from './demo-analytics-memory'

const catalog: AnalyticsCatalog = {
  sources: [{
    key: 'members',
    label: 'Members',
    from: 'unused',
    tenantColumn: 'tenant_id',
    detailColumns: ['name', 'email', 'role', 'joined_at'],
    fields: [
      { key: 'name', label: 'Name', expression: 'name', semanticType: 'text', canDimension: true },
      { key: 'email', label: 'Email', expression: 'email', semanticType: 'text', canDimension: true },
      { key: 'role', label: 'Role', expression: 'role', semanticType: 'category', canDimension: true },
      { key: 'joined_at', label: 'Joined', expression: 'joined_at', semanticType: 'date', canDimension: true, canBin: true },
    ],
  }],
}

test('database-free analytics groups fixtures using the shared query contract', () => {
  const result = executeDemoQueryInMemory({
    source: 'members',
    dimensions: [{ field: 'role' }],
    measures: [{ fn: 'count' }],
  }, catalog)

  assert.deepEqual(result.columns.map(({ key }) => key), ['role', 'count'])
  assert.equal(result.rowCount, 3)
  assert.equal(result.rows.reduce((total, row) => total + Number(row.count), 0), 12)
})

test('database-free analytics applies filters, date bins, formulas, and limits', () => {
  const result = executeDemoQueryInMemory({
    source: 'members',
    filters: [{ field: 'role', operator: 'eq', value: 'Analyst' }],
    dimensions: [{ field: 'joined_at', bin: 'year' }],
    measures: [{
      kind: 'formula',
      alias: 'members',
      formula: { expression: 'aggregate', fn: 'count' },
    }],
    limit: 1,
  }, catalog)

  assert.equal(result.rowCount, 1)
  assert.equal(result.truncated, true)
  assert.match(String(result.rows[0]?.joined_at_year), /^202[56]-01-01$/)
  assert.ok(Number(result.rows[0]?.members) > 0)
})
