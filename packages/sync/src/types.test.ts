import assert from 'node:assert/strict'
import test from 'node:test'
import { toConnectorSummary, type SyncConnector } from './types'

test('connector summaries preserve the production metadata flags and icon key', () => {
  const connector: SyncConnector = {
    key: 'managed',
    name: 'Managed source',
    description: 'Connect through an application-owned provider.',
    kind: 'provider',
    iconKey: 'cloud',
    entities: ['record'],
    supportsIntrospection: true,
    supportsConnect: true,
    async pull() {
      return []
    },
  }

  assert.deepEqual(toConnectorSummary(connector), {
    key: 'managed',
    name: 'Managed source',
    description: 'Connect through an application-owned provider.',
    kind: 'provider',
    iconKey: 'cloud',
    entities: ['record'],
    configFields: [],
    secretFields: [],
    supportsIntrospection: true,
    supportsPush: false,
    supportsConnect: true,
  })
})
