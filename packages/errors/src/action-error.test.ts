import assert from 'node:assert/strict'
import test from 'node:test'
import { ActionError, isActionError, transportError } from './action-error'

test('displayMessage prefers the server reason, falls back otherwise', () => {
  const refused = new ActionError({ kind: 'refused', status: 422, serverMessage: 'This record is locked for editing' })
  assert.equal(refused.displayMessage('fallback'), 'This record is locked for editing')
  const empty = new ActionError({ kind: 'unexpected', status: 500 })
  assert.equal(empty.displayMessage('fallback'), 'fallback')
})

test('displayMessage never leaks technical text even when the server sent it', () => {
  const leaked = new ActionError({ kind: 'unexpected', status: 500, serverMessage: 'INSERT INTO x (a) VALUES (1)' })
  assert.equal(leaked.displayMessage('fallback'), 'fallback')
})

test('transport errors carry the abort flag and keep fetch internals out of display', () => {
  const aborted = transportError('AbortError: The operation was aborted', true)
  assert.equal(aborted.kind, 'transport')
  assert.equal(aborted.aborted, true)
  assert.equal(aborted.displayMessage('fallback'), 'fallback')
  const down = transportError('TypeError: Failed to fetch')
  assert.equal(down.aborted, false)
  assert.equal(down.displayMessage('fallback'), 'fallback')
})

test('isActionError narrows', () => {
  assert.equal(isActionError(new ActionError({ kind: 'conflict', status: 409 })), true)
  assert.equal(isActionError(new Error('x')), false)
  assert.equal(isActionError({ kind: 'refused' }), false)
  assert.equal(isActionError(null), false)
})

test('kind, code and issues survive construction for machine branching', () => {
  const err = new ActionError({
    kind: 'validation',
    status: 400,
    code: 'invalid',
    issues: [{ path: 'startDate', message: 'must be a valid date' }],
    serverMessage: 'bad date',
  })
  assert.equal(err.kind, 'validation')
  assert.equal(err.code, 'invalid')
  assert.deepEqual(err.issues, [{ path: 'startDate', message: 'must be a valid date' }])
})
