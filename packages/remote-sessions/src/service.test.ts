import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMemoryRemoteSessionStore } from './memory'
import { createRemoteSessionService } from './service'
import type { RemoteSessionProvider, RemoteTarget } from './types'

const target: RemoteTarget = { id: 'computer-1', tenantId: 'tenant-1', name: 'Front desk', host: '192.0.2.20', port: 3389, protocol: 'rdp' }

function provider(): RemoteSessionProvider {
  return {
    async open() { return { providerSessionId: 'provider-1' } },
    async viewer({ signal }) { if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); return { url: 'https://relay.example/view', expiresAt: new Date(Date.now() + 60_000).toISOString() } },
    async *command() { yield { kind: 'stdout', text: 'ok\n' }; yield { kind: 'exit', exitCode: 0, signal: null } },
    async control() { return { ok: true, frame: { mimeType: 'image/png', data: 'frame' } } },
    async close() {},
  }
}

test('remote sessions record immutable lifecycle, fenced leases, commands and release', async () => {
  const store = createMemoryRemoteSessionStore()
  let n = 0
  const service = createRemoteSessionService({ store, provider: provider(), policy: { allowOpen: () => true, allowCommand: () => true, allowViewer: () => true }, idFactory: () => `id-${++n}` })
  const session = await service.open({ target, kind: 'computer', runId: 'run-1', personId: 'person-1' })
  const lease = await service.lease({ tenantId: target.tenantId, sessionId: session.id, holder: 'user-1', purpose: 'observe work', scope: 'observe' })
  assert.equal(lease.fence, 1)
  const viewer = await service.viewer({ tenantId: target.tenantId, sessionId: session.id, leaseId: lease.id })
  assert.equal(viewer.kind === 'guacamole' ? viewer.bridgeWsUrl : viewer.url, 'https://relay.example/view')
  const command = await service.command({ tenantId: target.tenantId, sessionId: session.id, command: 'hostname' })
  assert.equal(command.exitCode, 0)
  const control = await service.control({ tenantId: target.tenantId, sessionId: session.id, action: { action: 'click', x: 10, y: 20 } })
  assert.equal(control.result.frame?.data, 'frame')
  await service.release({ tenantId: target.tenantId, leaseId: lease.id })
  await assert.rejects(service.viewer({ tenantId: target.tenantId, sessionId: session.id, leaseId: lease.id }), /no longer active/)
  const events = await store.eventsAfter(target.tenantId, session.id, 0, 100)
  assert.deepEqual(events.map((event) => event.kind), ['session_opened', 'session_connected', 'lease_granted', 'command_started', 'command_output', 'command_completed', 'control_started', 'control_completed', 'frame', 'lease_released'])
  await assert.rejects(store.appendEvent(events[0]!), /immutable history/)
})
