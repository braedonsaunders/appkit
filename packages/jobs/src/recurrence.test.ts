import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceRecurrence, nextOccurrence, parseRecurrenceSchedule, resolveLocalDateTime,
  RecurrenceSearchLimitError, RecurrenceValidationError,
  type RecurrenceSchedule,
} from './recurrence'

const interval: RecurrenceSchedule = {
  kind: 'interval', timeZone: 'UTC', anchor: '2026-01-01T00:00:00.123Z', everyMs: 300_000,
}
const daily: RecurrenceSchedule = { kind: 'daily', timeZone: 'America/New_York', time: '02:30' }

test('strict parsing normalizes independent JSON and offset instants', () => {
  const raw = { kind: 'weekly', timeZone: 'UTC', time: '09:00', weekdays: [7, 1], active: { weekdays: [7, 1] } }
  const parsed = parseRecurrenceSchedule(raw)
  raw.weekdays.push(2)
  raw.active.weekdays.push(2)
  assert.deepEqual(parsed, { kind: 'weekly', timeZone: 'UTC', time: '09:00', weekdays: [1, 7], active: { weekdays: [1, 7] } })
  assert.deepEqual(parseRecurrenceSchedule({ kind: 'once', timeZone: 'America/New_York', at: '2026-01-01T09:00:00-05:00' }), {
    kind: 'once', timeZone: 'America/New_York', at: '2026-01-01T14:00:00.000Z',
  })
})

test('invalid schedules, timestamps, dates, timezone offsets and empty filters fail closed', () => {
  const bad: unknown[] = [
    null, [], {}, { ...interval, kind: 'cron' }, { ...interval, extra: true },
    ...[0, 59_999, 60_000.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '60000'].map((everyMs) => ({ ...interval, everyMs })),
    ...['', 'Mars/Olympus', '+05:00', ' UTC', 'Z'].map((timeZone) => ({ ...interval, timeZone })),
    ...['2026-02-30T00:00:00Z', '2026-01-01', '2026-01-01T00:00:00', '2026-01-01T24:00:00Z',
      '2026-01-01T00:00:60Z', '2026-01-01T00:00:00.0001Z', '2026-01-01T00:00:00Z[UTC]'].map((anchor) => ({ ...interval, anchor })),
    ...['24:00', '2:30', '12:60', '09:00:00'].map((time) => ({ ...daily, time })),
    { ...daily, active: {} }, { ...daily, active: { weekdays: [] } },
    { ...daily, active: { weekdays: [0, 7] } }, { ...daily, active: { weekdays: [1, 1] } },
    { ...daily, active: { weekdays: new Array(1) } },
    { ...daily, active: { window: { start: '09:00', end: '09:00' } } },
    { ...daily, active: { window: { start: 'bad', end: '10:00' } } },
    { ...daily, active: { window: { start: '09:00', end: '10:00' } } },
    { kind: 'weekly', timeZone: 'UTC', time: '09:00', weekdays: [] },
    { kind: 'weekly', timeZone: 'UTC', time: '09:00', weekdays: [1], active: { weekdays: [2] } },
    ...[0, 32, 1.5, '31', null].map((dayOfMonth) => ({ kind: 'monthly', timeZone: 'UTC', time: '09:00', dayOfMonth })),
  ]
  for (const schedule of bad) assert.throws(() => parseRecurrenceSchedule(schedule), RecurrenceValidationError, JSON.stringify(schedule))
  assert.throws(() => nextOccurrence(interval, 'invalid'), RecurrenceValidationError)
})

test('intervals are elapsed milliseconds anchored exactly, including pre-anchor queries', () => {
  assert.equal(nextOccurrence(interval, '2025-12-31T00:00:00Z'), interval.anchor)
  assert.equal(nextOccurrence(interval, '2026-01-01T00:00:00.122Z'), interval.anchor)
  assert.equal(nextOccurrence(interval, interval.anchor), '2026-01-01T00:05:00.123Z')
  assert.equal(nextOccurrence(interval, '2026-01-01T00:04:59.999Z'), '2026-01-01T00:05:00.123Z')
  const dst: RecurrenceSchedule = { kind: 'interval', timeZone: 'America/New_York', everyMs: 3_600_000, anchor: '2026-03-08T06:30:00Z' }
  assert.equal(nextOccurrence(dst, '2026-03-08T06:30:00Z'), '2026-03-08T07:30:00.000Z')
  assert.equal(nextOccurrence({ ...dst, anchor: '2026-11-01T05:30:00Z' }, '2026-11-01T05:30:00Z'), '2026-11-01T06:30:00.000Z')
})

