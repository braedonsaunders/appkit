import assert from 'node:assert/strict'
import test from 'node:test'
import { createApprovalTokenCodec } from './approval-tokens'

test('approval tokens bind the gate, assignee, decision, and expiry', () => {
  let now = 1_000
  const codec = createApprovalTokenCodec({
    secret: 'a-production-secret-with-enough-entropy',
    baseUrl: 'https://app.example.com/',
    now: () => now,
  })
  const token = codec.create({ gateId: 'gate-1', assigneeId: 'user-1', decision: 'approved', expiresAt: 2_000 })
  assert.deepEqual(codec.verify(token), { gateId: 'gate-1', assigneeId: 'user-1', decision: 'approved', expiresAt: 2_000 })
  const [payload, signature = ''] = token.split('.')
  const tampered = `${payload}.${signature[0] === '0' ? '1' : '0'}${signature.slice(1)}`
  assert.equal(codec.verify(tampered), null)
  now = 2_001
  assert.equal(codec.verify(token), null)
})

test('approval URLs carry separate signed approve and reject grants', () => {
  const codec = createApprovalTokenCodec({ secret: 'another-production-secret-with-entropy', baseUrl: 'https://app.example.com/' })
  const urls = codec.urls('gate-1', 'user-1')
  const approve = codec.verify(new URL(urls.approveUrl).searchParams.get('token') ?? '')
  const reject = codec.verify(new URL(urls.rejectUrl).searchParams.get('token') ?? '')
  assert.equal(approve?.decision, 'approved')
  assert.equal(reject?.decision, 'rejected')
})
