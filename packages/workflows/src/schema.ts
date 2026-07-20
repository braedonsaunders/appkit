import { sql } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, tenantRef } from '@appkit/db'
import type { WorkflowGate, WorkflowGraph, WorkflowRunStatus } from './index'

export const workflowDefinitions = pgTable(
  'workflow_definitions',
  {
    id: id(),
    tenantId: tenantRef(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    subjectType: text('subject_type').notNull(),
    graph: jsonb('graph').$type<WorkflowGraph>().notNull(),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('workflow_definitions_tenant_key_ux').on(
      table.tenantId,
      table.key,
    ),
    index('workflow_definitions_subject_idx').on(
      table.tenantId,
      table.subjectType,
    ),
  ],
)
export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: id(),
    tenantId: tenantRef(),
    workflowKey: text('workflow_key').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    status: text('status')
      .$type<WorkflowRunStatus>()
      .notNull()
      .default('running'),
    context: jsonb('context')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('workflow_runs_subject_idx').on(
      table.tenantId,
      table.subjectType,
      table.subjectId,
    ),
    index('workflow_runs_status_idx').on(table.tenantId, table.status),
  ],
)
export const workflowGates = pgTable(
  'workflow_gates',
  {
    id: id(),
    tenantId: tenantRef(),
    runId: uuid('run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    gateKey: text('gate_key').notNull(),
    assigneeId: text('assignee_id').notNull(),
    quorum: text('quorum').$type<'any' | 'all'>().notNull(),
    status: text('status')
      .$type<'pending' | 'approved' | 'rejected' | 'cancelled' | 'escalated'>()
      .notNull()
      .default('pending'),
    gate: jsonb('gate').$type<WorkflowGate>().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('workflow_gates_run_key_assignee_ux').on(
      table.runId,
      table.gateKey,
      table.assigneeId,
    ),
    index('workflow_gates_assignee_idx').on(
      table.tenantId,
      table.assigneeId,
      table.status,
    ),
  ],
)
export const workflowActionExecutions = pgTable(
  'workflow_action_executions',
  {
    id: id(),
    tenantId: tenantRef(),
    runId: uuid('run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    actionKey: text('action_key').notNull(),
    status: text('status').notNull().default('running'),
    output: jsonb('output'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('workflow_action_executions_run_key_ux').on(
      table.runId,
      table.actionKey,
    ),
  ],
)
export const WORKFLOW_TENANT_TABLES = [
  'workflow_definitions',
  'workflow_runs',
  'workflow_gates',
  'workflow_action_executions',
] as const
