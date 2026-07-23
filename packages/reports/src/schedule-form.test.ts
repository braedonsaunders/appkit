import assert from 'node:assert/strict'
import test from 'node:test'
import { REPORT_SCHEDULE_LIMITS } from './schedule-policy'
import { parseReportScheduleForm } from './schedule-form'

function scheduleForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData()
  const values = {
    definitionId: 'report-1',
    name: 'Weekly report',
    cadence: 'weekly',
    dayOfWeek: '1',
    hour: '7',
    minute: '30',
    timezone: 'America/Toronto',
    recipientUserIds: 'user_1,user_1,user_2',
    recipientEmails: ' Team@Example.com, team@example.com ',
    filters: '{"combinator":"and","rules":[{"field":"status","op":"eq","value":"active"}]}',
    ...overrides,
  }
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

test('schedule create and edit use one normalized production field contract', () => {
  assert.deepEqual(parseReportScheduleForm(scheduleForm()), {
    definitionId: 'report-1', name: 'Weekly report', cadence: 'weekly', repeatEvery: 1,
    dayOfWeek: 1, dayOfMonth: null, weekOfMonth: null, hour: 7, minute: 30,
    timezone: 'America/Toronto', startsOn: null, endsOn: null,
    recipientUserIds: ['user_1', 'user_2'], recipientEmails: ['team@example.com'],
    filters: { combinator: 'and', rules: [{ field: 'status', op: 'eq', value: 'active' }] }, emailSubject: null, emailMessage: null,
  })
})

test('nth-weekday schedules, date bounds, and custom delivery copy are preserved', () => {
  assert.deepEqual(parseReportScheduleForm(scheduleForm({ cadence: 'monthly', monthlyMode: 'weekday', repeatEvery: '2', weekOfMonth: '5', dayOfWeek: '1', startsOn: '2026-01-01', endsOn: '2027-12-31', emailSubject: 'Monthly report', emailMessage: 'Review before the meeting.' })), {
    definitionId: 'report-1', name: 'Weekly report', cadence: 'monthly', repeatEvery: 2,
    dayOfWeek: 1, dayOfMonth: null, weekOfMonth: 5, hour: 7, minute: 30,
    timezone: 'America/Toronto', startsOn: '2026-01-01', endsOn: '2027-12-31',
    recipientUserIds: ['user_1', 'user_2'], recipientEmails: ['team@example.com'],
    filters: { combinator: 'and', rules: [{ field: 'status', op: 'eq', value: 'active' }] }, emailSubject: 'Monthly report', emailMessage: 'Review before the meeting.',
  })
})

test('malformed cadence fields, timezones, dates, and delivery content fail closed', () => {
  assert.throws(() => parseReportScheduleForm(scheduleForm({ hour: '0x10' })), /Hour/)
  assert.throws(() => parseReportScheduleForm(scheduleForm({ dayOfWeek: '7' })), /Day of week/)
  assert.throws(() => parseReportScheduleForm(scheduleForm({ timezone: 'Moon/Base' })), /Unknown timezone/)
  assert.throws(() => parseReportScheduleForm(scheduleForm({ cadence: 'quarterly' })), /cadence/)
  assert.throws(() => parseReportScheduleForm(scheduleForm({ startsOn: '2026-02-30' })), /valid date/)
  assert.throws(() => parseReportScheduleForm(scheduleForm({ emailSubject: 'bad\nsubject' })), /control/)
})

test('recipient and filter limits use the production bounds', () => {
  assert.throws(() => parseReportScheduleForm(scheduleForm({ recipientEmails: 'not-an-email' })), /Invalid/)
  assert.throws(() => parseReportScheduleForm(scheduleForm({ recipientUserIds: 'u'.repeat(REPORT_SCHEDULE_LIMITS.recipientUserIdChars + 1) })), /identifier/)
  assert.throws(() => parseReportScheduleForm(scheduleForm({ recipientEmails: Array.from({ length: REPORT_SCHEDULE_LIMITS.recipientCount + 1 }, (_, index) => `person${index}@example.com`).join(','), recipientUserIds: '' })), /at most/)
  assert.throws(() => parseReportScheduleForm(scheduleForm({ filters: '{"__proto__":true}' })), /invalid key/)
  assert.throws(() => parseReportScheduleForm(scheduleForm({ filters: `{"value":"${'x'.repeat(70_000)}"}` })), /too large/)
})