test('UTC daily and weekly return exact strictly future occurrences', () => {
  assert.equal(nextOccurrence({ kind: 'daily', timeZone: 'UTC', time: '09:00' }, '2026-01-01T08:59:59.999Z'), '2026-01-01T09:00:00.000Z')
  assert.equal(nextOccurrence({ kind: 'daily', timeZone: 'UTC', time: '09:00' }, '2026-01-01T09:00:00Z'), '2026-01-02T09:00:00.000Z')
  assert.equal(nextOccurrence({ kind: 'weekly', timeZone: 'UTC', time: '09:00', weekdays: [1, 5] }, '2026-01-02T09:00:00Z'), '2026-01-05T09:00:00.000Z')
})

test('New York gap skips its date; fold runs once at the earlier instant', () => {
  assert.equal(nextOccurrence(daily, '2026-03-07T07:30:00Z'), '2026-03-09T06:30:00.000Z')
  const fold: RecurrenceSchedule = { ...daily, time: '01:30' }
  assert.equal(nextOccurrence(fold, '2026-11-01T05:29:59.999Z'), '2026-11-01T05:30:00.000Z')
  assert.equal(nextOccurrence(fold, '2026-11-01T05:30:00Z'), '2026-11-02T06:30:00.000Z')
  assert.equal(nextOccurrence(fold, '2026-11-01T06:00:00Z'), '2026-11-02T06:30:00.000Z')
  assert.equal(nextOccurrence(daily, '2026-03-08T06:59:59Z'), '2026-03-09T06:30:00.000Z')
})

test('Lord Howe half-hour DST follows the same gap and fold policy', () => {
  const gap: RecurrenceSchedule = { kind: 'daily', timeZone: 'Australia/Lord_Howe', time: '02:15' }
  assert.equal(nextOccurrence(gap, '2026-10-03T00:00:00Z'), '2026-10-04T15:15:00.000Z')
  const fold: RecurrenceSchedule = { ...gap, time: '01:45' }
  assert.equal(nextOccurrence(fold, '2026-04-04T14:44:59.999Z'), '2026-04-04T14:45:00.000Z')
  assert.equal(nextOccurrence(fold, '2026-04-04T14:45:00Z'), '2026-04-05T15:15:00.000Z')
})

test('monthly skips missing dates, handles leap years and explicitly selects month end', () => {
  const monthly: RecurrenceSchedule = { kind: 'monthly', timeZone: 'UTC', time: '09:00', dayOfMonth: 31 }
  assert.equal(nextOccurrence(monthly, '2026-01-31T09:00:00Z'), '2026-03-31T09:00:00.000Z')
  assert.equal(nextOccurrence({ ...monthly, dayOfMonth: 29 }, '2027-02-01T00:00:00Z'), '2027-03-29T09:00:00.000Z')
  assert.equal(nextOccurrence({ ...monthly, dayOfMonth: 29 }, '2028-02-01T00:00:00Z'), '2028-02-29T09:00:00.000Z')
  assert.equal(nextOccurrence({ ...monthly, dayOfMonth: 'last' }, '2028-02-01T00:00:00Z'), '2028-02-29T09:00:00.000Z')
  assert.equal(nextOccurrence({ ...monthly, active: { weekdays: [1] } }, '2026-01-01T00:00:00Z'), '2026-08-31T09:00:00.000Z')
  assert.equal(nextOccurrence(monthly, '2399-12-31T09:00:00Z'), '2400-01-31T09:00:00.000Z')
  assert.equal(nextOccurrence({ ...monthly, dayOfMonth: 'last' }, '2100-02-01T00:00:00Z'), '2100-02-28T09:00:00.000Z')
})

