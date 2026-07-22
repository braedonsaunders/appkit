import { planSnapshotArchives } from './snapshot-policy'
import type { SyncOwnershipMode } from './person-sync-policy'
import type {
  ConnectorPullResult,
  ConnectorRunContext,
  ResolvedSecrets,
  SyncConnector,
  SyncEntityKey,
  SyncEntityStat,
  SyncLogger,
  SyncRecord,
  SyncRecordAction,
  SyncRecordDiff,
  SyncRunLogLine,
  SyncRunStatus,
  SyncRunTrigger,
} from './types'

const DEFAULT_BATCH_SIZE = 250
const DEFAULT_MAX_RECORDS = 100_000

type JsonRecord = Record<string, unknown>

export type SyncConnectionRecord = {
  id: string
  tenantId: string
  connectorKey: string
  name?: string
  status?: 'draft' | 'connected' | 'error' | 'disabled'
  enabled?: boolean
  config: Record<string, unknown>
  secrets: Record<string, unknown>
  cursor: Record<string, unknown>
  lastRunId?: string | null
  lastRunAt?: Date | null
  lastStatus?: SyncRunStatus | null
  lastError?: string | null
}

export type SyncRun = {
  id: string
  tenantId: string
  connectionId: string
  trigger: SyncRunTrigger
  dryRun: boolean
  status: SyncRunStatus
  startedAt: Date
  completedAt: Date | null
  durationMs: number | null
  stats: Record<string, SyncEntityStat>
  cursorBefore: Record<string, unknown>
  cursorAfter: Record<string, unknown>
  error: string | null
  log: SyncRunLogLine[]
}

export type SyncRecordChange = {
  id?: string
  tenantId: string
  connectionId: string
  runId: string
  entity: SyncEntityKey
  externalId: string
  canonicalId: string | null
  action: SyncRecordAction
  dryRun: boolean
  rowHash: string | null
  before: JsonRecord | null
  after: JsonRecord | null
  diff: SyncRecordDiff | null
  message: string | null
  createdAt?: Date
}

export type SyncApplyResult = {
  action: Exclude<SyncRecordAction, 'failed' | 'archived'>
  canonicalId?: string
  rowHash?: string
  before?: JsonRecord | null
  after?: JsonRecord | null
  diff?: SyncRecordDiff | null
  message?: string
}

export type SyncArchiveResult = {
  externalId: string
  action: 'archived'
  canonicalId: string
  rowHash?: string
  before: JsonRecord
  after: JsonRecord
  diff: SyncRecordDiff
  message: string
}

export type SyncTargetContext<TPrepared = unknown> = {
  tenantId: string
  connectionId: string
  sourceSystem: string
  dryRun: boolean
  ownershipMode: SyncOwnershipMode
  prepared: TPrepared
  log: SyncLogger
}

export interface SyncTarget<TTransaction = unknown, TPrepared = unknown> {
  prepare?(
    transaction: TTransaction,
    context: Omit<SyncTargetContext<TPrepared>, 'prepared'>,
  ): Promise<TPrepared>
  apply(
    transaction: TTransaction,
    record: SyncRecord,
    context: SyncTargetContext<TPrepared>,
  ): Promise<SyncApplyResult>
  archiveMissing?(
    transaction: TTransaction,
    entity: SyncEntityKey,
    seenExternalIds: ReadonlySet<string>,
    context: SyncTargetContext<TPrepared>,
  ): Promise<SyncArchiveResult[]>
  canArchive?(entity: SyncEntityKey): boolean
}

export type SyncRunStart = Pick<
  SyncRun,
  | 'tenantId'
  | 'connectionId'
  | 'trigger'
  | 'dryRun'
  | 'startedAt'
  | 'cursorBefore'
  | 'cursorAfter'
>

export type SyncRunFinalization = {
  run: SyncRun
  connection: {
    status: 'connected' | 'error'
    lastError: string | null
    updateLastRun: boolean
    cursor: Record<string, unknown>
    lastRunId: string | null
    lastRunAt: Date
    lastStatus: SyncRunStatus
  }
}

export interface SyncPersistence<TTransaction = unknown> {
  loadConnection(input: {
    tenantId: string
    connectionId: string
  }): Promise<SyncConnectionRecord | null>
  createRun(input: SyncRunStart): Promise<string>
  transaction<T>(
    tenantId: string,
    operation: (transaction: TTransaction) => Promise<T>,
  ): Promise<T>
  savepoint<T>(
    transaction: TTransaction,
    operation: (transaction: TTransaction) => Promise<T>,
  ): Promise<T>
  recordChange(
    transaction: TTransaction,
    change: Omit<SyncRecordChange, 'id' | 'createdAt'>,
  ): Promise<void>
  finalize(input: SyncRunFinalization): Promise<void>
}

