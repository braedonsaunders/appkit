import { computeNextRunAt } from './cadence'
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
  return computeNextRunAt({
    cadence: schedule.cadence,
    dayOfWeek: schedule.dayOfWeek,
    dayOfMonth: schedule.dayOfMonth,
    weekOfMonth: schedule.weekOfMonth,
    repeatEvery: schedule.repeatEvery,
    hour: schedule.hour,
    minute: schedule.minute,
    timezone: schedule.timezone,
    startsOn: schedule.startsOn,
    endsOn: schedule.endsOn,
  }, from)
}
