import { Temporal } from '@js-temporal/polyfill'
import type {
  LocalDateTimeInput, MissedRunPolicy, RecurrenceActivePeriod, RecurrenceAdvance,
  RecurrenceCursor, RecurrenceSchedule, RecurrenceSearchOptions, Weekday,
} from './recurrence-types'

export type {
  LocalDateTimeInput, MissedRunPolicy, RecurrenceActivePeriod, RecurrenceAdvance,
  RecurrenceCursor, RecurrenceSchedule, RecurrenceSearchOptions, Weekday,
} from './recurrence-types'

export class RecurrenceValidationError extends Error {
  override readonly name = 'RecurrenceValidationError'
  constructor(readonly field: string, message: string) {
    super(`${field}: ${message}`)
  }
}

/** An explicit failure to find an occurrence within a work budget, not exhaustion. */
export class RecurrenceSearchLimitError extends Error {
  override readonly name = 'RecurrenceSearchLimitError'
  constructor(readonly maxCandidates: number) {
    super(`Recurrence search exceeded ${maxCandidates} candidates; revise the active period or increase maxCandidates.`)
  }
}

function invalid(field: string, message: string): never {
  throw new RecurrenceValidationError(field, message)
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field, 'must be an object')
  return value as Record<string, unknown>
}

function keys(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) invalid(`${field}.${key}`, 'unknown field')
  }
}

function time(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    invalid(field, 'must be a valid HH:mm local time')
  }
  return value
}

function zone(value: unknown, field = 'timeZone'): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9._+/-]{0,99}$/.test(value)) {
    invalid(field, 'must be a named IANA timezone')
  }
  try {
    return Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(value).timeZoneId
  } catch {
    return invalid(field, 'must be a named IANA timezone')
  }
}

// Deliberately narrower than Temporal: no annotations, leap seconds, local-only
// dates, or sub-millisecond values that could be silently rounded in persistence.
const INSTANT = /^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/

function instant(value: unknown, field: string): Temporal.Instant {
  if (typeof value !== 'string' || !INSTANT.test(value)) invalid(field, 'must be an ISO instant with Z or offset and millisecond precision')
  try {
    return Temporal.Instant.from(value)
  } catch {
    return invalid(field, 'must be a valid ISO instant')
  }
}

function iso(value: Temporal.Instant): string {
  return value.toString({ smallestUnit: 'millisecond' })
}

function weekdays(value: unknown, field: string): Weekday[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 7 ||
      [...value].some((day) => !Number.isInteger(day) || day < 1 || day > 7) || new Set(value).size !== value.length) {
    invalid(field, 'must contain unique ISO weekdays from 1 to 7, and cannot be empty')
  }
  return [...value].sort((a, b) => a - b) as Weekday[]
}

function activePeriod(value: unknown): RecurrenceActivePeriod {
  const input = object(value, 'active')
  keys(input, ['weekdays', 'window'], 'active')
  if (input.weekdays === undefined && input.window === undefined) invalid('active', 'must specify weekdays or a window')
  const result: RecurrenceActivePeriod = {}
  if (input.weekdays !== undefined) result.weekdays = weekdays(input.weekdays, 'active.weekdays')
  if (input.window !== undefined) {
    const window = object(input.window, 'active.window')
    keys(window, ['start', 'end'], 'active.window')
    const start = time(window.start, 'active.window.start')
    const end = time(window.end, 'active.window.end')
    if (start === end) invalid('active.window', 'start and end must differ; omit the window for a full day')
    result.window = { start, end }
  }
  return result
}

function insideWindow(localTime: string, active?: RecurrenceActivePeriod): boolean {
  const window = active?.window
  if (!window) return true
  return window.start < window.end
    ? localTime >= window.start && localTime < window.end
    : localTime >= window.start || localTime < window.end
}

function ownerWeekday(day: number, localTime: string, active?: RecurrenceActivePeriod): Weekday {
  const window = active?.window
  return (window && window.start > window.end && localTime < window.end ? (day + 5) % 7 + 1 : day) as Weekday
}

/** Strict parsing of persisted/HTTP JSON; returns an independent normalized copy.
 * Invalid and statically impossible calendar filters fail before searching. */
