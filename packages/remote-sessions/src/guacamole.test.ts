import assert from 'node:assert/strict'
import test from 'node:test'
import { guacamoleConnectQuery } from './guacamole'

test('guacamoleConnectQuery binds an encrypted connection to its session and lease', () => {
  const query = new URLSearchParams(guacamoleConnectQuery({
    connection: {
      protocol: 'rdp',
      host: 'workstation.internal',
      port: 3389,
      username: 'operator',
      password: 'never-in-query',
      scope: 'observe',
    },
    cipherKey: Buffer.alloc(32, 7),
    sessionId: 'session-1',
    leaseId: 'lease-1',
  }))

  assert.equal(query.get('sessionId'), 'session-1')
  assert.equal(query.get('leaseId'), 'lease-1')
  assert.equal(query.get('scope'), 'observe')
  assert.ok(query.get('token'))
  assert.doesNotMatch(query.toString(), /never-in-query|workstation\.internal|operator/)
})

test('guacamoleConnectQuery rejects an invalid cipher key', () => {
  assert.throws(() => guacamoleConnectQuery({
    connection: { protocol: 'vnc', host: 'workstation.internal', port: 5900, scope: 'control' },
    cipherKey: Buffer.alloc(16),
    sessionId: 'session-1',
    leaseId: 'lease-1',
  }), /exactly 32 bytes/)
})
