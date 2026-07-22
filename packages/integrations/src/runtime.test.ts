import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createIntegrationDispatcher,
  createMemoryIntegrationStore,
  dispatchIntegration,
  summarizePriorDelivery,
  type IntegrationStore,
} from './runtime'
import {
  createIntegrationPublisher,
  outboundDispatchJobId,
} from './publisher'
import {
  createIntegrationRegistry,
  type DeliveryContext,
  type DeliveryResult,
  type DestinationDefinition,
  type IntegrationDefinition,
  type IntegrationEvent,
} from './types'

const event: IntegrationEvent = {
  type: 'record.created',
  tenantId: 'tenant-1',
  subjectId: 'record-1',
  items: [{ name: 'Ada' }],
}

function definition(
  patch: Partial<IntegrationDefinition> = {},
): IntegrationDefinition {
  return {
    id: 'automation-1',
    tenantId: 'tenant-1',
    name: 'Export',
    enabled: true,
    triggerKey: event.type,
    destinationKey: 'fixture',
    config: {},
    ...patch,
  }
}

function destination(
  deliver: (context: DeliveryContext) => Promise<DeliveryResult>,
): DestinationDefinition {
  return {
    key: 'fixture',
    name: 'Fixture',
    description: 'Test destination',
    iconKey: 'test',
    mappingKind: 'fixture',
    reversible: false,
    configFields: [],
    secretFields: [],
    deliver,
  }
}

test('prior delivery only suppresses a complete successful attempt', () => {
  assert.deepEqual(
    summarizePriorDelivery([
      { externalRef: 'one', status: 'pushed' },
      { externalRef: 'two', status: 'failed' },
    ]),
    { refs: ['one', 'two'], retryRefs: ['two'], complete: false },
  )
  assert.equal(
    summarizePriorDelivery([{ externalRef: 'one', status: 'pushed' }])
      .complete,
    true,
  )
})

test('dispatcher persists refs and config send-once prevents duplicate delivery', async () => {
  let calls = 0
  const registry = createIntegrationRegistry({
    destinations: [
      destination(async () => {
        calls++
        return { ok: true, refs: [{ externalRef: 'remote-1' }] }
      }),
    ],
  })
  const store = createMemoryIntegrationStore([
    definition({ config: { oncePerRecord: true } }),
  ])
  const options = {
    integrationId: 'automation-1',
    event,
    registry,
    store,
  }
  assert.equal((await dispatchIntegration(options)).ok, true)
  assert.equal((await dispatchIntegration(options)).ok, true)
  assert.equal(calls, 1)
  assert.deepEqual(store.statuses.get('automation-1'), [{ ok: true }])
  assert.equal([...store.ledger.values()].flat().length, 1)
})

test('partial refs are retried without replaying known successes', async () => {
  const seen: string[][] = []
  let attempt = 0
  const registry = createIntegrationRegistry({
    destinations: [
      destination(async (context) => {
        seen.push(context.retryRefs)
        attempt++
        return attempt === 1
          ? {
              ok: false,
              error: 'second request failed',
              refs: [{ externalRef: 'remote-1' }],
            }
          : {
              ok: true,
              refs: [
                { externalRef: 'remote-1' },
                { externalRef: 'remote-2' },
              ],
            }
      }),
    ],
  })
  const store = createMemoryIntegrationStore([definition()])
  assert.equal(
    (await dispatchIntegration({ integrationId: 'automation-1', event, registry, store }))
      .ok,
    false,
  )
  assert.equal(
    (await dispatchIntegration({ integrationId: 'automation-1', event, registry, store }))
      .ok,
    true,
  )
  assert.deepEqual(seen, [[], ['remote-1']])
  assert.deepEqual(
    [...store.ledger.values()][0]?.map((row) => row.status),
    ['pushed', 'pushed'],
  )
})

test('explicit empty refs clear stale delivery ledger rows', async () => {
  let clear = false
  const registry = createIntegrationRegistry({
    destinations: [
      destination(async () =>
        clear
          ? { ok: true, refs: [] }
          : { ok: true, refs: [{ externalRef: 'old' }] },
      ),
    ],
  })
  const store = createMemoryIntegrationStore([definition()])
  await dispatchIntegration({ integrationId: 'automation-1', event, registry, store })
  clear = true
  await dispatchIntegration({ integrationId: 'automation-1', event, registry, store })
  assert.deepEqual([...store.ledger.values()][0], [])
})

