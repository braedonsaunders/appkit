import type { RemoteSessionProvider, RemoteTarget } from './types'

export async function verifyRemoteSessionProviderConformance(provider: RemoteSessionProvider): Promise<{
  open: true; viewer: true; closeIdempotent: true; cancellationPropagated: true
}> {
  const target: RemoteTarget = { id: 'target-1', tenantId: 'tenant-1', name: 'Test computer', host: '192.0.2.10', port: 3389, protocol: 'rdp' }
  const session = {
    id: 'session-1', tenantId: target.tenantId, targetId: target.id, runId: null, personId: null,
    kind: 'computer' as const, protocol: target.protocol, status: 'opening' as const, providerSessionId: null,
    openedAt: new Date(0).toISOString(), connectedAt: null, closedAt: null, lastActivityAt: new Date(0).toISOString(), lastError: null,
  }
  const controller = new AbortController()
  const opened = await provider.open({ session, target, credential: null, scope: 'observe', signal: controller.signal })
  const connected = { ...session, status: 'connected' as const, providerSessionId: opened.providerSessionId }
  const lease = { id: 'lease-1', tenantId: target.tenantId, sessionId: session.id, holder: 'conformance', purpose: 'provider verification', scope: 'observe' as const, exclusive: false, grantedAt: new Date(0).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), fence: 1 }
  const viewer = await provider.viewer({ session: connected, lease, target, credential: null, signal: controller.signal })
  const hasTransport = viewer.kind === 'guacamole' ? Boolean(viewer.bridgeWsUrl && viewer.connectQuery) : Boolean(viewer.url)
  if (!opened.providerSessionId || !hasTransport || !viewer.expiresAt) throw new Error('Remote provider did not return a usable connection.')
  controller.abort()
  let cancellationPropagated = false
  try { await provider.viewer({ session: connected, lease, target, credential: null, signal: controller.signal }) } catch (error) {
    cancellationPropagated = error instanceof Error && error.name === 'AbortError'
  }
  if (!cancellationPropagated) throw new Error('Remote provider did not propagate cancellation.')
  const signal = new AbortController().signal
  await provider.close({ session: connected, target, credential: null, reason: 'conformance', signal })
  await provider.close({ session: connected, target, credential: null, reason: 'conformance', signal })
  return { open: true, viewer: true, closeIdempotent: true, cancellationPropagated: true }
}
