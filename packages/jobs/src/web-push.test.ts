import assert from 'node:assert/strict'
import { createECDH, randomBytes } from 'node:crypto'
import test from 'node:test'
import { buildWebPushPayload, validateWebPushSubscription } from './web-push'

function subscription() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return { endpoint: 'https://push.example.com/subscriptions/token', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } }
}

test('web-push subscriptions reject unsafe endpoints and malformed browser keys', () => {
  const valid = subscription()
  assert.deepEqual(validateWebPushSubscription(valid), valid)
  assert.throws(() => validateWebPushSubscription({ ...valid, endpoint: 'http://push.example.com/token' }), /HTTPS/)
  assert.throws(() => validateWebPushSubscription({ ...valid, keys: { ...valid.keys, auth: 'not valid' } }), /base64url/)
})

test('web-push payloads are unicode-safe and remain below the encryption budget', () => {
  const payload = buildWebPushPayload({ title: 'Alert 🔔', body: '通知🙂'.repeat(10_000), linkPath: '/notifications' })
  assert.ok(Buffer.byteLength(payload) <= 3_072)
  assert.doesNotThrow(() => JSON.parse(payload))
})
