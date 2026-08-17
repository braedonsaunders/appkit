import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ExecutionLeaseLostError,
  ExternalEffectUncertainError,
  executeExternalEffect,
  runWithFencedLease,
  type ExecutionLease,
  type ExecutionLeaseStore,
  type ExternalEffectClaim,
  type ExternalEffectEvent,
  type ExternalEffectIntent,
  type ExternalEffectStore,
} from './execution'

function lease(overrides: Partial<ExecutionLease> = {}): ExecutionLease {
  return {
    runId: 'run-1',
    attemptId: 'attempt-1',
    owner: 'worker-a',
    fence: 3,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  }
}

test('fenced execution renews and commits with the newest lease snapshot', async () => {
  const commits: ExecutionLease[] = []
  let renewals = 0
  const store: ExecutionLeaseStore = {
    async claim() {
      return lease()
    },
    async renew(current, { leaseMs, now }) {
      renewals += 1
      return { ...current, expiresAt: new Date(now.getTime() + leaseMs) }
    },
  }
  const result = await runWithFencedLease({
    store,
    runId: 'run-1',
    owner: 'worker-a',
    leaseMs: 50,
    heartbeatMs: 10,
    execute: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
      return 'done'
    },
    commit: async (current) => {
      commits.push(current)
      return true
    },
  })
  assert.equal(result, 'done')
  assert.ok(renewals >= 1)
  assert.equal(commits.length, 1)
  assert.equal(commits[0]?.fence, 3)
})

test('losing the lease aborts in-flight work and refuses its commit', async () => {
  let committed = false
  const store: ExecutionLeaseStore = {
    async claim() {
      return lease()
    },
    async renew() {
      return null
    },
  }
  await assert.rejects(
    runWithFencedLease({
      store,
      runId: 'run-1',
      owner: 'worker-a',
      leaseMs: 40,
      heartbeatMs: 5,
      execute: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
      commit: async () => {
        committed = true
        return true
      },
    }),
    ExecutionLeaseLostError,
  )
  assert.equal(committed, false)
})

type EffectResult = { deliveryId: string }

function effectStore(claim: ExternalEffectClaim<EffectResult>) {
  const intents: ExternalEffectIntent<unknown>[] = []
  const events: ExternalEffectEvent<EffectResult>[] = []
  const store: ExternalEffectStore<unknown, EffectResult> = {
    async claim(intent) {
      intents.push(intent)
      return claim
    },
    async append(_effectId, event) {
      events.push(event)
    },
  }
  return { store, intents, events }
}

const intent = {
  tenantId: 'tenant-1',
  runId: 'run-1',
  attemptId: 'attempt-1',
  kind: 'email.send',
  idempotencyKey: 'reply:message-1',
  request: { to: 'customer@example.com' },
}

test('external effects replay completed results without acting again', async () => {
  const memory = effectStore({
    disposition: 'completed',
    effectId: 'effect-1',
    result: { deliveryId: 'provider-7' },
  })
  let calls = 0
  const result = await executeExternalEffect({
    store: memory.store,
    intent,
    execute: async () => {
      calls += 1
      return { deliveryId: 'new' }
    },
  })
  assert.deepEqual(result, { deliveryId: 'provider-7' })
  assert.equal(calls, 0)
  assert.deepEqual(memory.events, [])
})

test('external effects block an uncertain retry unless explicitly safe', async () => {
  const memory = effectStore({
    disposition: 'uncertain',
    effectId: 'effect-1',
    reason: 'The provider connection ended before acknowledging the request.',
  })
  await assert.rejects(
    executeExternalEffect({
      store: memory.store,
      intent,
      execute: async () => ({ deliveryId: 'new' }),
    }),
    ExternalEffectUncertainError,
  )
  assert.deepEqual(memory.events, [])
})

test('safe retries append retry and reconciliation evidence', async () => {
  const memory = effectStore({
    disposition: 'uncertain',
    effectId: 'effect-1',
    reason: 'The first call was not acknowledged.',
  })
  const result = await executeExternalEffect({
    store: memory.store,
    intent,
    retry: 'safe',
    execute: async () => ({ deliveryId: 'provider-8' }),
  })
  assert.deepEqual(result, { deliveryId: 'provider-8' })
  assert.deepEqual(memory.events.map((event) => event.kind), ['retry_started', 'reconciled'])
})
