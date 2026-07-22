import {
  assertBoundedReportFilters,
  assertReportRecipientLimit,
  normalizeReportRecipientEmails,
  normalizeReportRecipientUserIds,
  REPORT_SCHEDULE_LIMITS,
} from './schedule-policy'
import type { ReportSchedule } from './types'

export type ParsedReportScheduleForm = Pick<
  ReportSchedule,
  | 'definitionId'
  | 'name'
  | 'cadence'
  | 'repeatEvery'
  | 'dayOfWeek'
  | 'dayOfMonth'
  | 'weekOfMonth'
  | 'hour'
  | 'minute'
  | 'timezone'
  | 'startsOn'
  | 'endsOn'
  | 'recipientUserIds'
  | 'recipientEmails'
  | 'filters'
  | 'emailSubject'
  | 'emailMessage'
>

const CADENCES: readonly ReportSchedule['cadence'][] = ['daily', 'weekly', 'monthly']

function parseInteger(raw: FormDataEntryValue | null, fallback: number): number {
  const input = String(raw ?? '').trim()
  if (input === '') return fallback
  if (!/^-?\d+$/.test(input)) return Number.NaN
  const value = Number(input)
  return Number.isSafeInteger(value) ? value : Number.NaN
}

function parseDate(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? '').trim()
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${key} must use YYYY-MM-DD`)
  const parsed = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${key} must be a valid date`)
  return value
}

/**
 * Parses the exact shared create/edit field contract used by the production
 * schedule form. Create and update adapters should both call this function so
 * cadence, recipient, filter, timezone, date, and email validation cannot drift.
 */
export function parseReportScheduleForm(
  formData: FormData,
  options: { defaultTimezone?: string } = {},
): ParsedReportScheduleForm {
  const definitionId = String(formData.get('definitionId') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const cadence = String(formData.get('cadence') ?? '') as ReportSchedule['cadence']
  const repeatEvery = parseInteger(formData.get('repeatEvery'), 1)
  const hour = parseInteger(formData.get('hour'), 7)
  const minute = parseInteger(formData.get('minute'), 0)
  const timezone = String(formData.get('timezone') ?? '').trim() || options.defaultTimezone || 'UTC'

  if (!definitionId) throw new Error('Report definition is required')
  if (!name) throw new Error('Name is required')
  if (name.length > REPORT_SCHEDULE_LIMITS.nameChars) throw new Error('Name is too long')
  if (!CADENCES.includes(cadence)) throw new Error('Invalid cadence')
  if (!Number.isInteger(repeatEvery) || repeatEvery < 1 || repeatEvery > 999) throw new Error('Repeat interval must be a whole number between 1 and 999')
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Hour must be a whole number between 0 and 23')
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('Minute must be a whole number between 0 and 59')

  const monthlyMode = String(formData.get('monthlyMode') ?? 'day')
  if (cadence === 'monthly' && monthlyMode !== 'day' && monthlyMode !== 'weekday') throw new Error('Invalid monthly schedule mode')
  const dayOfWeek = cadence === 'weekly' || (cadence === 'monthly' && monthlyMode === 'weekday')
    ? parseInteger(formData.get('dayOfWeek'), 1)
    : null
  const dayOfMonth = cadence === 'monthly' && monthlyMode === 'day'
    ? parseInteger(formData.get('dayOfMonth'), 1)
    : null
  const weekOfMonth = cadence === 'monthly' && monthlyMode === 'weekday'
    ? parseInteger(formData.get('weekOfMonth'), 1)
    : null
  if (dayOfWeek !== null && (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) throw new Error('Day of week must be between 0 and 6')
  if (dayOfMonth !== null && (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)) throw new Error('Day of month must be between 1 and 31')
  if (weekOfMonth !== null && (!Number.isInteger(weekOfMonth) || weekOfMonth < 1 || weekOfMonth > 5)) throw new Error('Week of month must be first, second, third, fourth, or last')

  const startsOn = parseDate(formData, 'startsOn')
  const endsOn = parseDate(formData, 'endsOn')
  if (startsOn && endsOn && startsOn > endsOn) throw new Error('Start date must be on or before end date')

  try {
    if (timezone.length > REPORT_SCHEDULE_LIMITS.timezoneChars) throw new Error('too long')
    new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format()
  } catch {
    throw new Error(`Unknown timezone "${timezone}". Use an IANA timezone name.`)
  }

  const recipientEmailsRaw = String(formData.get('recipientEmails') ?? '')
  if (recipientEmailsRaw.length > REPORT_SCHEDULE_LIMITS.recipientEmailListChars) throw new Error('Recipient email list is too large')
  const recipientEmails = normalizeReportRecipientEmails(recipientEmailsRaw.split(/[\n,]/).map((value) => value.trim()).filter(Boolean))
  const recipientUserIdsRaw = String(formData.get('recipientUserIds') ?? '')
  if (recipientUserIdsRaw.length > REPORT_SCHEDULE_LIMITS.recipientUserIdListChars) throw new Error('Recipient member list is too large')
  const recipientUserIds = normalizeReportRecipientUserIds(recipientUserIdsRaw.split(/[\n,\s]+/).map((value) => value.trim()).filter(Boolean))
  assertReportRecipientLimit(recipientUserIds, recipientEmails)

  const filtersRaw = String(formData.get('filters') ?? '').trim()
  if (filtersRaw.length > REPORT_SCHEDULE_LIMITS.filtersChars) throw new Error('Report filters are too large')
  let filters: Record<string, unknown> = {}
  if (filtersRaw) {
    try {
      const parsed: unknown = JSON.parse(filtersRaw)
      assertBoundedReportFilters(parsed)
      filters = parsed
    } catch (error) {
      throw new Error(`Invalid filters JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const emailSubjectValue = String(formData.get('emailSubject') ?? '').trim()
  const emailMessageValue = String(formData.get('emailMessage') ?? '').trim()
  if (emailSubjectValue.length > REPORT_SCHEDULE_LIMITS.emailSubjectChars) throw new Error('Email subject is too long')
  if (emailMessageValue.length > REPORT_SCHEDULE_LIMITS.emailMessageChars) throw new Error('Email message is too long')
  if (/[\r\n\u0000-\u001f\u007f]/.test(emailSubjectValue)) throw new Error('Email subject contains invalid control characters')

  return {
    definitionId,
    name,
    cadence,
    repeatEvery,
    dayOfWeek,
    dayOfMonth,
    weekOfMonth: weekOfMonth as ReportSchedule['weekOfMonth'],
    hour,
    minute,
    timezone,
    startsOn,
    endsOn,
    recipientUserIds,
    recipientEmails,
    filters,
    emailSubject: emailSubjectValue || null,
    emailMessage: emailMessageValue || null,
  }
}
