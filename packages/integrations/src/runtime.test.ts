import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMemoryIntegrationStore,
  dispatchIntegration,
  summarizePriorDelivery,
} from './runtime'
import { createIntegrationRegistry } from './types'

test('prior delivery only suppresses a complete successful attempt', () => {
  assert.equal(
    summarizePriorDelivery([{ externalRef: 'a', status: 'pushed' }]).complete,
    true,
  )
  assert.deepEqual(
    summarizePriorDelivery([{ externalRef: 'a', status: 'failed' }]).retryRefs,
    ['a'],
  )
})

test('dispatcher persists refs and once-per-record avoids duplicate delivery', async () => {
  let calls = 0
  const registry = createIntegrationRegistry({
    destinations: [
      {
        key: 'fixture',
        name: 'Fixture',
        description: '',
        mappingKind: 'fixture',
        reversible: false,
        configFields: [],
        secretFields: [],
        async deliver() {
          calls++
          return { ok: true, refs: [{ externalRef: 'remote-1' }] }
        },
      },
    ],
  })
  const store = createMemoryIntegrationStore([
    {
      id: 'i1',
      tenantId: 't1',
      name: 'Export',
      enabled: true,
      triggerKey: 'record.created',
      destinationKey: 'fixture',
      config: {},
      oncePerRecord: true,
    },
  ])
  const options = {
    integrationId: 'i1',
    event: {
      type: 'record.created',
      tenantId: 't1',
      subjectId: 'r1',
      items: [{ name: 'Ada' }],
    },
    registry,
    store,
  }
  assert.equal((await dispatchIntegration(options)).ok, true)
  assert.equal((await dispatchIntegration(options)).ok, true)
  assert.equal(calls, 1)
})
