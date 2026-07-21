import assert from 'node:assert/strict'
import test from 'node:test'
import { computeNextRunAt } from './cadence'

test('report cadence preserves local time across DST boundaries', () => {
  assert.equal(computeNextRunAt({ cadence: 'daily', hour: 8, minute: 0, timezone: 'America/Toronto' }, new Date('2026-03-07T13:01:00.000Z'))?.toISOString(), '2026-03-08T12:00:00.000Z')
  assert.equal(computeNextRunAt({ cadence: 'daily', hour: 8, minute: 0, timezone: 'America/Toronto' }, new Date('2026-10-31T12:01:00.000Z'))?.toISOString(), '2026-11-01T13:00:00.000Z')
})

test('report cadence supports sparse monthly, multi-week, nth-weekday, and end bounds', () => {
  assert.equal(computeNextRunAt({ cadence: 'monthly', dayOfMonth: 31, hour: 9, minute: 0, timezone: 'UTC' }, new Date('2026-04-01T00:00:00.000Z'))?.toISOString(), '2026-05-31T09:00:00.000Z')
  assert.equal(computeNextRunAt({ cadence: 'weekly', repeatEvery: 2, dayOfWeek: 2, hour: 9, minute: 0, timezone: 'UTC', startsOn: '2026-01-06' }, new Date('2026-01-07T00:00:00.000Z'))?.toISOString(), '2026-01-20T09:00:00.000Z')
  assert.equal(computeNextRunAt({ cadence: 'monthly', weekOfMonth: 1, dayOfWeek: 1, hour: 10, minute: 30, timezone: 'UTC' }, new Date('2026-04-07T00:00:00.000Z'))?.toISOString(), '2026-05-04T10:30:00.000Z')
  assert.equal(computeNextRunAt({ cadence: 'weekly', dayOfWeek: 1, hour: 9, minute: 0, timezone: 'UTC', endsOn: '2026-01-31' }, new Date('2026-02-01T00:00:00.000Z')), null)
})
