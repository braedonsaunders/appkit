import assert from 'node:assert/strict'
import test from 'node:test'
import { assertBoundedReportFilters, assertReportRecipientLimit, normalizeReportRecipientEmails, normalizeReportRecipientUserIds, REPORT_SCHEDULE_LIMITS } from './schedule-policy'

test('schedule policy normalizes recipients and rejects malformed values', () => {
  assert.deepEqual(normalizeReportRecipientEmails([' Manager@Example.com ', 'manager@example.com']), ['manager@example.com'])
  assert.deepEqual(normalizeReportRecipientUserIds([' user_123 ', 'user_123']), ['user_123'])
  assert.throws(() => normalizeReportRecipientEmails(['not-an-email']), /Invalid/)
  assert.throws(() => normalizeReportRecipientUserIds(['member id']), /identifier/)
  assert.throws(() => assertReportRecipientLimit(Array.from({ length: REPORT_SCHEDULE_LIMITS.recipientCount }, (_, index) => `user_${index}`), ['extra@example.com']), /at most/)
})

test('schedule policy bounds JSON filters and rejects hostile shapes', () => {
  assert.doesNotThrow(() => assertBoundedReportFilters({ days: 30, sites: ['one', 'two'] }))
  assert.throws(() => assertBoundedReportFilters([]), /JSON object/)
  assert.throws(() => assertBoundedReportFilters({ ['__proto__']: 'value' }), /invalid key/)
  let nested: Record<string, unknown> = { value: true }
  for (let index = 0; index <= REPORT_SCHEDULE_LIMITS.filtersDepth; index += 1) nested = { nested }
  assert.throws(() => assertBoundedReportFilters(nested), /deeply/)
})
