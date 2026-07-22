import assert from 'node:assert/strict'
import test from 'node:test'
import { compileReportRuleGroup, SqlParameters } from './filters'
import { createReportDrillCodec } from './drill'
import type { ReportEntity } from './entities'
import { reportRunResultToPaper } from './viewer-types'

const entity: ReportEntity = {
  key: 'records', label: 'Records', category: 'Operations', from: 'records r', tenantColumn: 'r.tenant_id', defaultColumns: ['created_on'],
  columns: [{ key: 'created_on', label: 'Created on', kind: 'date', expression: 'r.created_on' }],
}

test('fiscal period filters resolve to bound inclusive dates', () => {
  const parameters = new SqlParameters()
  const sql = compileReportRuleGroup(entity, { combinator: 'and', rules: [{ field: 'created_on', op: 'period_preset', value: 'this_fiscal_year' }] }, parameters, { now: new Date('2026-07-21T12:00:00Z'), fiscalStartMonth: 4 })
  assert.equal(sql, '(r.created_on >= $1 AND r.created_on <= $2)')
  assert.deepEqual(parameters.values, ['2026-04-01', '2027-03-31'])
})

test('drill codecs reject malformed and oversized URL state before app validation', () => {
  const codec = createReportDrillCodec<{ kind: 'record'; id: string }>((value) => {
    if (!value || typeof value !== 'object') return null
    const input = value as Record<string, unknown>
    return input.kind === 'record' && typeof input.id === 'string' && input.id.length <= 20 ? { kind: 'record', id: input.id } : null
  }, { maxLength: 256 })
  assert.deepEqual(codec.parse(codec.encode({ kind: 'record', id: 'r-1' })), { kind: 'record', id: 'r-1' })
  assert.equal(codec.parse('{bad json'), null)
  assert.equal(codec.parse(JSON.stringify({ kind: 'record', id: 'x'.repeat(40) })), null)
  assert.equal(codec.parse('x'.repeat(257)), null)
})

test('report results map to paper rows without losing alignments, money, or cell drills', () => {
  const paper = reportRunResultToPaper('Portfolio', {
    groups: [{ kind: 'results', title: 'Results', columns: [{ key: 'name', label: 'Name', semanticType: 'text' }, { key: 'value', label: 'Value', semanticType: 'currency', align: 'right' }], rows: [{ name: 'North', value: 1250 }] }],
    summary: [{ key: 'count', label: 'Records', value: 1 }], rowCount: 1, truncated: false, durationMs: 4,
  }, { drillTarget: ({ columnKey }) => columnKey === 'value' ? { kind: 'value' as const } : null })
  assert.deepEqual(paper.groups[0]?.rows, [['North', 1250]])
  assert.deepEqual(paper.groups[0]?.align, ['left', 'right'])
  assert.deepEqual(paper.groups[0]?.money, [false, true])
  assert.deepEqual(paper.groups[0]?.drills, [[null, { kind: 'value' }]])
})
