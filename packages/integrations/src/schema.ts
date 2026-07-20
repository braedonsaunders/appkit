import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, tenantRef } from '@appkit/db'

export const integrations = pgTable(
  'integrations',
  {
    id: id(),
    tenantId: tenantRef(),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    triggerKey: text('trigger_key').notNull(),
    destinationKey: text('destination_key').notNull(),
    config: jsonb('config')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    sealedSecrets: jsonb('sealed_secrets')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    oncePerRecord: boolean('once_per_record').notNull().default(false),
    status: text('status').notNull().default('ready'),
    lastError: text('last_error'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('integrations_trigger_idx').on(
      table.tenantId,
      table.triggerKey,
      table.enabled,
    ),
    uniqueIndex('integrations_tenant_name_ux').on(table.tenantId, table.name),
  ],
)
export const integrationDeliveryLedger = pgTable(
  'integration_delivery_ledger',
  {
    id: id(),
    tenantId: tenantRef(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    triggerKey: text('trigger_key').notNull(),
    subjectId: text('subject_id').notNull(),
    destinationKey: text('destination_key').notNull(),
    externalRef: text('external_ref'),
    status: text('status').$type<'pushed' | 'failed'>().notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('integration_delivery_subject_idx').on(
      table.tenantId,
      table.integrationId,
      table.triggerKey,
      table.subjectId,
    ),
  ],
)
export const INTEGRATION_TENANT_TABLES = [
  'integrations',
  'integration_delivery_ledger',
] as const
