/**
 * Calendar-day arithmetic for schedules.
 *
 * Every date this module produces is normalized to local noon. A schedule bar
 * is a calendar-day range, and noon is the one instant per day that survives
 * both DST transitions and `toLocaleDateString` without sliding into the
 * neighbouring day — the difference between a plan that reads "Mar 10" and one
 * that silently renders "Mar 9" for half the world.
 */

import type { ScheduleCalendar } from './types'

export const MS_PER_DAY = 86_400_000

function createCalendarDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0)
}

export function normalizeCalendarDate(date: Date) {
  return createCalendarDate(date.getFullYear(), date.getMonth(), date.getDate())
}

export function startOfNextMonth(date: Date) {
  return createCalendarDate(date.getFullYear(), date.getMonth() + 1, 1)
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`
}

export function yearKey(date: Date) {
  return `${date.getFullYear()}`
}

/** Mon–Fri. The default every planning tool starts from. */
const DEFAULT_WORKING_DAYS: Record<string, boolean> = {
  '0': false,
  '1': true,
  '2': true,
  '3': true,
  '4': true,
  '5': true,
  '6': false,
}

function getCalendarWorkingDays(calendar?: ScheduleCalendar | null) {
  return calendar?.workingDays && Object.keys(calendar.workingDays).length > 0
    ? calendar.workingDays
    : DEFAULT_WORKING_DAYS
}

export function isNonWorkingDay(date: Date, calendar?: ScheduleCalendar | null) {
  const normalized = normalizeCalendarDate(date)
  if (calendar?.holidays?.includes(formatISODate(normalized))) return true
  const day = String(normalized.getDay())
  return getCalendarWorkingDays(calendar)[day] === false
}

export function isWorkingDay(date: Date, calendar?: ScheduleCalendar | null) {
  return !isNonWorkingDay(date, calendar)
}

export function todayDate() {
  return normalizeCalendarDate(new Date())
}

export function addDays(date: Date, days: number) {
  const next = normalizeCalendarDate(date)
  next.setDate(next.getDate() + days)
  next.setHours(12, 0, 0, 0)
  return next
}

/** Whole calendar days between two dates (a − b), DST-safe. */
export function diffDays(a: Date, b: Date) {
  const aMidnight = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const bMidnight = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((aMidnight - bMidnight) / MS_PER_DAY)
}

/**
 * Advance by `days` WORKING days on `calendar`. Non-working days are skipped
 * rather than counted, which is what "3 days of work" means to a scheduler.
 */
export function addWorkingDays(date: Date, days: number, calendar?: ScheduleCalendar | null) {
  if (days === 0) return normalizeCalendarDate(date)
  const step = days > 0 ? 1 : -1
  let remaining = Math.abs(days)
  let cursor = normalizeCalendarDate(date)
  // Bounded so a calendar with every day non-working can never spin forever.
  let guard = Math.abs(days) * 7 + 366
  while (remaining > 0 && guard > 0) {
    cursor = addDays(cursor, step)
    if (isWorkingDay(cursor, calendar)) remaining -= 1
    guard -= 1
  }
  return cursor
}

/** The next working day at or after `date`. */
export function nextWorkingDay(date: Date, calendar?: ScheduleCalendar | null) {
  let cursor = normalizeCalendarDate(date)
  let guard = 366
  while (!isWorkingDay(cursor, calendar) && guard > 0) {
    cursor = addDays(cursor, 1)
    guard -= 1
  }
  return cursor
}

/** Working days in `[start, end)`, or 1 for a same-day/zero-length span. */
export function countWorkingDays(start: Date, end: Date, calendar?: ScheduleCalendar | null) {
  if (end.getTime() <= start.getTime()) return isWorkingDay(start, calendar) ? 1 : 0
  let count = 0
  for (
    let cursor = normalizeCalendarDate(start);
    cursor.getTime() < end.getTime();
    cursor = addDays(cursor, 1)
  ) {
    if (isWorkingDay(cursor, calendar)) count += 1
  }
  return count
}

export function formatISODate(date: Date) {
  const normalized = normalizeCalendarDate(date)
  return `${normalized.getFullYear()}-${padDatePart(normalized.getMonth() + 1)}-${padDatePart(normalized.getDate())}`
}

export function startOfWeek(date: Date) {
  const normalized = normalizeCalendarDate(date)
  return addDays(normalized, -normalized.getDay())
}

export function startOfMonth(date: Date) {
  return createCalendarDate(date.getFullYear(), date.getMonth(), 1)
}

/** Parse `YYYY-MM-DD` (or anything `Date` accepts) into a noon-normalized date. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null

  const trimmed = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (match) {
    return createCalendarDate(
      Number.parseInt(match[1] as string, 10),
      Number.parseInt(match[2] as string, 10) - 1,
      Number.parseInt(match[3] as string, 10),
    )
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return normalizeCalendarDate(parsed)
}

export function snapToDay(ms: number) {
  return normalizeCalendarDate(new Date(ms))
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/**
 * Timeline header/label formatting. Hosts pass their own locale (and may pass
 * their own formatters entirely) — nothing here hardcodes English.
 */
export interface ScheduleDateFormatters {
  shortDate: (date: Date) => string
  monthYear: (date: Date) => string
  monthShort: (date: Date) => string
  weekdayShort: (date: Date) => string
}

export function createDateFormatters(locale?: string): ScheduleDateFormatters {
  const shortDate = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
  const monthYear = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' })
  const monthShort = new Intl.DateTimeFormat(locale, { month: 'short' })
  const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  return {
    shortDate: (date) => shortDate.format(normalizeCalendarDate(date)),
    monthYear: (date) => monthYear.format(normalizeCalendarDate(date)),
    monthShort: (date) => monthShort.format(normalizeCalendarDate(date)),
    weekdayShort: (date) => weekdayShort.format(normalizeCalendarDate(date)),
  }
}

/** Formatters bound to the runtime's default locale. */
export const defaultDateFormatters: ScheduleDateFormatters = createDateFormatters()

export function formatShortDate(date: Date) {
  return defaultDateFormatters.shortDate(date)
}

export function formatMonthYear(date: Date) {
  return defaultDateFormatters.monthYear(date)
}

export function formatMonthShort(date: Date) {
  return defaultDateFormatters.monthShort(date)
}

export function formatWeekdayShort(date: Date) {
  return defaultDateFormatters.weekdayShort(date)
}
