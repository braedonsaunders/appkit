import assert from 'node:assert/strict'
import test from 'node:test'
import { assertNotificationEvent, dispatchNotification, planNotificationDeliveries, type NotificationEvent, type NotificationStore } from './index'

const event: NotificationEvent = { tenantId: 'tenant', sourceId: 'job-1', category: 'reports', type: 'report.ready', title: 'Report ready', body: 'Open it', linkPath: '/reports/1', channels: ['in_app', 'email', 'push', 'sms'] }

test('policy honors preferences, quiet hours, digests, and critical SMS', () => {
  const preferences = new Map([['u', new Map([['push' as const, false]])]])
  assert.deepEqual(planNotificationDeliveries(event, [{ userId: 'u', email: 'u@example.com', phone: '+14165551212' }], preferences, { digestMode: 'daily', quietHoursUtc: { start: 22, end: 7 } }, new Date('2026-07-20T23:00:00Z')).map((item) => item.channel), ['in_app'])
  assert.deepEqual(planNotificationDeliveries({ ...event, critical: true }, [{ userId: 'u', email: 'u@example.com', phone: '+14165551212' }], preferences, { digestMode: 'daily', quietHoursUtc: { start: 22, end: 7 } }, new Date('2026-07-20T23:00:00Z')).map((item) => item.channel), ['in_app', 'email', 'sms'])
})

test('dispatch stores in-app idempotently and requires configured external adapters', async () => {
  let inserts = 0
  const store: NotificationStore = { preferences: async () => new Map(), insert: async (notification, recipient) => { inserts++; return { created: true, record: { ...notification, id: 'n', userId: recipient.userId } } } }
  const result = await dispatchNotification({ event: { ...event, channels: ['in_app'] }, recipients: [{ userId: 'u' }], store })
  assert.equal(inserts, 1); assert.equal(result.records.length, 1)
})

test('notification links reject external or protocol-relative destinations', () => { assert.throws(() => assertNotificationEvent({ ...event, linkPath: '//evil.example' }), /application-relative/) })
