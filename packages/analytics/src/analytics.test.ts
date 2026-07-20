import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFormula, serializeFormula, type AnalyticsCatalog, type InsightQuery } from './index'
import { compileQuery, QueryCompileError } from './compile'

const catalog: AnalyticsCatalog = { sources: [{ key: 'events', label: 'Events', from: 'events e', tenantColumn: 'e.tenant_id', detailColumns: ['name', 'occurred_at'], fields: [
  { key: 'name', label: 'Name', expression: 'e.name', semanticType: 'text' },
  { key: 'amount', label: 'Amount', expression: 'e.amount', semanticType: 'currency' },
  { key: 'occurred_at', label: 'Occurred at', expression: 'e.occurred_at', semanticType: 'date' },
] }] }

test('formula parser round-trips a safe aggregate expression', () => {
  const parsed = parseFormula('sum([Amount]) / count()', { resolveField: (label) => label === 'Amount' ? 'amount' : null })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(serializeFormula(parsed.expression, (key) => key === 'amount' ? 'Amount' : key), '(sum([Amount]) / count())')
})

test('compiler whitelists fields and binds tenant/filter values', () => {
  const query: InsightQuery = { source: 'events', dimensions: [{ field: 'occurred_at', bin: 'month' }], measures: [{ fn: 'sum', field: 'amount' }], filters: [{ field: 'name', operator: 'contains', value: 'north' }] }
  const compiled = compileQuery(query, 'tenant-1', catalog)
  assert.deepEqual(compiled.params, ['tenant-1', '%north%'])
  assert.match(compiled.sql, /e\.tenant_id = \$1/)
  assert.match(compiled.sql, /date_trunc\('month', e\.occurred_at\)/)
  assert.doesNotMatch(compiled.sql, /north/)
})

test('compiler rejects unknown fields before producing SQL', () => {
  assert.throws(() => compileQuery({ source: 'events', measures: [{ fn: 'sum', field: 'secret' }] }, 'tenant-1', catalog), (error) => error instanceof QueryCompileError && error.code === 'unknown_field')
})

test('compiler safely inlines only whitelisted extract date parts', () => {
  const parsed = parseFormula("datepart('month', min([Occurred at]))", { resolveField: (label) => label === 'Occurred at' ? 'occurred_at' : null })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const compiled = compileQuery({ source: 'events', measures: [{ kind: 'formula', alias: 'month_number', formula: parsed.expression }] }, 'tenant-1', catalog)
  assert.match(compiled.sql, /extract\(month from min\(e\.occurred_at\)\)/)
  assert.deepEqual(compiled.params, ['tenant-1'])
})

test('compiler fetches one sentinel row beyond the public result limit', () => {
  const compiled = compileQuery({ source: 'events', measures: [{ fn: 'count' }], limit: 25 }, 'tenant-1', catalog)
  assert.match(compiled.sql, /limit 26$/)
  assert.equal(compiled.limit, 25)
})

test('formula validation rejects invalid arity and unaggregated fields', () => {
  assert.equal(parseFormula('round()', { resolveField: () => null }).ok, false)
  assert.throws(() => compileQuery({ source: 'events', measures: [{ kind: 'formula', alias: 'raw_amount', formula: { expression: 'field', field: 'amount' } }] }, 'tenant-1', catalog), (error) => error instanceof QueryCompileError && error.code === 'invalid_formula')
})

test('compiler rejects operators that do not match a field semantic type', () => {
  assert.throws(() => compileQuery({ source: 'events', filters: [{ field: 'amount', operator: 'contains', value: '10' }] }, 'tenant-1', catalog), (error) => error instanceof QueryCompileError && error.code === 'invalid_filter')
})

test('date formula units are literal, whitelisted, and never user-bound SQL syntax', () => {
  const parsed = parseFormula("datetrunc('month', min([Occurred at]))", { resolveField: (label) => label === 'Occurred at' ? 'occurred_at' : null })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const compiled = compileQuery({ source: 'events', measures: [{ kind: 'formula', alias: 'first_month', formula: parsed.expression }] }, 'tenant-1', catalog)
  assert.match(compiled.sql, /date_trunc\('month', min\(e\.occurred_at\)\)/)
  assert.deepEqual(compiled.params, ['tenant-1'])
})
