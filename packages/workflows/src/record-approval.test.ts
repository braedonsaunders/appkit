import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RecordApprovalRequestError,
  createHttpRecordApprovalAdapter,
  createMemoryRecordApprovalAdapter,
  type RecordApprovalState,
} from './record-approval'

const pendingState: RecordApprovalState = {
  approvalState: {
    status: 'pending_approval',
    pendingWith: [
      { name: 'Avery', gateId: 'gate-a', since: '2026-07-21T12:00:00.000Z' },
      { name: 'Morgan', gateId: 'gate-b', since: '2026-07-21T12:00:00.000Z' },
    ],
    myActions: { gateId: 'gate-a' },
  },
  history: [
    {
      id: 'request-a',
      type: 'requested',
      actor: 'Avery',
      comment: null,
      at: '2026-07-21T12:00:00.000Z',
      title: 'Release approval',
    },
  ],
}

test('HTTP adapter preserves the record-state query and decision body contracts', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  const adapter = createHttpRecordApprovalAdapter({
    fetcher: async (url, init) => {
      requests.push({ url: String(url), init })
      if (init?.method === 'POST') return Response.json({ resumed: null })
      return Response.json(pendingState)
    },
  })

  assert.deepEqual(
    await adapter.load({ subjectKind: 'vendor bill', subjectId: 'record/1' }),
    pendingState,
  )
  assert.equal(requests[0]?.url, '/api/flows/record-state?subjectKind=vendor+bill&subjectId=record%2F1')

  assert.deepEqual(
    await adapter.decide({
      subjectKind: 'vendor bill',
      subjectId: 'record/1',
      gateId: 'gate-a',
      decision: 'rejected',
      comment: 'Missing evidence',
    }),
    { outcome: 'waiting' },
  )
  assert.equal(requests[1]?.url, '/api/flows/gates/decide')
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    gateId: 'gate-a',
    decision: 'rejected',
    comment: 'Missing evidence',
  })
})

test('HTTP adapter maps conflict and typed request failures', async () => {
  const conflict = createHttpRecordApprovalAdapter({
    fetcher: async () => Response.json({ error: 'decided' }, { status: 409 }),
  })
  assert.deepEqual(
    await conflict.decide({
      subjectKind: 'record',
      subjectId: 'one',
      gateId: 'gate-a',
      decision: 'approved',
    }),
    { outcome: 'already-decided' },
  )

  const failing = createHttpRecordApprovalAdapter({
    fetcher: async () => Response.json({ error: 'forbidden' }, { status: 403 }),
  })
  await assert.rejects(
    () => failing.load({ subjectKind: 'record', subjectId: 'one' }),
    (error: unknown) =>
      error instanceof RecordApprovalRequestError && error.status === 403 && error.message === 'forbidden',
  )
})

test('memory adapter projects all-quorum approval and rejection history', async () => {
  let id = 0
  const adapter = createMemoryRecordApprovalAdapter({
    seed: [{ subjectKind: 'record', subjectId: 'one', state: pendingState, quorum: 'all' }],
    actor: 'Avery',
    now: () => new Date('2026-07-21T13:00:00.000Z'),
    createId: () => `decision-${++id}`,
  })

  assert.deepEqual(
    await adapter.decide({
      subjectKind: 'record',
      subjectId: 'one',
      gateId: 'gate-a',
      decision: 'approved',
    }),
    { outcome: 'waiting' },
  )
  const waiting = adapter.inspect({ subjectKind: 'record', subjectId: 'one' })
  assert.equal(waiting?.approvalState.status, 'pending_approval')
  assert.deepEqual(waiting?.approvalState.pendingWith.map((entry) => entry.gateId), ['gate-b'])
  assert.deepEqual(waiting?.history.at(-1), {
    id: 'decision-1',
    type: 'approved',
    actor: 'Avery',
    comment: null,
    at: '2026-07-21T13:00:00.000Z',
    title: 'Release approval',
  })

  adapter.reset([{ subjectKind: 'record', subjectId: 'one', state: pendingState, quorum: 'all' }])
  assert.deepEqual(
    await adapter.decide({
      subjectKind: 'record',
      subjectId: 'one',
      gateId: 'gate-a',
      decision: 'rejected',
      comment: 'Missing evidence',
    }),
    { outcome: 'rejected' },
  )
  const rejected = await adapter.load({ subjectKind: 'record', subjectId: 'one' })
  assert.equal(rejected?.approvalState.status, 'rejected')
  assert.deepEqual(rejected?.approvalState.pendingWith, [])
  assert.equal(rejected?.history.at(-1)?.comment, 'Missing evidence')
  assert.deepEqual(
    await adapter.decide({
      subjectKind: 'record',
      subjectId: 'one',
      gateId: 'gate-a',
      decision: 'approved',
    }),
    { outcome: 'already-decided' },
  )
})