export type SyncConnectorRegistry = {
  get(key: string): SyncConnector | null | undefined
}

export type SyncRuntimeDependencies<TTransaction = unknown, TPrepared = unknown> = {
  connectors: SyncConnectorRegistry
  persistence: SyncPersistence<TTransaction>
  target: SyncTarget<TTransaction, TPrepared>
  resolveSecrets?: (
    secrets: Readonly<Record<string, unknown>>,
    connection: SyncConnectionRecord,
  ) => Promise<ResolvedSecrets> | ResolvedSecrets
  batchSize?: number
  maxRecords?: number
  now?: () => Date
}

export interface RunSyncArgs {
  tenantId: string
  connectionId: string
  trigger: SyncRunTrigger
  dryRun?: boolean
}

export interface RunSyncResult {
  runId: string | null
  status: SyncRunStatus
  stats: Record<string, SyncEntityStat>
  error: string | null
  run: SyncRun | null
}

export type RunSyncOptions<TTransaction = unknown, TPrepared = unknown> =
  RunSyncArgs & SyncRuntimeDependencies<TTransaction, TPrepared>

function emptyStat(): SyncEntityStat {
  return {
    pulled: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    archived: 0,
    conflict: 0,
  }
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function normalizePull(
  pulled: SyncRecord[] | ConnectorPullResult,
): Required<ConnectorPullResult> {
  if (Array.isArray(pulled)) {
    return {
      records: pulled,
      nextCursor: null,
      mode: 'full',
      authoritativeEntities: [...new Set(pulled.map((record) => record.entity))],
    }
  }
  return {
    records: pulled.records,
    nextCursor: pulled.nextCursor ?? null,
    mode: pulled.mode ?? 'full',
    authoritativeEntities:
      pulled.authoritativeEntities ?? [
        ...new Set(pulled.records.map((record) => record.entity)),
      ],
  }
}

function policyOf(config: Record<string, unknown>): {
  missing: 'keep' | 'archive'
  ownership: SyncOwnershipMode
} {
  const raw = config.syncPolicy as
    | { missing?: unknown; ownership?: unknown }
    | undefined
  return {
    missing: raw?.missing === 'archive' ? 'archive' : 'keep',
    ownership:
      raw?.ownership === 'manual_wins' ? 'manual_wins' : 'source_wins',
  }
}

function addAction(
  stats: Record<string, SyncEntityStat>,
  entity: SyncEntityKey,
  action: SyncRecordAction,
): void {
  const stat = (stats[entity] ??= emptyStat())
  stat[action] += 1
}

function mergeStats(
  target: Record<string, SyncEntityStat>,
  source: Readonly<Record<string, SyncEntityStat>>,
): void {
  for (const [entity, sourceStat] of Object.entries(source)) {
    const targetStat = (target[entity] ??= emptyStat())
    for (const key of Object.keys(sourceStat) as (keyof SyncEntityStat)[]) {
      targetStat[key] += sourceStat[key]
    }
  }
}

function defaultResolveSecrets(
  secrets: Readonly<Record<string, unknown>>,
): ResolvedSecrets {
  const resolved: ResolvedSecrets = {}
  for (const [key, value] of Object.entries(secrets)) {
    if (typeof value === 'string') resolved[key] = value
  }
  return resolved
}

function changeFromResult(
  base: Pick<
    SyncRecordChange,
    'tenantId' | 'connectionId' | 'runId' | 'entity' | 'externalId' | 'dryRun'
  >,
  result:
    | SyncApplyResult
    | SyncArchiveResult
    | { action: 'failed'; message: string },
): Omit<SyncRecordChange, 'id' | 'createdAt'> {
  return {
    ...base,
    canonicalId: 'canonicalId' in result ? (result.canonicalId ?? null) : null,
    action: result.action,
    rowHash: 'rowHash' in result ? (result.rowHash ?? null) : null,
    before: 'before' in result ? (result.before ?? null) : null,
    after: 'after' in result ? (result.after ?? null) : null,
    diff: 'diff' in result ? (result.diff ?? null) : null,
    message: 'message' in result ? (result.message ?? null) : null,
  }
}

export function createSyncOrchestrator<TTransaction, TPrepared>(
  dependencies: SyncRuntimeDependencies<TTransaction, TPrepared>,
): (args: RunSyncArgs) => Promise<RunSyncResult> {
  return (args) => runSync({ ...dependencies, ...args })
}

export async function runSync<TTransaction, TPrepared>(
  options: RunSyncOptions<TTransaction, TPrepared>,
): Promise<RunSyncResult> {
  const {
    tenantId,
    connectionId,
    trigger,
    persistence,
    target,
    connectors,
  } = options
  const now = options.now ?? (() => new Date())
  const dryRun = options.dryRun ?? trigger === 'preview'
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
  const maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
    throw new Error('Sync batch size must be an integer from 1 to 10000')
  }
  if (
    !Number.isSafeInteger(maxRecords) ||
    maxRecords < 1 ||
    maxRecords > 1_000_000
  ) {
    throw new Error('Sync record limit must be an integer from 1 to 1000000')
  }

  const connection = await persistence.loadConnection({ tenantId, connectionId })
  if (!connection) {
    return {
      runId: null,
      status: 'error',
      stats: {},
      error: 'Connection not found.',
      run: null,
    }
  }

  const policy = policyOf(connection.config)
  const cursorBefore = { ...connection.cursor }
  const logLines: SyncRunLogLine[] = []
  const log: SyncLogger = (level, msg) => {
    logLines.push({ at: now().toISOString(), level, msg })
  }
  const startedAt = now()
  const runId = await persistence.createRun({
    tenantId,
    connectionId,
    trigger,
    dryRun,
    startedAt,
    cursorBefore,
    cursorAfter: cursorBefore,
  })

  const finalize = async (
    status: SyncRunStatus,
    stats: Record<string, SyncEntityStat>,
    error: string | null,
    cursorAfter: Record<string, unknown> = cursorBefore,
  ): Promise<RunSyncResult> => {
    const completedAt = now()
    const cleanCursor = status === 'success' ? cursorAfter : cursorBefore
    const run: SyncRun = {
      id: runId,
      tenantId,
      connectionId,
      trigger,
      dryRun,
      status,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      stats,
      cursorBefore,
      cursorAfter,
      error,
      log: [...logLines],
    }
    await persistence.finalize({
      run,
      connection: {
        status: status === 'error' ? 'error' : 'connected',
        lastError: dryRun ? (status === 'error' ? error : null) : error,
        updateLastRun: !dryRun,
        cursor: cleanCursor,
        lastRunId: runId,
        lastRunAt: completedAt,
        lastStatus: status,
      },
    })
    return { runId, status, stats, error, run }
  }

  const connector = connectors.get(connection.connectorKey)
  if (!connector) {
    const error = `Unknown connector "${connection.connectorKey}".`
    log('error', error)
    return finalize('error', {}, error)
  }

  let secrets: ResolvedSecrets
  try {
    secrets = await (options.resolveSecrets ?? defaultResolveSecrets)(
      connection.secrets,
      connection,
    )
  } catch (error) {
    const message = `Failed to resolve connector credentials: ${errMsg(error)}`
    log('error', message)
    return finalize('error', {}, message)
  }

  const connectorContext: ConnectorRunContext = {
    tenantId,
    connectionId,
    config: connection.config,
    secrets,
    cursor: cursorBefore,
    since: cursorBefore,
    log,
  }

  let pulled: Required<ConnectorPullResult>
  try {
    log('info', dryRun ? 'Previewing source records...' : 'Pulling records...')
    pulled = normalizePull(await connector.pull(connectorContext))
    if (pulled.records.length > maxRecords) {
      throw new Error(`Sync pull exceeded the ${maxRecords} record safety limit`)
    }
    log('info', `Pulled ${pulled.records.length} record(s).`)
  } catch (error) {
    const message = errMsg(error)
    log('error', `Pull failed: ${message}`)
    return finalize('error', {}, message)
  }

  const targetBase = {
    tenantId,
    connectionId,
    sourceSystem: connection.connectorKey,
    dryRun,
    ownershipMode: policy.ownership,
    log,
  }
  let prepared: TPrepared
  try {
    prepared = await persistence.transaction(tenantId, async (transaction) => {
      if (!target.prepare) return undefined as TPrepared
      return target.prepare(transaction, targetBase)
    })
  } catch (error) {
    const message = `Failed to prepare the sync target: ${errMsg(error)}`
    log('error', message)
    return finalize('error', {}, message)
  }
  const targetContext: SyncTargetContext<TPrepared> = {
    ...targetBase,
    prepared,
  }

  const records = pulled.records
  const cursorAfter = pulled.nextCursor ?? cursorBefore
  const stats: Record<string, SyncEntityStat> = {}
  const seen = new Map<SyncEntityKey, Set<string>>()

  for (const batch of chunk(records, batchSize)) {
    const batchStats: Record<string, SyncEntityStat> = {}
    const batchSeen = new Map<SyncEntityKey, Set<string>>()
    try {
      await persistence.transaction(tenantId, async (transaction) => {
        for (const record of batch) {
          const stat = (batchStats[record.entity] ??= emptyStat())
          stat.pulled += 1
          const entitySeen = batchSeen.get(record.entity) ?? new Set<string>()
          entitySeen.add(record.externalId)
          batchSeen.set(record.entity, entitySeen)
          try {
            const result = await persistence.savepoint(
              transaction,
              async (savepoint) => {
                const applied = await target.apply(
                  savepoint,
                  record,
                  targetContext,
                )
                await persistence.recordChange(
                  savepoint,
                  changeFromResult(
                    {
                      tenantId,
                      connectionId,
                      runId,
                      entity: record.entity,
                      externalId: record.externalId,
                      dryRun,
                    },
                    applied,
                  ),
                )
                return applied
              },
            )
            addAction(batchStats, record.entity, result.action)
          } catch (error) {
            const message = errMsg(error)
            stat.failed += 1
            log('error', `${record.entity} "${record.externalId}": ${message}`)
            await persistence.recordChange(
              transaction,
              changeFromResult(
                {
                  tenantId,
                  connectionId,
                  runId,
                  entity: record.entity,
                  externalId: record.externalId,
                  dryRun,
                },
                { action: 'failed', message },
              ),
            )
          }
        }
      })
      mergeStats(stats, batchStats)
      for (const [entity, externalIds] of batchSeen) {
        const committed = seen.get(entity) ?? new Set<string>()
        for (const externalId of externalIds) committed.add(externalId)
        seen.set(entity, committed)
      }
    } catch (error) {
      for (const record of batch) {
        const stat = (stats[record.entity] ??= emptyStat())
        stat.pulled += 1
        stat.failed += 1
      }
      log('error', `Batch failed: ${errMsg(error)}`)
    }
  }

  const processingFailures = Object.values(stats).reduce(
    (total, stat) => total + stat.failed,
    0,
  )
  const archiveSafetyErrors: string[] = []
  if (
    policy.missing === 'archive' &&
    pulled.mode === 'full' &&
    target.archiveMissing
  ) {
    const archiveEntities = pulled.authoritativeEntities.filter(
      (entity) => target.canArchive?.(entity) ?? true,
    )
    const seenCounts = Object.fromEntries(
      archiveEntities.map((entity) => [entity, seen.get(entity)?.size ?? 0]),
    )
    const archivePlan = planSnapshotArchives(
      archiveEntities,
      seenCounts,
      processingFailures,
    )

    if (archivePlan.blockedByFailures) {
      log(
        'warn',
        'Skipping missing-record archive policy because record processing had failures.',
      )
    }
    if (archivePlan.missingAuthority && archiveEntities.length === 0) {
      const message =
        'Missing-record archive skipped because the source identified no full snapshots.'
      log('warn', message)
      archiveSafetyErrors.push(message)
    }
    for (const entity of archivePlan.blockedEmpty) {
      const message = `Missing-record archive blocked for ${entity}: the full snapshot contained no valid records.`
      log('warn', message)
      archiveSafetyErrors.push(message)
    }

    if (archivePlan.eligible.length > 0) {
      try {
        const archived = await persistence.transaction(
          tenantId,
          async (transaction) => {
            const committed: Array<{
              entity: SyncEntityKey
              results: SyncArchiveResult[]
            }> = []
            for (const entity of archivePlan.eligible) {
              const results = await target.archiveMissing!(
                transaction,
                entity,
                seen.get(entity) ?? new Set(),
                targetContext,
              )
              for (const result of results) {
                await persistence.recordChange(
                  transaction,
                  changeFromResult(
                    {
                      tenantId,
                      connectionId,
                      runId,
                      entity,
                      externalId: result.externalId,
                      dryRun,
                    },
                    result,
                  ),
                )
              }
              committed.push({ entity, results })
            }
            return committed
          },
        )
        for (const { entity, results } of archived) {
          for (const _result of results) addAction(stats, entity, 'archived')
        }
      } catch (error) {
        const message = `Missing-record archive transaction failed: ${errMsg(error)}`
        log('error', message)
        archiveSafetyErrors.push(message)
      }
    }
  } else if (policy.missing === 'archive' && pulled.mode === 'incremental') {
    log('info', 'Skipping missing-record archive policy on incremental pull.')
  }

  const failed = Object.values(stats).reduce(
    (total, stat) => total + stat.failed,
    0,
  )
  const conflicts = Object.values(stats).reduce(
    (total, stat) => total + stat.conflict,
    0,
  )
  const errors: string[] = []
  if (failed > 0) errors.push(`${failed} record(s) failed.`)
  if (conflicts > 0) errors.push(`${conflicts} record(s) need conflict review.`)
  errors.push(...archiveSafetyErrors)
  const status: SyncRunStatus = errors.length > 0 ? 'partial' : 'success'
  const error = errors.length > 0 ? errors.join(' ') : null
  return finalize(status, stats, error, cursorAfter)
}

