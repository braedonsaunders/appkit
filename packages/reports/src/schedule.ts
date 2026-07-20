import type { ReportSchedule } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateReportSchedule(schedule: ReportSchedule): string[] {
  const errors: string[] = []
  if (!schedule.id.trim() || !schedule.reportId.trim() || !schedule.name.trim()) errors.push('Schedule identity and name are required')
  if (!Number.isInteger(schedule.hour) || schedule.hour < 0 || schedule.hour > 23) errors.push('Hour must be between 0 and 23')
  if (!Number.isInteger(schedule.minute) || schedule.minute < 0 || schedule.minute > 59) errors.push('Minute must be between 0 and 59')
  if (schedule.cadence === 'weekly' && (!Number.isInteger(schedule.dayOfWeek) || schedule.dayOfWeek! < 0 || schedule.dayOfWeek! > 6)) errors.push('Weekly schedules require dayOfWeek 0 through 6')
  if (schedule.cadence === 'monthly' && schedule.weekOfMonth === undefined && (!Number.isInteger(schedule.dayOfMonth) || schedule.dayOfMonth! < 1 || schedule.dayOfMonth! > 31)) errors.push('Monthly schedules require dayOfMonth 1 through 31 or weekOfMonth')
  if (schedule.repeatEvery !== undefined && (!Number.isInteger(schedule.repeatEvery) || schedule.repeatEvery < 1 || schedule.repeatEvery > 999)) errors.push('repeatEvery must be between 1 and 999')
  if (schedule.startsOn && !DATE_RE.test(schedule.startsOn)) errors.push('startsOn must use YYYY-MM-DD')
  if (schedule.endsOn && !DATE_RE.test(schedule.endsOn)) errors.push('endsOn must use YYYY-MM-DD')
  if (schedule.startsOn && schedule.endsOn && schedule.startsOn > schedule.endsOn) errors.push('startsOn must be on or before endsOn')
  try { new Intl.DateTimeFormat('en-US', { timeZone: schedule.timezone }).format() } catch { errors.push('Timezone must be a valid IANA timezone') }
  return errors
}

export function computeNextReportRun(schedule: ReportSchedule, from = new Date()): Date | null {
  const errors = validateReportSchedule(schedule)
  if (errors.length) throw new Error(errors.join('; '))
  if (!schedule.enabled) return null
  const repeatEvery = schedule.repeatEvery ?? 1
  const start = zonedParts(from, schedule.timezone)
  const anchor = schedule.startsOn ?? '1970-01-04'
  for (let offset = 0; offset < 3660; offset++) {
    const date = addCalendarDays({ year: start.year, month: start.month, day: start.day }, offset)
    const key = dateKey(date)
    if (schedule.startsOn && key < schedule.startsOn) continue
    if (schedule.endsOn && key > schedule.endsOn) return null
    if (!matches(date, schedule, anchor, repeatEvery)) continue
    const candidate = zonedDateTime(date, schedule.hour, schedule.minute, schedule.timezone)
    if (candidate.getTime() > from.getTime()) return candidate
  }
  throw new Error('No report occurrence exists within ten years')
}

function matches(date: CalendarDate, schedule: ReportSchedule, anchorKey: string, repeat: number): boolean {
  const anchor = parseKey(anchorKey)
  const days = dayNumber(date) - dayNumber(anchor)
  if (days < 0) return false
  if (schedule.cadence === 'daily') return days % repeat === 0
  if (schedule.cadence === 'weekly') return weekday(date) === schedule.dayOfWeek && Math.floor(days / 7) % repeat === 0
  const months = (date.year - anchor.year) * 12 + date.month - anchor.month
  if (months < 0 || months % repeat !== 0) return false
  if (schedule.weekOfMonth !== undefined) {
    if (weekday(date) !== (schedule.dayOfWeek ?? 1)) return false
    return schedule.weekOfMonth === 5 ? date.day + 7 > daysInMonth(date.year, date.month) : Math.ceil(date.day / 7) === schedule.weekOfMonth
  }
  return date.day === schedule.dayOfMonth
}

type CalendarDate = { year: number; month: number; day: number }
const parseKey = (key: string): CalendarDate => { const [year, month, day] = key.split('-').map(Number); return { year: year!, month: month!, day: day! } }
const dateKey = (d: CalendarDate) => `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
const dayNumber = (d: CalendarDate) => Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000)
const addCalendarDays = (d: CalendarDate, n: number): CalendarDate => { const next = new Date(Date.UTC(d.year, d.month - 1, d.day + n)); return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() } }
const weekday = (d: CalendarDate) => new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

function zonedParts(date: Date, timeZone: string): CalendarDate & { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') === 24 ? 0 : get('hour'), minute: get('minute') }
}

function zonedDateTime(date: CalendarDate, hour: number, minute: number, timeZone: string): Date {
  let milliseconds = Date.UTC(date.year, date.month - 1, date.day, hour, minute)
  for (let attempt = 0; attempt < 4; attempt++) {
    const actual = zonedParts(new Date(milliseconds), timeZone)
    const wanted = Date.UTC(date.year, date.month - 1, date.day, hour, minute)
    const have = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute)
    const delta = wanted - have
    if (delta === 0) break
    milliseconds += delta
  }
  return new Date(milliseconds)
}