export function parseRecurrenceSchedule(value: unknown): RecurrenceSchedule {
  const input = object(value, 'schedule')
  const base = {
    timeZone: zone(input.timeZone),
    ...(input.active === undefined ? {} : { active: activePeriod(input.active) }),
  }
  if (!['interval', 'once', 'daily', 'weekly', 'monthly'].includes(String(input.kind))) {
    invalid('kind', 'must be interval, once, daily, weekly, or monthly')
  }
  const common = ['kind', 'timeZone', 'active']
  if (input.kind === 'interval') {
    keys(input, [...common, 'everyMs', 'anchor'], 'schedule')
    if (typeof input.everyMs !== 'number' || !Number.isSafeInteger(input.everyMs) || input.everyMs < 60_000) {
      invalid('everyMs', 'must be a safe integer of at least 60000 milliseconds')
    }
    return { ...base, kind: 'interval', everyMs: input.everyMs, anchor: iso(instant(input.anchor, 'anchor')) }
  }
  if (input.kind === 'once') {
    keys(input, [...common, 'at'], 'schedule')
    return { ...base, kind: 'once', at: iso(instant(input.at, 'at')) }
  }
  const clockTime = time(input.time, 'time')
  if (!insideWindow(clockTime, base.active)) invalid('active.window', 'excludes the calendar occurrence time')
  if (input.kind === 'daily') {
    keys(input, [...common, 'time'], 'schedule')
    return { ...base, kind: 'daily', time: clockTime }
  }
  if (input.kind === 'weekly') {
    keys(input, [...common, 'time', 'weekdays'], 'schedule')
    const days = weekdays(input.weekdays, 'weekdays')
    if (base.active?.weekdays && !days.some((day) => base.active?.weekdays?.includes(ownerWeekday(day, clockTime, base.active)))) {
      invalid('active.weekdays', 'excludes every weekly occurrence')
    }
    return { ...base, kind: 'weekly', time: clockTime, weekdays: days }
  }
  if (input.kind === 'monthly') {
    keys(input, [...common, 'time', 'dayOfMonth'], 'schedule')
    if (input.dayOfMonth !== 'last' && (typeof input.dayOfMonth !== 'number' || !Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31)) {
      invalid('dayOfMonth', 'must be 1 through 31 or last')
    }
    return { ...base, kind: 'monthly', time: clockTime, dayOfMonth: input.dayOfMonth }
  }
  return invalid('kind', 'must be interval, once, daily, weekly, or monthly')
}

/** Convert a UI wall-clock input explicitly. Gaps reject; folds require a choice. */
export function resolveLocalDateTime(input: LocalDateTimeInput): string {
  const value = object(input, 'localDateTime')
  keys(value, ['localDateTime', 'timeZone', 'disambiguation'], 'localDateTime')
  const timeZone = zone(value.timeZone)
  if (value.disambiguation !== 'earlier' && value.disambiguation !== 'later' && value.disambiguation !== 'reject') {
    invalid('disambiguation', 'must explicitly select earlier, later, or reject')
  }
  if (typeof value.localDateTime !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.localDateTime)) {
    invalid('localDateTime', 'must be a valid YYYY-MM-DDTHH:mm')
  }
  try {
    const local = Temporal.PlainDateTime.from(value.localDateTime, { overflow: 'reject' })
    const resolved = local.toZonedDateTime(timeZone, { disambiguation: value.disambiguation })
    if (!resolved.toPlainDateTime().equals(local)) invalid('localDateTime', 'does not exist in this timezone')
    return iso(resolved.toInstant())
  } catch (error) {
    if (error instanceof RecurrenceValidationError) throw error
    return invalid('localDateTime', 'invalid date or ambiguous local time; choose an explicit occurrence')
  }
}

function allowed(zoned: Temporal.ZonedDateTime, active?: RecurrenceActivePeriod): boolean {
  const localTime = `${String(zoned.hour).padStart(2, '0')}:${String(zoned.minute).padStart(2, '0')}`
  return insideWindow(localTime, active) && (!active?.weekdays || active.weekdays.includes(ownerWeekday(zoned.dayOfWeek, localTime, active)))
}

function budget(options: RecurrenceSearchOptions): number {
  const limit = options.maxCandidates ?? 10_000
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000_000) invalid('maxCandidates', 'must be an integer from 1 to 1000000')
  return limit
}

function ceilDiv(value: bigint, divisor: bigint): bigint {
  return value <= 0n ? 0n : (value + divisor - 1n) / divisor
}

/** A safe lower bound for the next active period, capped at any intervening
 * timezone transition so folds (including midnight folds) cannot hide ticks. */
function activeLowerBound(zoned: Temporal.ZonedDateTime, active: RecurrenceActivePeriod): number {
  const date = zoned.toPlainDate()
  const window = active.window
  const localTime = `${String(zoned.hour).padStart(2, '0')}:${String(zoned.minute).padStart(2, '0')}`
  let boundary: Temporal.ZonedDateTime
  if (window && localTime < window.start) {
    boundary = date.toPlainDateTime(window.start).toZonedDateTime(zoned.timeZoneId, { disambiguation: 'earlier' })
  } else {
    boundary = date.add({ days: 1 }).toZonedDateTime(zoned.timeZoneId)
  }
  const transition = zoned.getTimeZoneTransition('next')
  return Math.min(boundary.epochMilliseconds, transition?.epochMilliseconds ?? Infinity)
}