test('once preserves exact initialization boundary, terminal exhaustion and distant dates', () => {
  const once: RecurrenceSchedule = { kind: 'once', timeZone: 'UTC', at: '2500-01-01T00:00:00.123Z' }
  assert.equal(nextOccurrence(once, '2026-01-01T00:00:00Z'), once.at)
  assert.equal(nextOccurrence(once, '2500-01-01T00:00:00.122Z'), once.at)
  assert.equal(nextOccurrence(once, once.at), null)
  assert.equal(nextOccurrence({ ...once, active: { weekdays: [1] } }, '2026-01-01T00:00:00Z'), null)
})

test('once UI conversion rejects invalid/gap dates and requires explicit fold choice', () => {
  const local = { localDateTime: '2026-11-01T01:30', timeZone: 'America/New_York', disambiguation: 'earlier' } as const
  assert.equal(resolveLocalDateTime(local), '2026-11-01T05:30:00.000Z')
  assert.equal(resolveLocalDateTime({ ...local, disambiguation: 'later' }), '2026-11-01T06:30:00.000Z')
  assert.throws(() => resolveLocalDateTime({ ...local, disambiguation: 'reject' }), RecurrenceValidationError)
  for (const localDateTime of ['2026-03-08T02:30', '2026-02-30T09:00', '2026-01-01', '2026-01-01T24:00']) {
    for (const disambiguation of ['earlier', 'later', 'reject'] as const) {
      assert.throws(() => resolveLocalDateTime({ ...local, localDateTime, disambiguation }), RecurrenceValidationError)
    }
  }
  assert.throws(() => resolveLocalDateTime({ ...local, disambiguation: undefined } as never), RecurrenceValidationError)
  assert.equal(resolveLocalDateTime({ localDateTime: '2026-01-01T09:00', timeZone: 'UTC', disambiguation: 'reject' }), '2026-01-01T09:00:00.000Z')
})

test('active weekdays and half-open windows filter anchored ticks without shifting them', () => {
  const active: RecurrenceSchedule = { ...interval, active: { weekdays: [1], window: { start: '09:00', end: '10:00' } } }
  assert.equal(nextOccurrence(active, '2026-01-04T00:00:00Z'), '2026-01-05T09:00:00.123Z')
  assert.equal(nextOccurrence(active, '2026-01-05T09:59:59Z'), '2026-01-12T09:00:00.123Z')
  assert.equal(nextOccurrence({ ...active, everyMs: 60_001 }, '2026-01-05T08:59:59Z'), '2026-01-05T09:00:06.423Z')
})

test('cross-midnight windows bind early Tuesday to Monday, including weekly calendars', () => {
  const active = { weekdays: [1] as const, window: { start: '22:00', end: '02:00' } }
  assert.equal(nextOccurrence({ ...interval, active }, '2026-01-05T23:59:59Z'), '2026-01-06T00:00:00.123Z')
  assert.equal(nextOccurrence({ ...interval, active }, '2026-01-06T02:00:00Z'), '2026-01-12T22:00:00.123Z')
  assert.equal(nextOccurrence({ kind: 'daily', timeZone: 'UTC', time: '01:00', active }, '2026-01-05T00:00:00Z'), '2026-01-06T01:00:00.000Z')
  assert.equal(nextOccurrence({ kind: 'weekly', timeZone: 'UTC', time: '01:00', weekdays: [2], active }, '2026-01-05T00:00:00Z'), '2026-01-06T01:00:00.000Z')
  assert.throws(() => parseRecurrenceSchedule({ kind: 'weekly', timeZone: 'UTC', time: '01:00', weekdays: [1], active }), RecurrenceValidationError)
})

test('interval filters preserve repeated window ticks, unlike once-per-date calendars', () => {
  const fold: RecurrenceSchedule = {
    kind: 'interval', timeZone: 'America/New_York', everyMs: 60_000, anchor: '2026-11-01T00:00:00Z',
    active: { window: { start: '01:00', end: '01:30' } },
  }
  assert.equal(nextOccurrence(fold, '2026-11-01T05:29:00Z'), '2026-11-01T06:00:00.000Z')
  const lordHowe: RecurrenceSchedule = {
    ...fold, timeZone: 'Australia/Lord_Howe', anchor: '2026-04-04T00:00:00Z',
    active: { window: { start: '01:30', end: '01:45' } },
  }
  assert.equal(nextOccurrence(lordHowe, '2026-04-04T14:44:00Z'), '2026-04-04T15:00:00.000Z')
})

