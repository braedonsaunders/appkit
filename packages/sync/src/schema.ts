import { sql } from 'drizzle-orm'
import {
  boolean,
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
import type { SyncRunStatus } from './runtime'

export const syncConnections = pgTable(
  'sync_connections',
  {
    id: id(),
    tenantId: tenantRef(),
    connectorKey: text('connector_key').notNull(),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    config: jsonb('config')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    sealedSecrets: jsonb('sealed_secrets')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    cursor: jsonb('cursor').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('sync_connections_tenant_idx').on(table.tenantId),
    uniqueIndex('sync_connections_tenant_name_ux').on(
      table.tenantId,
      table.name,
    ),
  ],
)
export const syncRuns = pgTable(
  'sync_runs',
  {
    id: id(),
    tenantId: tenantRef(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => syncConnections.id, { onDelete: 'cascade' }),
    status: text('status').$type<SyncRunStatus>().notNull(),
    pulled: integer('pulled').notNull().default(0),
    applied: integer('applied').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    archived: integer('archived').notNull().default(0),
    cursor: jsonb('cursor').$type<Record<string, unknown> | null>(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('sync_runs_connection_idx').on(
      table.tenantId,
      table.connectionId,
      table.startedAt,
    ),
  ],
)
export const syncCrosswalk = pgTable(
  'sync_crosswalk',
  {
    id: id(),
    tenantId: tenantRef(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => syncConnections.id, { onDelete: 'cascade' }),
    entity: text('entity').notNull(),
    externalId: text('external_id').notNull(),
    targetId: text('target_id').notNull(),
    sourceHash: text('source_hash'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('sync_crosswalk_external_ux').on(
      table.connectionId,
      table.entity,
      table.externalId,
    ),
    index('sync_crosswalk_target_idx').on(
      table.tenantId,
      table.entity,
      table.targetId,
    ),
  ],
)
export const SYNC_TENANT_TABLES = [
  'sync_connections',
  'sync_runs',
  'sync_crosswalk',
] as const
