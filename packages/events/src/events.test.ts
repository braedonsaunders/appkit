import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertDomainEvent, diff } from './index'

test('diff reports added / removed / changed', () => {
  const d = diff({ a: 1, b: 2, c: 3 }, { a: 1, b: 20, d: 4 })
  assert.deepEqual(d.added, { d: 4 })
  assert.deepEqual(d.removed, { c: 3 })
  assert.deepEqual(d.changed, { b: { before: 2, after: 20 } })
})

test('diff handles null before/after', () => {
  assert.deepEqual(diff(null, { a: 1 }).added, { a: 1 })
  assert.deepEqual(diff({ a: 1 }, null).removed, { a: 1 })
  const same = diff({ a: 1 }, { a: 1 })
  assert.deepEqual(same.added, {})
  assert.deepEqual(same.changed, {})
})

test('assertDomainEvent requires type + dedup key', () => {
  const ok = { tenantId: 't', eventType: 'invoice.paid', subjectId: 's', dedupKey: 'k', payload: {} }
  assert.doesNotThrow(() => assertDomainEvent(ok))
  assert.throws(() => assertDomainEvent({ ...ok, eventType: '  ' }))
  assert.throws(() => assertDomainEvent({ ...ok, dedupKey: '' }))
})