test('interval filters skip spring gaps without inventing wall-clock ticks', () => {
  const gap: RecurrenceSchedule = {
    kind: 'interval', timeZone: 'America/New_York', everyMs: 60_000, anchor: '2026-03-01T00:00:00Z',
    active: { window: { start: '02:15', end: '02:45' } },
  }
  assert.equal(nextOccurrence(gap, '2026-03-08T06:59:00Z'), '2026-03-09T06:15:00.000Z')
})

test('calendar gaps include skipped civil dates and monthly/weekly DST occurrences', () => {
  assert.equal(nextOccurrence({ kind: 'daily', timeZone: 'Pacific/Apia', time: '09:00' }, '2011-12-29T19:00:00Z'), '2011-12-30T19:00:00.000Z')
  assert.equal(nextOccurrence({ kind: 'monthly', timeZone: 'America/New_York', time: '02:30', dayOfMonth: 8 }, '2026-03-01T00:00:00Z'), '2026-04-08T06:30:00.000Z')
  assert.equal(nextOccurrence({ kind: 'weekly', timeZone: 'America/New_York', time: '02:30', weekdays: [7] }, '2026-03-01T07:30:00Z'), '2026-03-15T06:30:00.000Z')
})

test('active-period jumps agree with an independent minute-tick enumeration across transitions', () => {
  const fixtures = [
    { timeZone: 'UTC', anchor: '2026-01-04T00:00:00Z' },
    { timeZone: 'America/New_York', anchor: '2026-03-08T00:00:00Z' },
    { timeZone: 'America/New_York', anchor: '2026-11-01T00:00:00Z' },
    { timeZone: 'Australia/Lord_Howe', anchor: '2026-04-04T12:00:00Z' },
    { timeZone: 'Australia/Lord_Howe', anchor: '2026-10-03T12:00:00Z' },
    { timeZone: 'America/Havana', anchor: '2026-11-01T00:00:00Z' },
    { timeZone: 'Pacific/Apia', anchor: '2011-12-29T00:00:00Z' },
  ]
  const windows = [
    { start: '00:00', end: '00:30' }, { start: '01:30', end: '01:45' },
    { start: '02:15', end: '02:45' }, { start: '22:00', end: '02:00' },
  ]
  const isoDays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  for (const fixture of fixtures) {
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: fixture.timeZone, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    for (const window of windows) {
      for (const everyMs of [60_001, 3_600_000]) {
        const after = Date.parse(fixture.anchor) + 5 * 3_600_000
        const anchor = Date.parse(fixture.anchor)
        const schedule: RecurrenceSchedule = { kind: 'interval', ...fixture, everyMs, active: { weekdays: [1, 2, 3, 4, 5, 6, 7], window } }
        let expected: string | undefined
        for (let tick = anchor + (Math.floor((after - anchor) / everyMs) + 1) * everyMs; tick < after + 4 * 86_400_000; tick += everyMs) {
          const parts = formatter.formatToParts(tick)
          const read = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
          const clock = `${read('hour')}:${read('minute')}`
          const weekday = isoDays[read('weekday')]
          assert.ok(weekday)
          if (window.start < window.end ? clock >= window.start && clock < window.end : clock >= window.start || clock < window.end) {
            expected = new Date(tick).toISOString()
            break
          }
        }
        // Hourly phases can miss a narrow window forever; those belong to the
        // explicit search-limit tests. Compare every reachable oracle result.
        if (expected) assert.equal(nextOccurrence(schedule, new Date(after).toISOString()), expected, JSON.stringify({ fixture, window, everyMs }))
      }
    }
  }
})

