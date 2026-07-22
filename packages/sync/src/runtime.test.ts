import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMemorySyncPersistence,
  createMemorySyncTarget,
  createSyncOrchestrator,
  planSnapshotArchives,
  runSync,
  type MemorySyncTransaction,
  type SyncApplyResult,
  type SyncConnectionRecord,
  type SyncTarget,
} from './runtime'
import type { SyncConnector, SyncRecord } from './types'

const CONNECTION: SyncConnectionRecord = {
  id: 'connection-1',
  tenantId: 'tenant-1',
  connectorKey: 'fixture',
  name: 'Fixture',
  status: 'connected',
  enabled: true,
  config: {},
  secrets: {},
  cursor: { page: 1 },
}

function connector(
  pull: SyncConnector['pull'],
): SyncConnector {
  return {
    key: 'fixture',
    name: 'Fixture',
    description: '',
    kind: 'native',
    entities: ['people'],
    pull,
  }
}

function options(input: {
  pull: SyncConnector['pull']
  connection?: SyncConnectionRecord
  target?: SyncTarget<MemorySyncTransaction, undefined>
}) {
  const persistence = createMemorySyncPersistence([
    input.connection ?? CONNECTION,
  ])
  return {
    persistence,
    options: {
      tenantId: 'tenant-1',
      connectionId: 'connection-1',
      trigger: 'manual' as const,
      connectors: { get: () => connector(input.pull) },
      persistence,
      target: input.target ?? createMemorySyncTarget(),
    },
  }
}

test('authoritative snapshots fail closed on empty pulls and record failures', () => {
  assert.deepEqual(
    planSnapshotArchives(['people'], { people: 0 }, 0).blockedEmpty,
    ['people'],
  )
  assert.equal(
    planSnapshotArchives(['people'], { people: 10 }, 1).blockedByFailures,
    true,
  )
})

test('source-shaped orchestration applies records, records changes, logs, and advances a clean cursor', async () => {
  const { persistence, options: runtime } = options({
    pull: async () => ({
      records: [
        { entity: 'people', externalId: '1', data: { name: 'Ada' } },
      ],
      nextCursor: { page: 2 },
      authoritativeEntities: ['people'],
    }),
  })
  const result = await runSync(runtime)

  assert.equal(result.status, 'success')
  assert.deepEqual(result.run?.cursorBefore, { page: 1 })
  assert.deepEqual(result.run?.cursorAfter, { page: 2 })
  assert.deepEqual(persistence.connections[0]?.cursor, { page: 2 })
  assert.equal(result.stats.people?.pulled, 1)
  assert.equal(result.stats.people?.created, 1)
  assert.equal(persistence.changes.length, 1)
  assert.equal(persistence.changes[0]?.action, 'created')
  assert.equal(result.run?.log.at(-1)?.msg, 'Pulled 1 record(s).')
})

test('a failed record rolls back its savepoint, commits its failure ledger, and retains the prior cursor', async () => {
  const target: SyncTarget<MemorySyncTransaction, undefined> = {
    async apply(transaction, record): Promise<SyncApplyResult> {
      transaction.records.set(record.externalId, record.data)
      if (record.externalId === 'bad') throw new Error('invalid source row')
      return {
        action: 'created',
        canonicalId: record.externalId,
        after: record.data,
      }
    },
  }
  const { persistence, options: runtime } = options({
    pull: async () => ({
      records: [
        { entity: 'people', externalId: 'good', data: { name: 'Ada' } },
        { entity: 'people', externalId: 'bad', data: { name: 'Broken' } },
      ],
      nextCursor: { page: 2 },
      mode: 'incremental',
    }),
    target,
  })
  const result = await runSync(runtime)

  assert.equal(result.status, 'partial')
  assert.equal(result.stats.people?.created, 1)
  assert.equal(result.stats.people?.failed, 1)
  assert.equal(persistence.records.has('good'), true)
  assert.equal(persistence.records.has('bad'), false)
  assert.deepEqual(persistence.connections[0]?.cursor, { page: 1 })
  assert.equal(persistence.connections[0]?.lastError, '1 record(s) failed.')
  assert.deepEqual(
    persistence.changes.map((change) => change.action),
    ['created', 'failed'],
  )
  assert.match(persistence.changes[1]?.message ?? '', /invalid source row/)
})

test('a batch transaction failure discards its target and ledger writes and counts every record failed', async () => {
  const { persistence, options: runtime } = options({
    pull: async () => [
      { entity: 'people', externalId: '1', data: { name: 'Ada' } },
      { entity: 'people', externalId: '2', data: { name: 'Grace' } },
    ],
  })
  const originalRecordChange = persistence.recordChange
  let calls = 0
  persistence.recordChange = async (transaction, change) => {
    calls += 1
    await originalRecordChange(transaction, change)
    if (calls >= 2) throw new Error('ledger unavailable')
  }

  const result = await runSync(runtime)
  assert.equal(result.status, 'partial')
  assert.equal(result.stats.people?.pulled, 2)
  assert.equal(result.stats.people?.failed, 2)
  assert.equal(result.stats.people?.created, 0)
  assert.equal(persistence.records.size, 0)
  assert.equal(persistence.changes.length, 0)
})

