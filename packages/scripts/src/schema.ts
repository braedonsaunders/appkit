import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, id, tenantRef } from '@appkit/db'
import type { ScriptKind, ScriptRunStatus } from './index'

export const userScripts = pgTable('user_scripts', {
  id: id(),
  tenantId: tenantRef(),
  name: text('name').notNull(),
  kind: text('kind').$type<ScriptKind>().notNull(),
  triggerPoint: text('trigger_point').notNull(),
  subjectType: text('subject_type'),
  endpointSlug: text('endpoint_slug'),
  source: text('source').notNull(),
  cron: text('cron'),
  timezone: text('timezone').notNull().default('UTC'),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  timeoutMs: integer('timeout_ms').notNull().default(2_000),
  unitBudget: integer('unit_budget').notNull().default(1_000),
  sortOrder: integer('sort_order').notNull().default(100),
  isActive: boolean('is_active').notNull().default(true),
  ...auditColumns,
}, (table) => [
  index('user_scripts_trigger_idx').on(table.tenantId, table.triggerPoint, table.subjectType, table.isActive),
  index('user_scripts_schedule_idx').on(table.tenantId, table.kind, table.isActive, table.nextRunAt),
  uniqueIndex('user_scripts_endpoint_slug_ux').on(table.tenantId, table.endpointSlug),
])

export const scriptRuns = pgTable('script_runs', {
  id: id(),
  tenantId: tenantRef(),
  scriptId: uuid('script_id').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  status: text('status').$type<ScriptRunStatus>().notNull(),
  logs: jsonb('logs').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  errorMessage: text('error_message'),
  returned: jsonb('returned').$type<unknown>(),
  changes: jsonb('changes').$type<Record<string, unknown>>(),
  units: integer('units').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('script_runs_script_at_idx').on(table.tenantId, table.scriptId, table.at)])

export const SCRIPT_TENANT_TABLES = ['user_scripts', 'script_runs'] as const
