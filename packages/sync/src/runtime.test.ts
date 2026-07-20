import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMemorySyncRunStore,
  planSnapshotArchives,
  runSync,
} from './runtime'

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

test('sync applies connector records and advances the cursor', async () => {
  const store = createMemorySyncRunStore()
  const applied: string[] = []
  const run = await runSync({
    tenantId: 't1',
    connectionId: 'c1',
    store,
    connectorContext: { config: {}, secrets: {}, log() {} },
    connector: {
      key: 'fixture',
      name: 'Fixture',
      description: '',
      kind: 'native',
      entities: ['people'],
      async pull() {
        return {
          records: [
            { entity: 'people', externalId: '1', data: { name: 'Ada' } },
          ],
          nextCursor: { page: 2 },
          authoritativeEntities: ['people'],
        }
      },
    },
    target: {
      async apply(record) {
        applied.push(record.externalId)
        return { targetId: record.externalId, changed: true }
      },
    },
  })
  assert.equal(run.status, 'completed')
  assert.deepEqual(run.cursor, { page: 2 })
  assert.deepEqual(applied, ['1'])
})
