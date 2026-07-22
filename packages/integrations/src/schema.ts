import { sql } from 'drizzle-orm'
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, tenants } from '@appkit/db'

export type TenantIntegrationStatus = 'draft' | 'ready' | 'error' | 'disabled'
export type SealedIntegrationSecret = { ciphertext: string; nonce: string }

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/** Disabled-by-default trigger-to-destination automation definitions. */
export const tenantIntegrations = pgTable(
  'tenant_integrations',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name'),
    triggerKey: text('trigger_key'),
    destinationKey: text('destination_key'),
    enabled: boolean('enabled').default(false).notNull(),
    config: jsonb('config')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    secrets: jsonb('secrets')
      .$type<Record<string, SealedIntegrationSecret>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    status: text('status')
      .$type<TenantIntegrationStatus>()
      .default('draft')
      .notNull(),
    lastError: text('last_error'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('tenant_integrations_tenant_idx').on(table.tenantId),
    index('tenant_integrations_trigger_idx').on(table.tenantId, table.triggerKey),
    uniqueIndex('tenant_integrations_tenant_id_id_ux').on(table.tenantId, table.id),
  ],
)

/** Per-external-record delivery ledger used for retry and reversal. */
export const integrationExportLog = pgTable(
  'integration_export_log',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    automationId: uuid('automation_id').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    externalSystem: text('external_system').notNull(),
    externalRef: text('external_ref'),
    status: text('status')
      .$type<'pushed' | 'failed' | 'reversed'>()
      .notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    index('integration_export_log_subject_idx').on(
      table.tenantId,
      table.subjectType,
      table.subjectId,
    ),
    index('integration_export_log_automation_idx').on(
      table.tenantId,
      table.automationId,
    ),
    foreignKey({
      name: 'integration_export_log_tenant_automation_fk',
      columns: [table.tenantId, table.automationId],
      foreignColumns: [tenantIntegrations.tenantId, tenantIntegrations.id],
    }).onDelete('cascade'),
  ],
)

export const INTEGRATION_TENANT_TABLES = [
  'tenant_integrations',
  'integration_export_log',
] as const

export type TenantIntegration = typeof tenantIntegrations.$inferSelect
export type NewTenantIntegration = typeof tenantIntegrations.$inferInsert
export type IntegrationExportLogRow = typeof integrationExportLog.$inferSelect