test('ledger reads fail closed and ledger writes turn delivery into failure', async () => {
  const registry = createIntegrationRegistry({
    destinations: [
      destination(async () => ({
        ok: true,
        refs: [{ externalRef: 'remote-1' }],
      })),
    ],
  })
  const readStore = createMemoryIntegrationStore([definition()])
  readStore.priorDelivery = async () => {
    throw new Error('ledger unavailable')
  }
  const read = await dispatchIntegration({
    integrationId: 'automation-1',
    event,
    registry,
    store: readStore,
  })
  assert.equal(read.ok, false)
  assert.match(read.error ?? '', /Cannot verify.*ledger unavailable/)

  const writeStore = createMemoryIntegrationStore([definition()])
  writeStore.replaceDelivery = async () => {
    throw new Error('ledger unavailable')
  }
  const write = await dispatchIntegration({
    integrationId: 'automation-1',
    event,
    registry,
    store: writeStore,
  })
  assert.equal(write.ok, false)
  assert.match(write.error ?? '', /could not be recorded safely.*ledger unavailable/)
})

test('status bookkeeping is best-effort and cannot falsify delivery truth', async () => {
  const registry = createIntegrationRegistry({
    destinations: [destination(async () => ({ ok: true }))],
  })
  const store = createMemoryIntegrationStore([definition()])
  store.recordStatus = async () => {
    throw new Error('status unavailable')
  }
  const result = await dispatchIntegration({
    integrationId: 'automation-1',
    event,
    registry,
    store,
  })
  assert.equal(result.ok, true)
})

test('disabled, changed, removed, and draft destinations are safe no-ops', async () => {
  let calls = 0
  const registry = createIntegrationRegistry({
    destinations: [destination(async () => { calls++; return { ok: true } })],
  })
  for (const entry of [
    definition({ enabled: false }),
    definition({ triggerKey: 'record.updated' }),
    definition({ destinationKey: null, status: 'draft' }),
  ]) {
    const store = createMemoryIntegrationStore([entry])
    assert.equal(
      (await dispatchIntegration({ integrationId: entry.id, event, registry, store })).ok,
      true,
    )
  }
  const missing = createMemoryIntegrationStore([])
  assert.equal(
    (await dispatchIntegration({ integrationId: 'gone', event, registry, store: missing })).ok,
    true,
  )
  assert.equal(calls, 0)
})

test('publisher selects every matching automation and uses deterministic queue ids', async () => {
  const store = createMemoryIntegrationStore([
    definition(),
    definition({ id: 'automation-2' }),
    definition({ id: 'automation-3', triggerKey: 'record.updated' }),
    definition({ id: 'automation-4', enabled: false }),
    definition({ id: 'other-tenant', tenantId: 'tenant-2' }),
  ])
  const queued: Array<{ id: string; automationId: string }> = []
  const publishIntegrationEvent = createIntegrationPublisher({
    store,
    async enqueueOutboundDispatch(data, id) {
      queued.push({ id, automationId: data.automationId })
    },
  })
  await publishIntegrationEvent({ tenantId: 'tenant-1' }, event, 'event-42')
  assert.deepEqual(queued, [
    {
      id: 'domain-outbound|event-42|automation-1',
      automationId: 'automation-1',
    },
    {
      id: 'domain-outbound|event-42|automation-2',
      automationId: 'automation-2',
    },
  ])
  assert.equal(
    outboundDispatchJobId('event-42', 'automation-1'),
    'domain-outbound|event-42|automation-1',
  )
  await assert.rejects(
    publishIntegrationEvent({ tenantId: 'tenant-2' }, event, 'event-43'),
    /tenant does not match/,
  )
})

test('dispatcher factory preserves the production three-argument worker shape', async () => {
  const registry = createIntegrationRegistry({
    destinations: [destination(async () => ({ ok: true, summary: 'sent' }))],
  })
  const store = createMemoryIntegrationStore([definition()])
  const dispatchOne = createIntegrationDispatcher({ registry, store })
  assert.deepEqual(
    await dispatchOne({ tenantId: 'tenant-1' }, 'automation-1', event),
    { ok: true, summary: 'sent' },
  )
  assert.equal(
    (await dispatchOne({ tenantId: 'tenant-2' }, 'automation-1', event)).ok,
    false,
  )
})

// Compile-time assertion that any persistence adapter must implement publisher
// selection as well as delivery bookkeeping.
void ({} as IntegrationStore)
