import { sql } from 'drizzle-orm'
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, tenantRef } from '@appkit/db'
import type {
  SyncConnectionStatus,
  SyncEntityKey,
  SyncEntityStat,
  SyncRecordAction,
  SyncRecordDiff,
  SyncRunLogLine,
  SyncRunStatus,
  SyncRunTrigger,
} from './types'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const syncConnections = pgTable(
  'sync_connections',
  {
    id: id(),
    tenantId: tenantRef(),
    connectorKey: text('connector_key').notNull(),
    name: text('name').notNull(),
    status: text('status').$type<SyncConnectionStatus>().default('draft').notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    schedule: text('schedule'),
    config: jsonb('config')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    secrets: jsonb('secrets')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    cursor: jsonb('cursor')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastRunId: uuid('last_run_id'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastStatus: text('last_status').$type<SyncRunStatus>(),
    lastError: text('last_error'),
    createdByTenantUserId: uuid('created_by_tenant_user_id'),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('sync_connections_tenant_idx').on(table.tenantId),
    index('sync_connections_connector_idx').on(table.tenantId, table.connectorKey),
    uniqueIndex('sync_connections_tenant_id_id_ux').on(table.tenantId, table.id),
  ],
)

export const syncCrosswalk = pgTable(
  'sync_crosswalk',
  {
    id: id(),
    tenantId: tenantRef(),
    connectionId: uuid('connection_id').notNull(),
    entity: text('entity').$type<SyncEntityKey>().notNull(),
    sourceSystem: text('source_system').notNull(),
    externalId: text('external_id').notNull(),
    canonicalId: uuid('canonical_id').notNull(),
    rowHash: text('row_hash').notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sync_crosswalk_uniq').on(
      table.tenantId,
      table.connectionId,
      table.entity,
      table.externalId,
    ),
    uniqueIndex('sync_crosswalk_tenant_entity_canonical_owner_ux').on(
      table.tenantId,
      table.entity,
      table.canonicalId,
    ),
    foreignKey({
      name: 'sync_crosswalk_tenant_connection_fk',
      columns: [table.tenantId, table.connectionId],
      foreignColumns: [syncConnections.tenantId, syncConnections.id],
    }).onDelete('cascade'),
  ],
)

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: id(),
    tenantId: tenantRef(),
    connectionId: uuid('connection_id').notNull(),
    trigger: text('trigger').$type<SyncRunTrigger>().notNull(),
    dryRun: boolean('dry_run').default(false).notNull(),
    status: text('status').$type<SyncRunStatus>().default('running').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    stats: jsonb('stats')
      .$type<Record<string, SyncEntityStat>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    cursorBefore: jsonb('cursor_before')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    cursorAfter: jsonb('cursor_after')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    error: text('error'),
    log: jsonb('log')
      .$type<SyncRunLogLine[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index('sync_runs_tenant_idx').on(table.tenantId),
    index('sync_runs_connection_idx').on(
      table.tenantId,
      table.connectionId,
      table.startedAt,
    ),
    uniqueIndex('sync_runs_tenant_id_id_ux').on(table.tenantId, table.id),
    foreignKey({
      name: 'sync_runs_tenant_connection_fk',
      columns: [table.tenantId, table.connectionId],
      foreignColumns: [syncConnections.tenantId, syncConnections.id],
    }).onDelete('cascade'),
  ],
)

export const syncRecordChanges = pgTable(
  'sync_record_changes',
  {
    id: id(),
    tenantId: tenantRef(),
    connectionId: uuid('connection_id').notNull(),
    runId: uuid('run_id').notNull(),
    entity: text('entity').$type<SyncEntityKey>().notNull(),
    externalId: text('external_id').notNull(),
    canonicalId: uuid('canonical_id'),
    action: text('action').$type<SyncRecordAction>().notNull(),
    dryRun: boolean('dry_run').default(false).notNull(),
    rowHash: text('row_hash'),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    diff: jsonb('diff').$type<SyncRecordDiff | null>(),
    message: text('message'),
    ...timestamps,
  },
  (table) => [
    index('sync_record_changes_tenant_idx').on(table.tenantId),
    index('sync_record_changes_run_idx').on(table.tenantId, table.runId),
    index('sync_record_changes_connection_run_idx').on(
      table.tenantId,
      table.connectionId,
      table.runId,
    ),
    index('sync_record_changes_entity_action_idx').on(
      table.tenantId,
      table.entity,
      table.action,
    ),
    index('sync_record_changes_external_idx').on(
      table.tenantId,
      table.connectionId,
      table.entity,
      table.externalId,
    ),
    foreignKey({
      name: 'sync_record_changes_tenant_connection_fk',
      columns: [table.tenantId, table.connectionId],
      foreignColumns: [syncConnections.tenantId, syncConnections.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'sync_record_changes_tenant_run_fk',
      columns: [table.tenantId, table.runId],
      foreignColumns: [syncRuns.tenantId, syncRuns.id],
    }).onDelete('cascade'),
  ],
)

export const SYNC_TENANT_TABLES = [
  'sync_connections',
  'sync_crosswalk',
  'sync_runs',
  'sync_record_changes',
] as const

export type SyncConnection = typeof syncConnections.$inferSelect
export type NewSyncConnection = typeof syncConnections.$inferInsert
export type SyncCrosswalkRow = typeof syncCrosswalk.$inferSelect
export type SyncRunRow = typeof syncRuns.$inferSelect
export type SyncRecordChangeRow = typeof syncRecordChanges.$inferSelect
