import { and, eq, isNull } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type {
  SyncConnectionRecord,
  SyncPersistence,
  SyncRunFinalization,
  SyncRunStart,
} from './runtime'
import {
  syncConnections,
  syncRecordChanges,
  syncRuns,
} from './schema'

type Db = NodePgDatabase<Record<string, never>>
type TransactionCallback = Parameters<Db['transaction']>[0]
export type SyncDrizzleTransaction = Parameters<TransactionCallback>[0]

export type SyncTenantRunner = <T>(
  tenantId: string,
  operation: () => Promise<T>,
) => Promise<T>

export function createDrizzleSyncPersistence(
  db: Db,
  withTenant: SyncTenantRunner,
): SyncPersistence<SyncDrizzleTransaction> {
  return {
    async loadConnection(input) {
      const row = await withTenant(input.tenantId, async () => {
        const [found] = await db
          .select()
          .from(syncConnections)
          .where(
            and(
              eq(syncConnections.tenantId, input.tenantId),
              eq(syncConnections.id, input.connectionId),
              isNull(syncConnections.deletedAt),
            ),
          )
          .limit(1)
        return found
      })
      return row ? toConnection(row) : null
    },
    async createRun(input) {
      const row = await withTenant(input.tenantId, async () => {
        const [created] = await db
          .insert(syncRuns)
          .values(toRunStart(input))
          .returning({ id: syncRuns.id })
        return created
      })
      if (!row) throw new Error('Sync run was not created')
      return row.id
    },
    async transaction(tenantId, operation) {
      return withTenant(tenantId, () => db.transaction(operation))
    },
    async savepoint(transaction, operation) {
      return transaction.transaction(operation)
    },
    async recordChange(transaction, change) {
      await transaction.insert(syncRecordChanges).values(change)
    },
    async finalize(input) {
      await withTenant(input.run.tenantId, () => finalizeRun(db, input))
    },
  }
}

function toConnection(
  row: typeof syncConnections.$inferSelect,
): SyncConnectionRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    connectorKey: row.connectorKey,
    name: row.name,
    status: row.status,
    enabled: row.enabled,
    config: row.config,
    secrets: row.secrets,
    cursor: row.cursor,
    lastRunId: row.lastRunId,
    lastRunAt: row.lastRunAt,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
  }
}

function toRunStart(input: SyncRunStart): typeof syncRuns.$inferInsert {
  return {
    tenantId: input.tenantId,
    connectionId: input.connectionId,
    trigger: input.trigger,
    dryRun: input.dryRun,
    status: 'running',
    startedAt: input.startedAt,
    cursorBefore: input.cursorBefore,
    cursorAfter: input.cursorAfter,
  }
}

async function finalizeRun(db: Db, input: SyncRunFinalization): Promise<void> {
  await db.transaction(async (transaction) => {
    await transaction
      .update(syncRuns)
      .set({
        status: input.run.status,
        completedAt: input.run.completedAt,
        durationMs: input.run.durationMs,
        stats: input.run.stats,
        cursorAfter: input.run.cursorAfter,
        error: input.run.error,
        log: input.run.log,
        updatedAt: input.run.completedAt ?? new Date(),
      })
      .where(
        and(
          eq(syncRuns.tenantId, input.run.tenantId),
          eq(syncRuns.id, input.run.id),
        ),
      )

    const connectionPatch = input.connection.updateLastRun
      ? {
          status: input.connection.status,
          lastError: input.connection.lastError,
          cursor: input.connection.cursor,
          lastRunId: input.connection.lastRunId,
          lastRunAt: input.connection.lastRunAt,
          lastStatus: input.connection.lastStatus,
          updatedAt: input.connection.lastRunAt,
        }
      : {
          status: input.connection.status,
          lastError: input.connection.lastError,
          updatedAt: input.connection.lastRunAt,
        }
    await transaction
      .update(syncConnections)
      .set(connectionPatch)
      .where(
        and(
          eq(syncConnections.tenantId, input.run.tenantId),
          eq(syncConnections.id, input.run.connectionId),
        ),
      )
  })
}

export {
  syncConnections,
  syncCrosswalk,
  syncRecordChanges,
  syncRuns,
  SYNC_TENANT_TABLES,
} from './schema'
