import assert from 'node:assert/strict'
import test from 'node:test'
import { QueryValidationError, validateQuery, type AnalyticsCatalog } from './index'

const catalog: AnalyticsCatalog = { sources: [{
  key: 'records', label: 'Records', from: 'records', tenantColumn: 'tenant_id', detailColumns: ['name'],
  fields: [
    { key: 'name', label: 'Name', expression: 'name', semanticType: 'text' },
    { key: 'amount', label: 'Amount', expression: 'amount', semanticType: 'currency' },
    { key: 'created_at', label: 'Created', expression: 'created_at', semanticType: 'date' },
  ],
}] }

test('persisted query validation preserves aggregate, formula, filter, sort, and date-bin plans', () => {
  const query = validateQuery({
    source: 'records',
    dimensions: [{ field: 'created_at', bin: 'month' }],
    measures: [
      { fn: 'sum', field: 'amount' },
      { kind: 'formula', alias: 'average_value', formula: { expression: 'arithmetic', operator: '/', left: { expression: 'aggregate', fn: 'sum', argument: { expression: 'field', field: 'amount' } }, right: { expression: 'aggregate', fn: 'count' } } },
    ],
    filters: [{ field: 'name', operator: 'contains', value: 'North' }],
    sort: [{ ref: 'sum_amount', direction: 'desc' }],
    limit: 200,
  }, catalog)
  assert.equal(query.measures?.length, 2)
  assert.equal(query.dimensions?.[0]?.bin, 'month')
  assert.equal(query.filters?.[0]?.operator, 'contains')
})

test('persisted query validation fails closed on unknown fields and malformed formula ASTs', () => {
  assert.throws(() => validateQuery({ source: 'records', filters: [{ field: 'secret', operator: 'eq' }] }, catalog), (error: unknown) => error instanceof QueryValidationError && error.code === 'unknown_field')
  assert.throws(() => validateQuery({ source: 'records', measures: [{ kind: 'formula', alias: 'bad', formula: { expression: 'call', fn: 'sum', arguments: 'amount' } }] }, catalog), QueryValidationError)
})
