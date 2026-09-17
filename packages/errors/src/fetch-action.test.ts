import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchAction } from './fetch'

const realFetch = globalThis.fetch

function stubFetch(impl: typeof fetch): void {
  globalThis.fetch = impl
}

test.afterEach(() => {
  globalThis.fetch = realFetch
})

function jsonResponse(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

test('a refused action resolves to a classified refusal, never throws', async () => {
  stubFetch(async () => jsonResponse(false, 422, { error: 'This record is locked for editing' }))
  const result = await fetchAction('/api/records/actions', { method: 'POST' })
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'refused')
  assert.equal(result.error.displayMessage('fallback'), 'This record is locked for editing')
})

test('a dead network resolves to transport, not an unhandled rejection', async () => {
  stubFetch(async () => {
    throw new TypeError('Failed to fetch')
  })
  const result = await fetchAction('/api/records/actions')
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'transport')
  assert.equal(result.error.aborted, false)
  assert.equal(result.error.displayMessage('fallback'), 'fallback')
})

test('an aborted timeout resolves to transport with the abort flag set', async () => {
  stubFetch(async () => {
    throw new DOMException('The operation was aborted', 'AbortError')
  })
  const result = await fetchAction('/api/records/actions')
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'transport')
  assert.equal(result.error.aborted, true)
})

test('a proxy HTML 500 resolves to unexpected with the fallback', async () => {
  stubFetch(async () => ({
    ok: false,
    status: 502,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON')
    },
  }) as unknown as Response)
  const result = await fetchAction('/api/records/actions')
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'unexpected')
  assert.equal(result.error.displayMessage('fallback'), 'fallback')
})

test('success passes data through', async () => {
  stubFetch(async () => jsonResponse(true, 200, { saved: true }))
  const result = await fetchAction<{ saved: boolean }>('/api/records/actions')
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, { saved: true })
})
