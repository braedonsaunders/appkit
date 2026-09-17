import assert from 'node:assert/strict'
import test from 'node:test'
import { kindForStatus } from './kinds'

test('kindForStatus classifies the refusal statuses endpoints actually return', () => {
  assert.equal(kindForStatus(400), 'validation')
  assert.equal(kindForStatus(401), 'denied')
  assert.equal(kindForStatus(403), 'denied')
  assert.equal(kindForStatus(404), 'not-found')
  assert.equal(kindForStatus(409), 'conflict')
  assert.equal(kindForStatus(410), 'not-found')
  assert.equal(kindForStatus(413), 'validation')
  assert.equal(kindForStatus(415), 'validation')
  assert.equal(kindForStatus(422), 'refused')
})

test('kindForStatus fails closed: unknown statuses are unexpected, never a crash', () => {
  assert.equal(kindForStatus(500), 'unexpected')
  assert.equal(kindForStatus(502), 'unexpected')
  assert.equal(kindForStatus(503), 'unexpected')
  assert.equal(kindForStatus(429), 'unexpected')
  assert.equal(kindForStatus(418), 'unexpected')
  assert.equal(kindForStatus(0), 'unexpected')
})

test('there is no transport status: without a response there is nothing to classify', () => {
  // kindForStatus returns Exclude<ErrorKind, 'transport'> — enforced by type.
  const kind: ReturnType<typeof kindForStatus> = kindForStatus(500)
  assert.notEqual(kind, 'transport')
})