test('full snapshots archive only explicit non-empty authorities and write archive changes', async () => {
  const archiveConnection: SyncConnectionRecord = {
    ...CONNECTION,
    config: { syncPolicy: { missing: 'archive' } },
  }
  const target: SyncTarget<MemorySyncTransaction, undefined> = {
    async apply(_transaction, record) {
      return {
        action: 'unchanged',
        canonicalId: record.externalId,
        before: record.data,
        after: record.data,
      }
    },
    async archiveMissing(_transaction, entity, seen) {
      assert.equal(entity, 'people')
      assert.deepEqual([...seen], ['1'])
      return [
        {
          externalId: 'removed',
          action: 'archived',
          canonicalId: '00000000-0000-0000-0000-000000000001',
          before: { active: true },
          after: { active: false },
          diff: { active: { before: true, after: false } },
          message: 'Missing from the authoritative snapshot.',
        },
      ]
    },
  }
  const { persistence, options: runtime } = options({
    connection: archiveConnection,
    pull: async () => ({
      records: [
        { entity: 'people', externalId: '1', data: { name: 'Ada' } },
      ],
      mode: 'full',
      authoritativeEntities: ['people'],
    }),
    target,
  })
  const result = await runSync(runtime)

  assert.equal(result.status, 'success')
  assert.equal(result.stats.people?.archived, 1)
  assert.equal(persistence.changes.at(-1)?.action, 'archived')
})

test('empty authoritative snapshots are partial and cannot archive records', async () => {
  let archiveCalled = false
  const { persistence, options: runtime } = options({
    connection: {
      ...CONNECTION,
      config: { syncPolicy: { missing: 'archive' } },
    },
    pull: async () => ({
      records: [],
      mode: 'full',
      authoritativeEntities: ['people'],
    }),
    target: {
      async apply() {
        throw new Error('unreachable')
      },
      async archiveMissing() {
        archiveCalled = true
        return []
      },
    },
  })
  const result = await runSync(runtime)

  assert.equal(result.status, 'partial')
  assert.equal(archiveCalled, false)
  assert.match(result.error ?? '', /full snapshot contained no valid records/)
  assert.deepEqual(persistence.connections[0]?.cursor, { page: 1 })
})

test('preview runs are dry and never replace durable last-run metadata', async () => {
  const connection = {
    ...CONNECTION,
    lastRunId: 'durable-run',
    lastStatus: 'success' as const,
  }
  const { persistence, options: runtime } = options({
    connection,
    pull: async () => [
      { entity: 'people', externalId: '1', data: { name: 'Ada' } },
    ],
  })
  const preview = createSyncOrchestrator({
    connectors: runtime.connectors,
    persistence,
    target: runtime.target,
  })
  const result = await preview({
    tenantId: 'tenant-1',
    connectionId: 'connection-1',
    trigger: 'preview',
  })

  assert.equal(result.run?.dryRun, true)
  assert.equal(persistence.records.size, 0)
  assert.equal(persistence.connections[0]?.lastRunId, 'durable-run')
  assert.equal(persistence.connections[0]?.lastStatus, 'success')
})

test('missing connections and unknown connectors fail closed with source-shaped results', async () => {
  const persistence = createMemorySyncPersistence()
  const missing = await runSync({
    tenantId: 'tenant-1',
    connectionId: 'missing',
    trigger: 'manual',
    connectors: { get: () => null },
    persistence,
    target: createMemorySyncTarget(),
  })
  assert.deepEqual(missing, {
    runId: null,
    status: 'error',
    stats: {},
    error: 'Connection not found.',
    run: null,
  })

  const configured = createMemorySyncPersistence([CONNECTION])
  const unknown = await runSync({
    tenantId: 'tenant-1',
    connectionId: 'connection-1',
    trigger: 'manual',
    connectors: { get: () => null },
    persistence: configured,
    target: createMemorySyncTarget(),
  })
  assert.equal(unknown.status, 'error')
  assert.match(unknown.error ?? '', /Unknown connector/)
  assert.equal(configured.connections[0]?.status, 'error')
})

test('secret resolution and ownership policy are injected without product coupling', async () => {
  let resolvedApiKey = ''
  let ownership = ''
  const { options: runtime } = options({
    connection: {
      ...CONNECTION,
      secrets: { apiKey: { ciphertext: 'sealed' } },
      config: { syncPolicy: { ownership: 'manual_wins' } },
    },
    pull: async (context) => {
      resolvedApiKey = context.secrets.apiKey ?? ''
      return [
        { entity: 'people', externalId: '1', data: { name: 'Ada' } },
      ]
    },
    target: {
      async apply(_transaction, record, context) {
        ownership = context.ownershipMode
        return {
          action: 'created',
          canonicalId: record.externalId,
          after: record.data,
        }
      },
    },
  })
  const result = await runSync({
    ...runtime,
    resolveSecrets: () => ({ apiKey: 'resolved' }),
  })

  assert.equal(result.status, 'success')
  assert.equal(resolvedApiKey, 'resolved')
  assert.equal(ownership, 'manual_wins')
})

test('the additive pull ceiling fails before any target write', async () => {
  const { persistence, options: runtime } = options({
    pull: async () => [
      { entity: 'people', externalId: '1', data: { name: 'Ada' } },
      { entity: 'people', externalId: '2', data: { name: 'Grace' } },
    ],
  })
  const result = await runSync({ ...runtime, maxRecords: 1 })

  assert.equal(result.status, 'error')
  assert.match(result.error ?? '', /exceeded the 1 record safety limit/)
  assert.equal(persistence.records.size, 0)
  assert.equal(persistence.changes.length, 0)
  assert.deepEqual(persistence.connections[0]?.cursor, { page: 1 })
})

test('generic record envelopes remain application-defined', () => {
  const record: SyncRecord<'project', { name: string }> = {
    entity: 'project',
    externalId: 'P-1',
    data: { name: 'North Tower' },
  }
  assert.equal(record.data.name, 'North Tower')
})
