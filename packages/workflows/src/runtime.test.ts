import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMemoryWorkflowStore,
  decideWorkflowGate,
  dispatchWorkflow,
  resolveQuorumOutcome,
} from './runtime'

test('all quorum waits for every approval and then resumes once', async () => {
  assert.deepEqual(
    resolveQuorumOutcome('all', 'approved', [
      { id: 'a', status: 'approved' },
      { id: 'b', status: 'pending' },
    ]),
    { resume: null, cancelIds: [] },
  )
  assert.deepEqual(
    resolveQuorumOutcome('all', 'approved', [
      { id: 'a', status: 'approved' },
      { id: 'b', status: 'approved' },
    ]),
    { resume: 'approved', cancelIds: [] },
  )
})

test('durable run pauses at a gate and executes the chosen branch idempotently', async () => {
  const store = createMemoryWorkflowStore()
  const calls: string[] = []
  const runtime = {
    store,
    actions: {
      notify: async ({ action }: { action: { key: string } }) => {
        calls.push(action.key)
        return 'sent'
      },
    },
  }
  const gate = {
    kind: 'gate' as const,
    key: 'approval',
    assigneeIds: ['u1'],
    onApprove: {
      steps: [{ kind: 'action' as const, key: 'publish', type: 'notify' }],
    },
  }
  const run = await dispatchWorkflow(
    runtime,
    'tenant',
    {
      plan: async () => ({
        workflowKey: 'release',
        subjectType: 'document',
        subjectId: 'd1',
        plan: { steps: [gate] },
      }),
    },
    {},
  )
  assert.equal(run?.status, 'waiting')
  const row = [...store.gates.values()][0]
  assert.ok(row)
  assert.equal(
    await decideWorkflowGate(runtime, {
      gateId: row.id,
      assigneeId: 'u1',
      decision: 'approved',
      gate,
    }),
    'approved',
  )
  assert.equal((await store.getRun(row.runId))?.status, 'completed')
  assert.deepEqual(calls, ['publish'])
})

test('a failed action can be claimed again while a completed action remains replay safe', async () => {
  const store = createMemoryWorkflowStore()
  let attempts = 0
  const runtime = {
    store,
    actions: {
      unstable: async () => {
        attempts++
        if (attempts === 1) throw new Error('temporary')
        return 'ok'
      },
    },
  }
  const run = await store.createRun({
    tenantId: 'tenant',
    workflowKey: 'retry',
    subjectType: 'record',
    subjectId: 'one',
    context: {},
  })
  const plan = {
    steps: [{ kind: 'action' as const, key: 'deliver', type: 'unstable' }],
  }
  await assert.rejects(
    () =>
      import('./runtime').then(({ executeWorkflowPlan }) =>
        executeWorkflowPlan(runtime, run, plan),
      ),
    /temporary/,
  )
  const { executeWorkflowPlan } = await import('./runtime')
  await executeWorkflowPlan(runtime, (await store.getRun(run.id))!, plan)
  await executeWorkflowPlan(runtime, (await store.getRun(run.id))!, plan)
  assert.equal(attempts, 2)
})
