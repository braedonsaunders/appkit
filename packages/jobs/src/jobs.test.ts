import assert from 'node:assert/strict'
import test from 'node:test'
import { assertIdentifier, assertJsonBytes, assertQueueJobId, assertRedisReady, assertRelativeAppPath, createRateLimiter } from './index'

test('source-grade queue validators reject unsafe identifiers, payloads, and paths', () => {
  assert.doesNotThrow(() => assertIdentifier('report.generate-v2', 'job'))
  assert.throws(() => assertQueueJobId('tenant:record'))
  assert.throws(() => assertRelativeAppPath('//attacker.test', 'link'))
  assert.throws(() => assertJsonBytes({ payload: 'x'.repeat(100) }, 'payload', 20))
})

test('readiness and rate-limit configuration fail before opening Redis', async () => {
  await assert.rejects(assertRedisReady({ url: 'redis://127.0.0.1:1', timeoutMs: 99 }), /between 100 and 30000/)
  const limiter = createRateLimiter({ redisUrl: 'redis://127.0.0.1:1' })
  await assert.rejects(limiter.consume({ key: '', limit: 1, windowSeconds: 60 }), /key is invalid/)
  await assert.rejects(limiter.consume({ key: 'login', limit: 0, windowSeconds: 60 }), /limit must be/)
})