export type MemorySyncTransaction = {
  changes: SyncRecordChange[]
  records: Map<string, JsonRecord>
}

export type MemorySyncPersistence = SyncPersistence<MemorySyncTransaction> & {
  connections: SyncConnectionRecord[]
  runs: SyncRun[]
  changes: SyncRecordChange[]
  records: Map<string, JsonRecord>
}

function cloneJson<T>(value: T): T {
  return structuredClone(value)
}

function cloneRecordMap(
  records: ReadonlyMap<string, JsonRecord>,
): Map<string, JsonRecord> {
  return new Map(
    [...records].map(([key, value]) => [key, cloneJson(value)] as const),
  )
}

export function createMemorySyncPersistence(
  initialConnections: readonly SyncConnectionRecord[] = [],
): MemorySyncPersistence {
  const connections = initialConnections.map((connection) =>
    cloneJson(connection),
  )
  const runs: SyncRun[] = []
  const changes: SyncRecordChange[] = []
  const records = new Map<string, JsonRecord>()

  const persistence: MemorySyncPersistence = {
    connections,
    runs,
    changes,
    records,
    async loadConnection(input) {
      const connection = connections.find(
        (candidate) =>
          candidate.tenantId === input.tenantId &&
          candidate.id === input.connectionId,
      )
      return connection ? cloneJson(connection) : null
    },
    async createRun(input) {
      const id = crypto.randomUUID()
      runs.push({
        id,
        ...cloneJson(input),
        status: 'running',
        completedAt: null,
        durationMs: null,
        stats: {},
        error: null,
        log: [],
      })
      return id
    },
    async transaction(_tenantId, operation) {
      const transaction: MemorySyncTransaction = {
        changes: changes.map((change) => cloneJson(change)),
        records: cloneRecordMap(records),
      }
      const result = await operation(transaction)
      changes.splice(0, changes.length, ...transaction.changes)
      records.clear()
      for (const [key, value] of transaction.records) records.set(key, value)
      return result
    },
    async savepoint(transaction, operation) {
      const changesBefore = transaction.changes.map((change) => cloneJson(change))
      const recordsBefore = cloneRecordMap(transaction.records)
      try {
        return await operation(transaction)
      } catch (error) {
        transaction.changes.splice(0, transaction.changes.length, ...changesBefore)
        transaction.records.clear()
        for (const [key, value] of recordsBefore) transaction.records.set(key, value)
        throw error
      }
    },
    async recordChange(transaction, change) {
      transaction.changes.push({
        ...cloneJson(change),
        id: crypto.randomUUID(),
        createdAt: new Date(),
      })
    },
    async finalize(input) {
      const runIndex = runs.findIndex((run) => run.id === input.run.id)
      if (runIndex < 0) throw new Error('Sync run was not found during finalization')
      runs[runIndex] = cloneJson(input.run)
      const connection = connections.find(
        (candidate) =>
          candidate.tenantId === input.run.tenantId &&
          candidate.id === input.run.connectionId,
      )
      if (!connection) throw new Error('Sync connection was not found during finalization')
      connection.status = input.connection.status
      connection.lastError = input.connection.lastError
      if (input.connection.updateLastRun) {
        connection.cursor = cloneJson(input.connection.cursor)
        connection.lastRunId = input.connection.lastRunId
        connection.lastRunAt = input.connection.lastRunAt
        connection.lastStatus = input.connection.lastStatus
      }
    },
  }
  return persistence
}

export function createMemorySyncTarget(
  keyOf: (record: SyncRecord) => string = (record) =>
    `${record.entity}:${record.externalId}`,
): SyncTarget<MemorySyncTransaction, undefined> {
  return {
    async apply(transaction, record, context) {
      const key = keyOf(record)
      const before = transaction.records.get(key) ?? null
      const after = cloneJson(record.data)
      const unchanged = before !== null && JSON.stringify(before) === JSON.stringify(after)
      if (!context.dryRun && !unchanged) transaction.records.set(key, after)
      return {
        action: before === null ? 'created' : unchanged ? 'unchanged' : 'updated',
        canonicalId: key,
        before: before ? cloneJson(before) : null,
        after,
      }
    },
  }
}

export { planSnapshotArchives } from './snapshot-policy'
