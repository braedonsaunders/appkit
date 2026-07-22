import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertIdentifier,
  assertJsonBytes,
  assertPushJobData,
  assertQueueJobId,
  assertRedisReady,
  assertRelativeAppPath,
  buildNotifyQueueJobs,
  createRateLimiter,
  normalizeNotifyJobData,
} from './index'

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

test('production notification queue validation and deterministic batching retain source behavior', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111'
  const normalized = normalizeNotifyJobData({ tenantId, userIds: ['one', 'one', ' two '], category: 'records', type: 'record.updated', title: 'Record updated', channels: ['email', 'email'] })
  assert.deepEqual(normalized.userIds, ['one', 'two'])
  assert.deepEqual(normalized.channels, ['email'])
  const jobs = buildNotifyQueueJobs({ tenantId, userIds: Array.from({ length: 501 }, (_, index) => `user-${index}`), category: 'records', type: 'record.updated', title: 'Record updated' }, { jobId: 'source-job' })
  assert.deepEqual(jobs.map((job) => job.data.userIds.length), [250, 250, 1])
  assert.equal(new Set(jobs.map((job) => job.opts.jobId)).size, 3)
  assert.deepEqual(jobs.map((job) => job.opts.jobId), buildNotifyQueueJobs({ tenantId, userIds: Array.from({ length: 501 }, (_, index) => `user-${index}`), category: 'records', type: 'record.updated', title: 'Record updated' }, { jobId: 'source-job' }).map((job) => job.opts.jobId))
  assert.throws(() => normalizeNotifyJobData({ tenantId, userIds: ['one'], category: 'records', type: 'record.updated', title: 'x', linkPath: '//attacker.test' }), /safe app-relative/)
})

test('production push queue contract remains bounded and source-compatible', () => {
  assert.doesNotThrow(() => assertPushJobData({ tenantId: '11111111-1111-4111-8111-111111111111', userId: 'user', subscriptionId: '22222222-2222-4222-8222-222222222222', title: 'Ready', linkPath: '/notifications' }))
  assert.throws(() => assertPushJobData({ tenantId: 'bad', userId: 'user', subscriptionId: 'bad', title: 'Ready' }), /UUID/)
})
