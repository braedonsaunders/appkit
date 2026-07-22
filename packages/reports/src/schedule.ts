import { computeNextRunAt } from './cadence'
import {
  assertBoundedReportFilters,
  assertReportRecipientLimit,
  normalizeReportRecipientEmails,
  normalizeReportRecipientUserIds,
  REPORT_SCHEDULE_LIMITS,
} from './schedule-policy'
import type { ReportSchedule } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateReportSchedule(schedule: ReportSchedule): string[] {
  const errors: string[] = []
  if (!schedule.id.trim() || !schedule.definitionId.trim() || !schedule.name.trim()) errors.push('Schedule identity and name are required')
  if (schedule.name.length > REPORT_SCHEDULE_LIMITS.nameChars) errors.push('Schedule name is too long')
  if (!['daily', 'weekly', 'monthly'].includes(schedule.cadence)) errors.push('Cadence must be daily, weekly, or monthly')
  if (!Number.isInteger(schedule.hour) || schedule.hour < 0 || schedule.hour > 23) errors.push('Hour must be between 0 and 23')
  if (!Number.isInteger(schedule.minute) || schedule.minute < 0 || schedule.minute > 59) errors.push('Minute must be between 0 and 59')
  if (schedule.cadence === 'weekly' && (!Number.isInteger(schedule.dayOfWeek) || schedule.dayOfWeek! < 0 || schedule.dayOfWeek! > 6)) errors.push('Weekly schedules require dayOfWeek 0 through 6')
  if (schedule.cadence === 'monthly' && schedule.weekOfMonth == null && (!Number.isInteger(schedule.dayOfMonth) || schedule.dayOfMonth! < 1 || schedule.dayOfMonth! > 31)) errors.push('Monthly schedules require dayOfMonth 1 through 31 or weekOfMonth')
  if (schedule.cadence === 'monthly' && schedule.weekOfMonth != null) {
    if (!Number.isInteger(schedule.weekOfMonth) || schedule.weekOfMonth < 1 || schedule.weekOfMonth > 5) errors.push('weekOfMonth must be between 1 and 5')
    if (!Number.isInteger(schedule.dayOfWeek) || schedule.dayOfWeek! < 0 || schedule.dayOfWeek! > 6) errors.push('Monthly weekday schedules require dayOfWeek 0 through 6')
  }
  if (schedule.repeatEvery !== undefined && (!Number.isInteger(schedule.repeatEvery) || schedule.repeatEvery < 1 || schedule.repeatEvery > 999)) errors.push('repeatEvery must be between 1 and 999')
  if (schedule.startsOn && !DATE_RE.test(schedule.startsOn)) errors.push('startsOn must use YYYY-MM-DD')
  if (schedule.endsOn && !DATE_RE.test(schedule.endsOn)) errors.push('endsOn must use YYYY-MM-DD')
  if (schedule.startsOn && schedule.endsOn && schedule.startsOn > schedule.endsOn) errors.push('startsOn must be on or before endsOn')
  try { new Intl.DateTimeFormat('en-US', { timeZone: schedule.timezone }).format() } catch { errors.push('Timezone must be a valid IANA timezone') }
  try {
    normalizeReportRecipientUserIds(schedule.recipientUserIds)
    normalizeReportRecipientEmails(schedule.recipientEmails)
    assertReportRecipientLimit(schedule.recipientUserIds, schedule.recipientEmails)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Schedule recipients are invalid')
  }
  try { assertBoundedReportFilters(schedule.filters) } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Schedule filters are invalid')
  }
  if ((schedule.emailSubject?.length ?? 0) > REPORT_SCHEDULE_LIMITS.emailSubjectChars) errors.push('Email subject is too long')
  if ((schedule.emailMessage?.length ?? 0) > REPORT_SCHEDULE_LIMITS.emailMessageChars) errors.push('Email message is too long')
  if (schedule.emailSubject && /[\r\n\u0000-\u001f\u007f]/.test(schedule.emailSubject)) errors.push('Email subject contains invalid control characters')
  return errors
}

export function computeNextReportRun(schedule: ReportSchedule, from = new Date()): Date | null {
  const errors = validateReportSchedule(schedule)
  if (errors.length) throw new Error(errors.join('; '))
  if (!schedule.active) return null
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

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const ORDINALS = ['first', 'second', 'third', 'fourth', 'last'] as const

export function describeReportSchedule(schedule: Pick<ReportSchedule, 'cadence' | 'repeatEvery' | 'dayOfWeek' | 'dayOfMonth' | 'weekOfMonth' | 'hour' | 'minute' | 'timezone'>): string {
  const interval = Math.max(1, schedule.repeatEvery || 1)
  const time = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`
  const suffix = `at ${time} ${schedule.timezone}`
  if (schedule.cadence === 'daily') return `${interval === 1 ? 'Daily' : `Every ${interval} days`} ${suffix}`
  const weekday = WEEKDAYS[schedule.dayOfWeek ?? 1] ?? WEEKDAYS[1]
  if (schedule.cadence === 'weekly') return `${interval === 1 ? `Every ${weekday}` : `Every ${interval} weeks on ${weekday}`} ${suffix}`
  if (schedule.weekOfMonth) return `${interval === 1 ? 'Monthly' : `Every ${interval} months`} on the ${ORDINALS[schedule.weekOfMonth - 1]} ${weekday} ${suffix}`
  return `${interval === 1 ? 'Monthly' : `Every ${interval} months`} on day ${schedule.dayOfMonth ?? 1} ${suffix}`
}

export function reportScheduleRecipientCount(schedule: Pick<ReportSchedule, 'recipientUserIds' | 'recipientEmails'>): number {
  return schedule.recipientUserIds.length + schedule.recipientEmails.length
}
