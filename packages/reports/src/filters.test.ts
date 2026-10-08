import assert from 'node:assert/strict'
import test from 'node:test'
import { compileReportRule, compileReportRuleGroup, SqlParameters, type ReportRule } from './filters'
import type { ReportEntity } from './entities'

const entity: ReportEntity = { key: 'jobs', label: 'Jobs', category: 'Operations', table: 'jobs', columns: [{key:'due_at',label:'Due',kind:'timestamp'}] }
const now = new Date('2026-10-08T12:00:00Z')

test('relative-date rules ignore incomplete values and retain explicit zero days', () => {
  for (const op of ['between_days_ago', 'due_within_days'] as const) {
    for (const value of [undefined, null, '']) {
      const parameters = new SqlParameters()
      assert.equal(compileReportRule(entity, {field:'due_at',op,value}, parameters, now), null)
      assert.deepEqual(parameters.values, [])
    }
    for (const value of [0, '0']) {
      const parameters = new SqlParameters()
      assert.match(compileReportRule(entity, {field:'due_at',op,value}, parameters, now)!, /[<>]= \$1/)
      assert.deepEqual(parameters.values, [now.toISOString()])
    }
    const parameters = new SqlParameters()
    compileReportRule(entity, {field:'due_at',op,value:30}, parameters, now)
    assert.deepEqual(parameters.values, [new Date(now.getTime() + (op === 'due_within_days' ? 1 : -1) * 30 * 86_400_000).toISOString()])
  }
})

test('incomplete day rules do not change OR or negated group results', () => {
  const blank: ReportRule = {field:'due_at', op:'due_within_days', value:''}
  const parameters = new SqlParameters()
  const actual = compileReportRuleGroup(entity, {combinator:'or',not:true,rules:[blank,{field:'due_at',op:'eq',value:'2026-10-09'}]}, parameters, {now})
  assert.match(actual!, /^NOT \(.* = \$1\)$/)
  assert.deepEqual(parameters.values, ['2026-10-09'])
  assert.equal(compileReportRuleGroup(entity, {combinator:'or',not:true,rules:[blank]}, new SqlParameters(), {now}), null)
})
