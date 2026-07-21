import assert from 'node:assert/strict'
import { createECDH, randomBytes } from 'node:crypto'
import test from 'node:test'
import { scanNotificationDigests, type DigestMessage, type NotificationDigestStore } from './digest'
import { processPushDelivery, type PushSubscriptionStore } from './push'

test('digest scan pages recipients, caps items, and emits stable idempotency keys', async () => {
  const messages: DigestMessage[] = []
  const store: NotificationDigestStore = {
    async policies() { return [{ tenantId: 'tenant-1', mode: 'daily', hourUtc: 7 }] },
    async recipients() { return [{ userId: 'user-1', email: 'user@example.com', total: 2 }] },
    async items() { return [{ userId: 'user-1', title: '<Review>', linkPath: '/records/1' }] },
  }
  const scheduledFor = new Date('2026-07-20T07:00:00.000Z')
  const first = await scanNotificationDigests({ store, deliver: async (message) => { messages.push(message) }, applicationUrl: 'https://app.example.com', scheduledFor })
  const secondMessages: DigestMessage[] = []
  await scanNotificationDigests({ store, deliver: async (message) => { secondMessages.push(message) }, applicationUrl: 'https://app.example.com', scheduledFor })
  assert.deepEqual(first, { tenants: 1, messages: 1 })
  assert.equal(messages[0]?.idempotencyKey, secondMessages[0]?.idempotencyKey)
  assert.match(messages[0]?.html ?? '', /&lt;Review&gt;/)
  assert.match(messages[0]?.html ?? '', /https:\/\/app\.example\.com\/records\/1/)
})

test('push delivery prunes expired endpoints and preserves retryable failures', async () => {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const subscription = { id: 'sub-1', tenantId: 'tenant-1', userId: 'user-1', endpoint: 'https://push.example.com/token', p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') }
  const removed: string[] = []
  const store: PushSubscriptionStore = {
    async upsert(input) { return { id: 'sub-1', ...input } },
    async find() { return subscription },
    async remove(input) { removed.push(input.subscriptionId ?? input.endpoint ?? '') },
  }
  const result = await processPushDelivery({
    delivery: { tenantId: 'tenant-1', userId: 'user-1', subscriptionId: 'sub-1', title: 'Ready', linkPath: '/notifications' },
    store,
    vapid: { subject: 'mailto:ops@example.com', publicKey: 'public', privateKey: 'private' },
    send: async () => { throw Object.assign(new Error('Gone'), { statusCode: 410 }) },
  })
  assert.equal(result, 'pruned')
  assert.deepEqual(removed, ['sub-1'])

  await assert.rejects(() => processPushDelivery({
    delivery: { tenantId: 'tenant-1', userId: 'user-1', subscriptionId: 'sub-1', title: 'Ready' },
    store,
    vapid: { subject: 'mailto:ops@example.com', publicKey: 'public', privateKey: 'private' },
    send: async () => { throw Object.assign(new Error('Unavailable'), { statusCode: 503 }) },
  }), /Unavailable/)
})
