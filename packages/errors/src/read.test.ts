import assert from 'node:assert/strict'
import test from 'node:test'
import { readActionResult, type ResponseLike } from './read'

function response(ok: boolean, status: number, body: () => Promise<unknown>): ResponseLike {
  return { ok, status, json: body }
}

test('a 422 refusal keeps kind, status and the server message verbatim', async () => {
  const result = await readActionResult(
    response(false, 422, async () => ({ error: 'The current phase must be closed before finalizing the summary' })),
  )
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'refused')
  assert.equal(result.error.status, 422)
  assert.equal(
    result.error.displayMessage('fallback'),
    'The current phase must be closed before finalizing the summary',
  )
})

test('a bare res.json() wedge is impossible: non-JSON bodies become refusals, never throws', async () => {
  const html = async (): Promise<unknown> => {
    throw new SyntaxError('Unexpected token < in JSON')
  }
  const result = await readActionResult(response(false, 500, html))
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'unexpected')
  assert.equal(result.error.displayMessage('fallback'), 'fallback')
})

test('an empty 204-style body on success resolves data null, never throws', async () => {
  const empty = async (): Promise<unknown> => {
    throw new SyntaxError('Unexpected end of JSON input')
  }
  const result = await readActionResult(response(true, 204, empty))
  assert.equal(result.ok, true)
  assert.equal(result.data, null)
})

test('success trusts the status and passes data through untouched', async () => {
  const result = await readActionResult<{ items: number[] }>(
    response(true, 200, async () => ({ items: [1, 2, 3] })),
  )
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, { items: [1, 2, 3] })
})

test('code and field issues survive for machine branching and field errors', async () => {
  const result = await readActionResult(
    response(false, 400, async () => ({
      error: 'startDate must be a valid date',
      code: 'invalid',
      issues: [{ path: 'startDate', message: 'must be a valid date' }],
    })),
  )
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'validation')
  assert.equal(result.error.code, 'invalid')
  assert.deepEqual(result.error.issues, [{ path: 'startDate', message: 'must be a valid date' }])
})

test('malformed issue entries are dropped, never crash the read', async () => {
  const result = await readActionResult(
    response(false, 400, async () => ({ error: 'bad', issues: ['nope', null, { path: 1, message: 2 }, { path: 'a', message: 'b' }] })),
  )
  assert.equal(result.ok, false)
  assert.deepEqual(result.error.issues, [{ path: 'a', message: 'b' }])
})

test('409 classifies as conflict, 403 as denied, 404 as not-found', async () => {
  for (const [status, kind] of [[409, 'conflict'], [403, 'denied'], [401, 'denied'], [404, 'not-found']] as const) {
    const result = await readActionResult(response(false, status, async () => ({ error: 'nope' })))
    assert.equal(result.ok, false)
    assert.equal(result.error.kind, kind)
    assert.equal(result.error.status, status)
  }
})

test('the message escape hatch reads body.message when error is absent', async () => {
  const result = await readActionResult(response(false, 422, async () => ({ message: 'human reason' })))
  assert.equal(result.ok, false)
  assert.equal(result.error.displayMessage('fallback'), 'human reason')
})

test('a 500 with only a code keeps the code and falls back for display', async () => {
  const result = await readActionResult(response(false, 500, async () => ({ code: 'internal_error' })))
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'unexpected')
  assert.equal(result.error.code, 'internal_error')
  assert.equal(result.error.displayMessage('fallback'), 'fallback')
})