test('search budget is explicit and impossible interval phase never looks exhausted', () => {
  const excluded: RecurrenceSchedule = {
    kind: 'interval', timeZone: 'UTC', everyMs: 86_400_000, anchor: '2026-01-01T12:00:00Z',
    active: { window: { start: '13:00', end: '14:00' } },
  }
  assert.throws(() => nextOccurrence(excluded, '2026-01-01T00:00:00Z', { maxCandidates: 10 }), RecurrenceSearchLimitError)
  assert.throws(() => nextOccurrence(interval, interval.anchor, { maxCandidates: 0 }), RecurrenceValidationError)
})

test('restart coalesces once and advances decades of missed minute ticks arithmetically', () => {
  const schedule: RecurrenceSchedule = { ...interval, everyMs: 60_000 }
  const cursor = { nextAt: interval.anchor }
  const result = advanceRecurrence(schedule, cursor, '2096-01-01T00:00:30Z', 'coalesce', { maxCandidates: 1 })
  assert.deepEqual(result, { dueAt: interval.anchor, nextAt: '2096-01-01T00:01:00.123Z' })
  assert.deepEqual(advanceRecurrence(schedule, result, '2096-01-01T00:00:30Z', 'coalesce', { maxCandidates: 1 }), { dueAt: null, nextAt: result.nextAt })
  assert.deepEqual(cursor, { nextAt: interval.anchor })
})

test('skip drops overdue work, retains exact-now occurrence; future and null cursors stay idle', () => {
  const cursor = { nextAt: interval.anchor }
  assert.deepEqual(advanceRecurrence(interval, cursor, '2026-01-01T01:01:00Z', 'skip'), { dueAt: null, nextAt: '2026-01-01T01:05:00.123Z' })
  assert.deepEqual(advanceRecurrence(interval, cursor, '2026-01-01T01:00:00.123Z', 'skip'), { dueAt: '2026-01-01T01:00:00.123Z', nextAt: '2026-01-01T01:05:00.123Z' })
  assert.deepEqual(advanceRecurrence(interval, cursor, '2026-01-01T00:00:00Z', 'skip'), { dueAt: null, nextAt: interval.anchor })
  assert.deepEqual(advanceRecurrence(interval, { nextAt: null }, '2026-01-01T00:00:00Z', 'coalesce'), { dueAt: null, nextAt: null })
})

test('missed once and calendar schedules never produce a backlog or drift across DST', () => {
  const once: RecurrenceSchedule = { kind: 'once', timeZone: 'UTC', at: '2026-01-01T00:00:00Z' }
  assert.deepEqual(advanceRecurrence(once, { nextAt: once.at }, '2026-01-02T00:00:00Z', 'coalesce'), { dueAt: '2026-01-01T00:00:00.000Z', nextAt: null })
  assert.deepEqual(advanceRecurrence(once, { nextAt: once.at }, '2026-01-02T00:00:00Z', 'skip'), { dueAt: null, nextAt: null })
  assert.deepEqual(advanceRecurrence(once, { nextAt: once.at }, once.at, 'skip'), { dueAt: '2026-01-01T00:00:00.000Z', nextAt: null })
  assert.deepEqual(advanceRecurrence(daily, { nextAt: '2026-03-07T07:30:00Z' }, '2026-03-08T20:00:00Z', 'coalesce'), {
    dueAt: '2026-03-07T07:30:00.000Z', nextAt: '2026-03-09T06:30:00.000Z',
  })
})

test('cursor edits, invalid clocks, policies and filtered or off-anchor timestamps fail closed', () => {
  assert.throws(() => advanceRecurrence(interval, { nextAt: '2026-01-01T00:00:00Z' }, interval.anchor, 'skip'), RecurrenceValidationError)
  assert.throws(() => advanceRecurrence(interval, { nextAt: interval.anchor }, 'invalid', 'skip'), RecurrenceValidationError)
  assert.throws(() => advanceRecurrence(interval, { nextAt: null }, interval.anchor, 'catch-up' as never), RecurrenceValidationError)
  assert.throws(() => advanceRecurrence(interval, {} as never, interval.anchor, 'skip'), RecurrenceValidationError)
  assert.throws(() => advanceRecurrence({ ...interval, active: { weekdays: [1] } }, { nextAt: interval.anchor }, '2026-01-02T00:00:00Z', 'coalesce'), RecurrenceValidationError)
})
