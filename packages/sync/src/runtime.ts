import type {
  ConnectorPullResult,
  ConnectorRunContext,
  SyncConnector,
  SyncEntityKey,
  SyncRecord,
} from './types'

export type SyncRunStatus =
  | 'running'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
export type SyncRun = {
  id: string
  tenantId: string
  connectionId: string
  status: SyncRunStatus
  pulled: number
  applied: number
  failed: number
  archived: number
  cursor?: Record<string, unknown> | null
  error?: string
}
export type SyncApplyResult = { targetId: string; changed: boolean }
export interface SyncTarget {
  apply(
    record: SyncRecord,
    context: { tenantId: string; connectionId: string; dryRun: boolean },
  ): Promise<SyncApplyResult>
  archiveMissing?(
    entity: SyncEntityKey,
    seenExternalIds: ReadonlySet<string>,
    context: { tenantId: string; connectionId: string; dryRun: boolean },
  ): Promise<number>
}
export interface SyncRunStore {
  begin(input: { tenantId: string; connectionId: string }): Promise<SyncRun>
  finish(run: SyncRun): Promise<void>
}
export type RunSyncOptions = {
  tenantId: string
  connectionId: string
  connector: SyncConnector
  connectorContext: Omit<ConnectorRunContext, 'tenantId' | 'connectionId'>
  target: SyncTarget
  store: SyncRunStore
  dryRun?: boolean
  maxRecords?: number
}

export async function runSync(options: RunSyncOptions): Promise<SyncRun> {
  let run = await options.store.begin({
    tenantId: options.tenantId,
    connectionId: options.connectionId,
  })
  const context: ConnectorRunContext = {
    ...options.connectorContext,
    tenantId: options.tenantId,
    connectionId: options.connectionId,
  }
  try {
    const raw = await options.connector.pull(context)
    const result: ConnectorPullResult = Array.isArray(raw)
      ? { records: raw }
      : raw
    const limit = options.maxRecords ?? 100_000
    if (result.records.length > limit)
      throw new Error(`Sync pull exceeded the ${limit} record safety limit`)
    const seen = new Map<SyncEntityKey, Set<string>>()
    let applied = 0
    let failed = 0
    for (const record of result.records) {
      if (!record.entity || !record.externalId) {
        failed++
        context.log(
          'error',
          'Skipped sync record without entity or external id',
        )
        continue
      }
      const ids = seen.get(record.entity) ?? new Set<string>()
      ids.add(record.externalId)
      seen.set(record.entity, ids)
      try {
        await options.target.apply(record, {
          tenantId: options.tenantId,
          connectionId: options.connectionId,
          dryRun: options.dryRun ?? false,
        })
        applied++
      } catch (error) {
        failed++
        context.log('error', 'Failed to apply sync record', {
          entity: record.entity,
          externalId: record.externalId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    const archivePlan = planSnapshotArchives(
      result.authoritativeEntities ?? [],
      Object.fromEntries([...seen].map(([entity, ids]) => [entity, ids.size])),
      failed,
    )
    let archived = 0
    if (options.target.archiveMissing)
      for (const entity of archivePlan.eligible)
        archived += await options.target.archiveMissing(
          entity,
          seen.get(entity) ?? new Set(),
          {
            tenantId: options.tenantId,
            connectionId: options.connectionId,
            dryRun: options.dryRun ?? false,
          },
        )
    run = {
      ...run,
      status: failed ? 'completed_with_errors' : 'completed',
      pulled: result.records.length,
      applied,
      failed,
      archived,
      cursor: result.nextCursor,
    }
    await options.store.finish(run)
    return run
  } catch (error) {
    run = {
      ...run,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
    await options.store.finish(run)
    throw error
  }
}

export function planSnapshotArchives(
  authoritativeEntities: readonly SyncEntityKey[],
  seenCounts: Readonly<Record<string, number | undefined>>,
  processingFailures: number,
) {
  const entities = [...new Set(authoritativeEntities)]
  if (processingFailures > 0)
    return {
      eligible: [] as SyncEntityKey[],
      blockedEmpty: [] as SyncEntityKey[],
      blockedByFailures: true,
      missingAuthority: entities.length === 0,
    }
  const eligible: SyncEntityKey[] = []
  const blockedEmpty: SyncEntityKey[] = []
  for (const entity of entities)
    ((seenCounts[entity] ?? 0) > 0 ? eligible : blockedEmpty).push(entity)
  return {
    eligible,
    blockedEmpty,
    blockedByFailures: false,
    missingAuthority: entities.length === 0,
  }
}

export function createMemorySyncRunStore(): SyncRunStore & { runs: SyncRun[] } {
  const runs: SyncRun[] = []
  return {
    runs,
    async begin(input) {
      const run: SyncRun = {
        ...input,
        id: crypto.randomUUID(),
        status: 'running',
        pulled: 0,
        applied: 0,
        failed: 0,
        archived: 0,
      }
      runs.push(run)
      return run
    },
    async finish(run) {
      const index = runs.findIndex((entry) => entry.id === run.id)
      if (index >= 0) runs[index] = run
    },
  }
}
