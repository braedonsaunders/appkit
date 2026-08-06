import assert from 'node:assert/strict'
import test from 'node:test'
import { compileReportRuleGroup, SqlParameters } from './filters'
import { createReportDrillCodec, parseReportDrillScope, reportDrillScopeFilter } from './drill'
import type { ReportEntity } from './entities'
import { reportPaperSummary, reportRunResultToPaper } from './viewer-types'

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

test('drill scopes validate fail-closed and compile to exact-bucket filter rules', () => {
  const scope = parseReportDrillScope([
    { field: 'employee', value: 'Ada' },
    { field: 'pay_date', from: '2026-07-01', to: '2026-07-31' },
    { field: 'department', empty: true },
  ])
  assert.deepEqual(scope, [
    { field: 'employee', value: 'Ada' },
    { field: 'pay_date', from: '2026-07-01', to: '2026-07-31' },
    { field: 'department', empty: true },
  ])
  assert.equal(parseReportDrillScope([{ field: 'bad field!', value: 'x' }]), null)
  assert.equal(parseReportDrillScope([{ field: 'pay_date', from: 'July', to: '2026-07-31' }]), null)
  assert.equal(parseReportDrillScope([{ field: 'employee', value: 'x'.repeat(300) }]), null)
  assert.equal(parseReportDrillScope(Array.from({ length: 9 }, () => ({ field: 'employee', value: 'x' }))), null)

  const scoped: ReportEntity = { ...entity, columns: [
    { key: 'employee', label: 'Employee', kind: 'text', expression: 'r.employee' },
    { key: 'pay_date', label: 'Pay date', kind: 'date', expression: 'r.pay_date' },
    { key: 'department', label: 'Department', kind: 'text', expression: 'r.department' },
    { key: 'secret', label: 'Secret', kind: 'text', expression: 'r.secret', hidden: true },
  ] }
  assert.deepEqual(reportDrillScopeFilter(scoped, scope!), { combinator: 'and', rules: [
    { field: 'employee', op: 'eq', value: 'Ada' },
    { field: 'pay_date', op: 'gte', value: '2026-07-01' },
    { field: 'pay_date', op: 'lte', value: '2026-07-31' },
    { field: 'department', op: 'is_null' },
  ] })
  assert.throws(() => reportDrillScopeFilter(scoped, [{ field: 'nope', value: '1' }]), /unknown column/)
  assert.throws(() => reportDrillScopeFilter(scoped, [{ field: 'secret', value: '1' }]), /unknown column/)
})

test('paper mapping hands each drill callback the group kind and the exact row scope', () => {
  const seen: unknown[] = []
  reportRunResultToPaper('Payroll', {
    groups: [{
      kind: 'summary', title: 'Summary',
      columns: [{ key: 'd0', label: 'Employee', semanticType: 'text' }, { key: 'm0', label: 'Sum of amount', semanticType: 'currency' }],
      rows: [{ d0: 'Ada', m0: 100 }, { d0: 'Grace', m0: 50 }],
      rowKeys: [[{ field: 'employee', value: 'Ada' }], null],
    }],
    summary: [], rowCount: 2, truncated: false, durationMs: 1,
  }, { drillTarget: ({ groupKind, rowScope, columnKey }) => { if (columnKey === 'm0') seen.push({ groupKind, rowScope }); return null } })
  assert.deepEqual(seen, [
    { groupKind: 'summary', rowScope: [{ field: 'employee', value: 'Ada' }] },
    { groupKind: 'summary', rowScope: null },
  ])
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

test('paper summary visibility follows the canonical report layout', () => {
  const data = {
    title: 'Portfolio',
    summary: [{ label: 'Records', value: 1 }],
    groups: [],
  }
  assert.equal(reportPaperSummary(data).length, 1)
  assert.deepEqual(reportPaperSummary({ ...data, layout: { showSummary: false } }), [])
})
