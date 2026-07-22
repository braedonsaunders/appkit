import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  compileCron,
  decompileCron,
  isValidCron,
  isValidTimezone,
  normalizeNotificationConfiguration,
  type NotificationConfigurationAllowedValues,
  type NotificationConfigurationInput,
} from './index'
import { NotificationSettings } from './notification-settings'
import { ProductionNotificationPreferences } from './production-preferences'
import { PushDeviceNotifications } from './push-device'

test('retains the source notification schedule grammar', () => {
  assert.equal(compileCron('hourly', 6, 1, ''), '0 * * * *')
  assert.equal(compileCron('every_6h', 6, 1, ''), '0 */6 * * *')
  assert.equal(compileCron('twice_daily', 7, 1, ''), '0 7,19 * * *')
  assert.equal(compileCron('daily', 25, 1, ''), '0 23 * * *')
  assert.equal(compileCron('weekly', 6, 8, ''), '0 6 * * 6')
  assert.deepEqual(decompileCron('0 7,19 * * *'), { preset: 'twice_daily', hour: 7, weekday: 1, custom: '0 7,19 * * *' })
  assert.deepEqual(decompileCron('15 8 * * 2'), { preset: 'custom', hour: 6, weekday: 1, custom: '15 8 * * 2' })
  assert.equal(isValidCron('0 */6 * * *'), true)
  assert.equal(isValidCron('0 25 * * *'), false)
  assert.equal(isValidTimezone('UTC'), true)
  assert.equal(isValidTimezone('Not/A-Timezone'), false)
})

test('normalizes the complete source settings batch against host-owned recipient catalogues', () => {
  const input: NotificationConfigurationInput = {
    settings: [{
      category: 'records', enabled: true, roleKeys: ['manager', 'unknown', 'manager'], userIds: ['u1', 'bad'], groupIds: ['g1', 'missing'],
      channels: ['in_app', 'email', 'email'], escalation: [{ afterDays: 500, roleKeys: ['manager', 'bad'] }, { afterDays: 2, roleKeys: [] }],
    }],
    policy: { digestMode: 'daily', digestHourUtc: 7, quietHours: { start: 22, end: 6 }, scanEnabled: true, scanCron: ' 0 6 * * * ', scanTimezone: 'UTC' },
  }
  const allowed: NotificationConfigurationAllowedValues = {
    categoryKeys: new Set(['records']), roleKeys: new Set(['manager']), userIds: new Set(['u1']), groupIds: new Set(['g1']),
  }
  assert.deepEqual(normalizeNotificationConfiguration(input, allowed), {
    settings: [{ category: 'records', enabled: true, roleKeys: ['manager'], userIds: ['u1'], groupIds: ['g1'], channels: ['in_app', 'email'], escalation: [{ afterDays: 365, roleKeys: ['manager'] }] }],
    policy: { ...input.policy, scanCron: '0 6 * * *' },
  })
  assert.throws(() => normalizeNotificationConfiguration({ ...input, policy: { ...input.policy, scanCron: 'bad' } }, allowed), /five-part/)
})

test('renders the complete production routing cockpit rather than a reduced matrix', () => {
  const html = renderToStaticMarkup(React.createElement(NotificationSettings, {
    categories: [{ key: 'records', label: 'Records', description: 'Record lifecycle updates.', defaultRoles: ['manager'] }],
    roles: [{ key: 'manager', name: 'Manager' }], members: [{ value: 'u1', label: 'Alex Kim' }], groups: [{ value: 'g1', label: 'Operations' }],
    initial: {}, policy: { digestMode: 'off', digestHourUtc: 7, quietHours: null, scanEnabled: true, scanCron: '0 6 * * *', scanTimezone: 'UTC' },
    adapter: { save: async () => undefined }, channelAvailability: { email: 'ready', sms: 'unconfigured' },
  }))
  for (const copy of ['Delivery status', 'Routing policy', 'Digest delivery', 'Quiet hours', 'Automatic scan schedule', 'Roles', 'People', 'People groups', 'Channels', 'Escalation', 'Save changes']) assert.match(html, new RegExp(copy))
})

test('renders source-parity user preferences and device enrollment surfaces', () => {
  const preferences = renderToStaticMarkup(React.createElement(ProductionNotificationPreferences, {
    catalog: { categories: [{ key: 'records', label: 'Records', description: 'Record updates', defaultChannels: ['in_app'] }] },
    initial: [], adapter: { save: async () => undefined },
  }))
  assert.match(preferences, /Web push/)
  assert.match(preferences, /Save preferences/)
  assert.equal((preferences.match(/checked=""/g) ?? []).length, 4, 'missing preference rows default enabled exactly as the dispatcher')
  const push = renderToStaticMarkup(React.createElement(PushDeviceNotifications, { vapidPublicKey: null, adapter: { save: async () => undefined, remove: async () => undefined, test: async () => ({ sent: 1 }) } }))
  assert.match(push, /Push notifications on this device/)
  assert.match(push, /Checking notification status/)
})
