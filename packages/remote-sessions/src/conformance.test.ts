import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyRemoteSessionProviderConformance } from './conformance'
import type { RemoteSessionProvider } from './types'

test('provider conformance covers open, viewer, cancellation and idempotent close', async () => {
  const closed = new Set<string>()
  const provider: RemoteSessionProvider = {
    async open() { return { providerSessionId: 'provider-1' } },
    async viewer({ signal }) { if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); return { url: 'https://relay.example/view', expiresAt: new Date(Date.now() + 60_000).toISOString() } },
    async close({ session }) { closed.add(session.id) },
  }
  const report = await verifyRemoteSessionProviderConformance(provider)
  assert.deepEqual(report, { open: true, viewer: true, closeIdempotent: true, cancellationPropagated: true })
  assert.equal(closed.has('session-1'), true)
})