function nextParsed(schedule: RecurrenceSchedule, after: Temporal.Instant, limit: number): string | null {
  if (schedule.kind === 'once') {
    const at = instant(schedule.at, 'at')
    return Temporal.Instant.compare(at, after) > 0 && allowed(at.toZonedDateTimeISO(schedule.timeZone), schedule.active) ? iso(at) : null
  }
  if (schedule.kind === 'interval') {
    const anchor = BigInt(instant(schedule.anchor, 'anchor').epochMilliseconds)
    const step = BigInt(schedule.everyMs)
    let index = ceilDiv(BigInt(after.epochMilliseconds) + 1n - anchor, step)
    for (let attempt = 0; attempt < limit; attempt++) {
      const candidate = Temporal.Instant.fromEpochNanoseconds((anchor + index * step) * 1_000_000n)
      if (!schedule.active) return iso(candidate)
      const zoned = candidate.toZonedDateTimeISO(schedule.timeZone)
      if (allowed(zoned, schedule.active)) return iso(candidate)
      const lower = BigInt(activeLowerBound(zoned, schedule.active))
      const jump = ceilDiv(lower - anchor, step)
      index = jump > index ? jump : index + 1n
    }
    throw new RecurrenceSearchLimitError(limit)
  }
  let date = after.toZonedDateTimeISO(schedule.timeZone).toPlainDate()
  // Monthly iteration is by month, never by elapsed days; 31st skips short months.
  if (schedule.kind === 'monthly') date = date.with({ day: 1 })
  for (let attempt = 0; attempt < limit; attempt++) {
    const day = schedule.kind === 'monthly'
      ? schedule.dayOfMonth === 'last' ? date.daysInMonth : schedule.dayOfMonth
      : date.day
    if (day <= date.daysInMonth && (schedule.kind !== 'weekly' || schedule.weekdays.includes(date.dayOfWeek as Weekday))) {
      const local = date.with({ day }, { overflow: 'reject' }).toPlainDateTime(schedule.time)
      const candidate = local.toZonedDateTime(schedule.timeZone, { disambiguation: 'earlier' })
      // 'earlier' chooses a fold once. Its gap adjustment does NOT round-trip.
      if (candidate.toPlainDateTime().equals(local) && Temporal.Instant.compare(candidate.toInstant(), after) > 0 && allowed(candidate, schedule.active)) {
        return iso(candidate.toInstant())
      }
    }
    date = date.add(schedule.kind === 'monthly' ? { months: 1 } : { days: 1 })
  }
  throw new RecurrenceSearchLimitError(limit)
}

/** Next valid occurrence strictly after the supplied instant. Pure: no implicit
 * clock, transport, timers, storage, process state, or global Temporal mutation. */
export function nextOccurrence(schedule: RecurrenceSchedule, after: string, options: RecurrenceSearchOptions = {}): string | null {
  return nextParsed(parseRecurrenceSchedule(schedule), instant(after, 'after'), budget(options))
}

/** Consume the persisted next occurrence and jump beyond now without a backlog.
 * Skip drops strictly overdue work; an exact-now occurrence remains due.
 * Coalesce emits the oldest persisted due instant once. A null cursor stays null.
 * The host must atomically persist nextAt with its run claim to prevent duplicates. */
export function advanceRecurrence(
  schedule: RecurrenceSchedule,
  cursor: RecurrenceCursor,
  now: string,
  policy: MissedRunPolicy,
  options: RecurrenceSearchOptions = {},
): RecurrenceAdvance {
  const parsed = parseRecurrenceSchedule(schedule)
  const current = instant(now, 'now')
  const limit = budget(options)
  if (policy !== 'skip' && policy !== 'coalesce') invalid('policy', 'must be skip or coalesce')
  const input = object(cursor, 'cursor')
  if (input.nextAt === null) return { dueAt: null, nextAt: null }
  const next = instant(input.nextAt, 'cursor.nextAt')
  // Fail closed on stale cursors after schedule edits, including filtered ticks.
  if (nextParsed(parsed, next.subtract({ milliseconds: 1 }), limit) !== iso(next)) {
    invalid('cursor.nextAt', 'must be an occurrence of this schedule; reinitialize after editing')
  }
  if (Temporal.Instant.compare(next, current) > 0) return { dueAt: null, nextAt: iso(next) }
  const nextAt = nextParsed(parsed, current, limit)
  const atNow = nextParsed(parsed, current.subtract({ milliseconds: 1 }), limit) === iso(current)
  return { dueAt: policy === 'coalesce' ? iso(next) : atNow ? iso(current) : null, nextAt }
}
