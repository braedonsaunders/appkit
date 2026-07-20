import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { SyncRun, SyncRunStore } from './runtime'
import { syncConnections, syncRuns } from './schema'
type Db = NodePgDatabase<Record<string, never>>
export function createDrizzleSyncRunStore(db: Db): SyncRunStore {
  return {
    async begin(input) {
      const [row] = await db
        .insert(syncRuns)
        .values({ ...input, status: 'running' })
        .returning()
      if (!row) throw new Error('Sync run was not created')
      return toRun(row)
    },
    async finish(run) {
      await db
        .update(syncRuns)
        .set({
          status: run.status,
          pulled: run.pulled,
          applied: run.applied,
          failed: run.failed,
          archived: run.archived,
          cursor: run.cursor,
          error: run.error,
          completedAt: new Date(),
        })
        .where(
          and(eq(syncRuns.tenantId, run.tenantId), eq(syncRuns.id, run.id)),
        )
      if (run.status !== 'failed')
        await db
          .update(syncConnections)
          .set({ cursor: run.cursor, updatedAt: new Date() })
          .where(
            and(
              eq(syncConnections.tenantId, run.tenantId),
              eq(syncConnections.id, run.connectionId),
            ),
          )
    },
  }
}
function toRun(row: typeof syncRuns.$inferSelect): SyncRun {
  return {
    id: row.id,
    tenantId: row.tenantId,
    connectionId: row.connectionId,
    status: row.status,
    pulled: row.pulled,
    applied: row.applied,
    failed: row.failed,
    archived: row.archived,
    cursor: row.cursor,
    ...(row.error ? { error: row.error } : {}),
  }
}
export {
  syncConnections,
  syncRuns,
  syncCrosswalk,
  SYNC_TENANT_TABLES,
} from './schema'
