import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, tenantRef } from '@braedonsaunders/appkit-db'
import type { AgentToolManifest } from './manifest'
import type {
  AgentToolAction,
  AgentToolApprovalStatus,
  AgentToolHealth,
  AgentToolRunStatus,
  AgentToolStatus,
} from './store'

/** A tool on a tenant's shelf, with the state the host actually observed. */
export const agentTools = pgTable('agent_tools', {
  id: id(),
  tenantId: tenantRef(),
  toolId: text('tool_id').notNull(),
  manifest: jsonb('manifest').$type<AgentToolManifest>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  status: text('status').$type<AgentToolStatus>().notNull().default('not_installed'),
  health: text('health').$type<AgentToolHealth>().notNull().default('unknown'),
  installDir: text('install_dir'),
  binPaths: jsonb('bin_paths').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  installedVersion: text('installed_version'),
  lastError: text('last_error'),
  lastInstalledAt: timestamp('last_installed_at', { withTimezone: true }),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('agent_tools_tenant_tool_ux').on(table.tenantId, table.toolId),
  index('agent_tools_status_idx').on(table.tenantId, table.status),
])

/**
 * A decision about installing or running a tool. `scope` is the digest of
 * exactly what was asked, so a grant never widens past its question, and
 * `grantExpiresAt` / `usesRemaining` bound how long an answer stands.
 */
export const agentToolApprovals = pgTable('agent_tool_approvals', {
  id: id(),
  tenantId: tenantRef(),
  toolId: text('tool_id').notNull(),
  action: text('action').$type<AgentToolAction>().notNull(),
  status: text('status').$type<AgentToolApprovalStatus>().notNull().default('pending'),
  scope: text('scope').notNull(),
  request: jsonb('request').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  reason: text('reason').notNull(),
  requestedBy: text('requested_by').notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  decidedBy: text('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionReason: text('decision_reason'),
  grantExpiresAt: timestamp('grant_expires_at', { withTimezone: true }),
  usesRemaining: integer('uses_remaining'),
}, (table) => [
  index('agent_tool_approvals_scope_idx').on(table.tenantId, table.toolId, table.action, table.scope),
  index('agent_tool_approvals_status_idx').on(table.tenantId, table.status, table.requestedAt),
])

/** Append-only: what each tool actually did, and what it printed. */
export const agentToolRuns = pgTable('agent_tool_runs', {
  id: id(),
  tenantId: tenantRef(),
  toolId: text('tool_id').notNull(),
  command: text('command').notNull(),
  argv: jsonb('argv').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  status: text('status').$type<AgentToolRunStatus>().notNull(),
  exitCode: integer('exit_code'),
  stdout: text('stdout').notNull().default(''),
  stderr: text('stderr').notNull().default(''),
  truncated: boolean('truncated').notNull().default(false),
  durationMs: integer('duration_ms').notNull().default(0),
  actor: text('actor').notNull(),
  approvalId: text('approval_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_tool_runs_tool_idx').on(table.tenantId, table.toolId, table.startedAt),
])
