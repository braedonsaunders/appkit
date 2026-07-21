import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ApiError,
  apiIdempotencyRequestDigest,
  authorize,
  errorResponse,
  generateApiKey,
  hashToken,
  keyHasPermission,
  parseBearerToken,
  sanitizeApiPermissions,
  describeRoute,
  toOpenApi,
} from './index'

test('generateApiKey → parse → hash round-trips', () => {
  const { token, hash } = generateApiKey()
  assert.match(token, /^appkit_live_[A-Za-z0-9_-]{43}$/)
  assert.equal(hash, hashToken(token))
  const req = new Request('https://x/api', { headers: { authorization: `Bearer ${token}` } })
  assert.equal(parseBearerToken(req), token)
})

test('generateApiKey honors a custom prefix', () => {
  const { token } = generateApiKey({ prefix: 'acme' })
  assert.match(token, /^acme_live_/)
  const req = new Request('https://x', { headers: { authorization: `Bearer ${token}` } })
  assert.equal(parseBearerToken(req, { prefix: 'acme' }), token)
})

test('parseBearerToken rejects malformed / oversized headers', () => {
  const mk = (h: string) => new Request('https://x', { headers: { authorization: h } })
  assert.equal(parseBearerToken(mk('Bearer nope')), null)
  assert.equal(parseBearerToken(mk('appkit_live_' + 'a'.repeat(43))), null) // no "Bearer "
  assert.equal(parseBearerToken(mk('Bearer ' + 'a'.repeat(200))), null) // too long
  assert.equal(parseBearerToken(new Request('https://x')), null)
})

test('keyHasPermission is wildcard-aware; authorize throws 403', () => {
  assert.equal(keyHasPermission(['ap.read'], 'ap.read'), true)
  assert.equal(keyHasPermission(['ap.*'], 'ap.write'), true)
  assert.equal(keyHasPermission(['ap.*'], 'ar.write'), false)
  assert.throws(
    () => authorize({ ctx: {} as never, key: { id: '1', name: 'k', tenantId: 't', permissions: ['ap.read'], rateLimitHeaders: {} } }, 'ap.write'),
    (e) => e instanceof ApiError && e.status === 403,
  )
})

test('sanitizeApiPermissions filters to catalogue + de-dupes', () => {
  assert.deepEqual(sanitizeApiPermissions([' ap.read ', 'ap.read', 'bogus'], ['ap.read', 'ap.write']), ['ap.read'])
  assert.deepEqual(sanitizeApiPermissions(['ap.read', '', 'ap.write']), ['ap.read', 'ap.write'])
})

test('errorResponse renders a JSON envelope with no-store headers', async () => {
  const res = errorResponse(ApiError.invalid('bad', { field: 'x' }))
  assert.equal(res.status, 400)
  assert.equal(res.headers.get('Cache-Control'), 'no-store')
  assert.equal(res.headers.get('Vary'), 'Authorization')
  const body = (await res.json()) as { error: { code: string; message: string; details: unknown } }
  assert.equal(body.error.code, 'invalid_request')
  assert.deepEqual(body.error.details, { field: 'x' })
  // Unknown errors never leak internals.
  const internal = errorResponse(new Error('secret stack'))
  assert.equal(internal.status, 500)
  assert.equal((await internal.json()).error.message, 'Internal server error')
})

test('idempotency digest is stable across key order, sensitive to body', () => {
  const req = (p: string) => new Request(`https://x${p}`, { method: 'POST' })
  const a = apiIdempotencyRequestDigest(req('/pay'), { amount: 10, currency: 'USD' })
  const b = apiIdempotencyRequestDigest(req('/pay'), { currency: 'USD', amount: 10 })
  assert.equal(a, b) // key order doesn't matter
  const c = apiIdempotencyRequestDigest(req('/pay'), { amount: 11, currency: 'USD' })
  assert.notEqual(a, c) // body change → different digest
  const d = apiIdempotencyRequestDigest(req('/refund'), { amount: 10, currency: 'USD' })
  assert.notEqual(a, d) // path change → different digest
})

test('describeRoute + toOpenApi emit a valid-shaped spec', () => {
  const routes = [
    describeRoute({ method: 'GET', path: '/v1/invoices', tag: 'Invoices', permission: 'invoices.read', summary: 'List invoices', params: [{ name: 'status', description: 'filter' }], responseExample: { data: [] } }),
    describeRoute({ method: 'POST', path: '/v1/invoices', tag: 'Invoices', permission: 'invoices.write', requestExample: { amount: 10 } }),
  ]
  const spec = toOpenApi(routes, { title: 'Demo', version: '1.0.0' }) as any
  assert.equal(spec.openapi, '3.1.0')
  assert.equal(spec.info.title, 'Demo')
  assert.ok(spec.paths['/v1/invoices'].get)
  assert.ok(spec.paths['/v1/invoices'].post)
  assert.equal(spec.paths['/v1/invoices'].get.parameters[0].name, 'status')
  assert.deepEqual(spec.paths['/v1/invoices'].get.security, [{ apiKey: [] }])
  assert.ok(spec.components.securitySchemes.apiKey)
})
