import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { agentToolApprovals, agentToolRuns, agentTools } from './schema'
import type {
  AgentToolApproval,
  AgentToolRecord,
  AgentToolRun,
  AgentToolStore,
} from './store'

type ToolRow = typeof agentTools.$inferSelect
type ApprovalRow = typeof agentToolApprovals.$inferSelect
type RunRow = typeof agentToolRuns.$inferSelect

function iso(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined
}

function toTool(row: ToolRow): AgentToolRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    toolId: row.toolId,
    manifest: row.manifest,
    enabled: row.enabled,
    status: row.status,
    health: row.health,
    ...(row.installDir ? { installDir: row.installDir } : {}),
    binPaths: row.binPaths,
    ...(row.installedVersion ? { installedVersion: row.installedVersion } : {}),
    ...(row.lastError ? { lastError: row.lastError } : {}),
    ...(iso(row.lastInstalledAt) ? { lastInstalledAt: iso(row.lastInstalledAt) } : {}),
    ...(iso(row.lastCheckedAt) ? { lastCheckedAt: iso(row.lastCheckedAt) } : {}),
    ...(iso(row.lastRunAt) ? { lastRunAt: iso(row.lastRunAt) } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toApproval(row: ApprovalRow): AgentToolApproval {
  return {
    id: row.id,
    tenantId: row.tenantId,
    toolId: row.toolId,
    action: row.action,
    status: row.status,
    scope: row.scope,
    request: row.request,
    reason: row.reason,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...(row.decidedBy ? { decidedBy: row.decidedBy } : {}),
    ...(iso(row.decidedAt) ? { decidedAt: iso(row.decidedAt) } : {}),
    ...(row.decisionReason ? { decisionReason: row.decisionReason } : {}),
    ...(iso(row.grantExpiresAt) ? { grantExpiresAt: iso(row.grantExpiresAt) } : {}),
    ...(row.usesRemaining === null ? {} : { usesRemaining: row.usesRemaining }),
  }
}

function toRun(row: RunRow): AgentToolRun {
  return {
    id: row.id,
    tenantId: row.tenantId,
    toolId: row.toolId,
    command: row.command,
    argv: row.argv,
    status: row.status,
    exitCode: row.exitCode,
    stdout: row.stdout,
    stderr: row.stderr,
    truncated: row.truncated,
    durationMs: row.durationMs,
    actor: row.actor,
    ...(row.approvalId ? { approvalId: row.approvalId } : {}),
    startedAt: row.startedAt.toISOString(),
  }
}

function date(value: string | undefined): Date | null {
  return value ? new Date(value) : null
}

/**
 * Postgres-backed persistence. Pass a tenant-scoped `db` from `@appkitjs/db` so
 * row-level security is the outer boundary and these predicates are the inner
 * one.
 */
export function createDrizzleAgentToolStore<TSchema extends Record<string, unknown>>(
  db: NodePgDatabase<TSchema>,
): AgentToolStore {
  return {
    async listTools(tenantId) {
      const rows = await db
        .select()
        .from(agentTools)
        .where(eq(agentTools.tenantId, tenantId))
        .orderBy(agentTools.toolId)
      return rows.map(toTool)
    },

    async getTool(tenantId, toolId) {
      const [row] = await db
        .select()
        .from(agentTools)
        .where(and(eq(agentTools.tenantId, tenantId), eq(agentTools.toolId, toolId)))
      return row ? toTool(row) : undefined
    },

    async upsertTool(record) {
      const values = {
        tenantId: record.tenantId,
        toolId: record.toolId,
        manifest: record.manifest,
        enabled: record.enabled,
        status: record.status,
        health: record.health,
        installDir: record.installDir ?? null,
        binPaths: record.binPaths,
        installedVersion: record.installedVersion ?? null,
        lastError: record.lastError ?? null,
        lastInstalledAt: date(record.lastInstalledAt),
        lastCheckedAt: date(record.lastCheckedAt),
        lastRunAt: date(record.lastRunAt),
        updatedAt: new Date(record.updatedAt),
      }
      const [row] = await db
        .insert(agentTools)
        .values({ ...values, id: record.id, createdAt: new Date(record.createdAt) })
        .onConflictDoUpdate({
          target: [agentTools.tenantId, agentTools.toolId],
          set: values,
        })
        .returning()
      if (!row) throw new Error(`Could not persist agent tool ${record.toolId}.`)
      return toTool(row)
    },

    async listApprovals(tenantId, filter) {
      const predicates = [eq(agentToolApprovals.tenantId, tenantId)]
      if (filter?.toolId) predicates.push(eq(agentToolApprovals.toolId, filter.toolId))
      if (filter?.action) predicates.push(eq(agentToolApprovals.action, filter.action))
      if (filter?.status) predicates.push(eq(agentToolApprovals.status, filter.status))
      const rows = await db
        .select()
        .from(agentToolApprovals)
        .where(and(...predicates))
        .orderBy(desc(agentToolApprovals.requestedAt))
      return rows.map(toApproval)
    },

    async getApproval(tenantId, id) {
      const [row] = await db
        .select()
        .from(agentToolApprovals)
        .where(and(eq(agentToolApprovals.tenantId, tenantId), eq(agentToolApprovals.id, id)))
      return row ? toApproval(row) : undefined
    },

    async upsertApproval(approval) {
      const values = {
        tenantId: approval.tenantId,
        toolId: approval.toolId,
        action: approval.action,
        status: approval.status,
        scope: approval.scope,
        request: approval.request,
        reason: approval.reason,
        requestedBy: approval.requestedBy,
        requestedAt: new Date(approval.requestedAt),
        expiresAt: new Date(approval.expiresAt),
        decidedBy: approval.decidedBy ?? null,
        decidedAt: date(approval.decidedAt),
        decisionReason: approval.decisionReason ?? null,
        grantExpiresAt: date(approval.grantExpiresAt),
        usesRemaining: approval.usesRemaining ?? null,
      }
      const [row] = await db
        .insert(agentToolApprovals)
        .values({ ...values, id: approval.id })
        .onConflictDoUpdate({ target: agentToolApprovals.id, set: values })
        .returning()
      if (!row) throw new Error(`Could not persist agent tool approval ${approval.id}.`)
      return toApproval(row)
    },

    async consumeGrant(tenantId, id) {
      // One statement: the row is only updated if it is still approved and
      // still has a use left, so concurrent runs cannot both spend the last one.
      const [row] = await db
        .update(agentToolApprovals)
        .set({
          usesRemaining: sql`greatest(${agentToolApprovals.usesRemaining} - 1, 0)`,
          status: sql`case when ${agentToolApprovals.usesRemaining} <= 1 then 'exhausted' else ${agentToolApprovals.status} end`,
        })
        .where(
          and(
            eq(agentToolApprovals.tenantId, tenantId),
            eq(agentToolApprovals.id, id),
            eq(agentToolApprovals.status, 'approved'),
            or(
              isNull(agentToolApprovals.usesRemaining),
              gt(agentToolApprovals.usesRemaining, 0),
            ),
          ),
        )
        .returning()
      return row ? toApproval(row) : undefined
    },

    async recordRun(run) {
      const [row] = await db
        .insert(agentToolRuns)
        .values({
          id: run.id,
          tenantId: run.tenantId,
          toolId: run.toolId,
          command: run.command,
          argv: run.argv,
          status: run.status,
          exitCode: run.exitCode,
          stdout: run.stdout,
          stderr: run.stderr,
          truncated: run.truncated,
          durationMs: run.durationMs,
          actor: run.actor,
          approvalId: run.approvalId ?? null,
          startedAt: new Date(run.startedAt),
        })
        .returning()
      if (!row) throw new Error(`Could not record agent tool run ${run.id}.`)
      return toRun(row)
    },

    async listRuns(tenantId, filter) {
      const predicates = [eq(agentToolRuns.tenantId, tenantId)]
      if (filter?.toolId) predicates.push(eq(agentToolRuns.toolId, filter.toolId))
      const rows = await db
        .select()
        .from(agentToolRuns)
        .where(and(...predicates))
        .orderBy(desc(agentToolRuns.startedAt))
        .limit(filter?.limit ?? 100)
      return rows.map(toRun)
    },
  }
}
