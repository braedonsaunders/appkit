import assert from 'node:assert/strict'
import { test } from 'node:test'
import { issueRemoteViewerGrant, verifyRemoteViewerGrant } from './grants'
import { createMemoryRemoteSessionStore } from './memory'

const secret = 'a-production-length-remote-viewer-secret'

test('viewer grants are tenant-bound, expiring, signed and single-use at exchange', async () => {
  const token = issueRemoteViewerGrant({ tenantId: 'tenant-1', sessionId: 'session-1', leaseId: 'lease-1', holder: 'user-1', scope: 'observe', ttlMs: 60_000 }, secret, () => 1_000)
  const claims = verifyRemoteViewerGrant(token, secret, () => 1_001)
  assert.equal(claims.tenantId, 'tenant-1')
  assert.throws(() => verifyRemoteViewerGrant(`${token}x`, secret, () => 1_001), /signature|malformed/)
  assert.throws(() => verifyRemoteViewerGrant(token, secret, () => 61_001), /expired/)
  const store = createMemoryRemoteSessionStore(() => 1_001)
  assert.equal(await store.consumeGrant(claims.tenantId, claims.grantId, new Date(claims.expiresAt).toISOString()), true)
  assert.equal(await store.consumeGrant(claims.tenantId, claims.grantId, new Date(claims.expiresAt).toISOString()), false)
})
