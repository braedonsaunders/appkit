import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { WorkflowGateRecord, WorkflowRun, WorkflowStore } from './runtime'
import { workflowActionExecutions, workflowGates, workflowRuns } from './schema'

type Db = NodePgDatabase<Record<string, never>>
export function createDrizzleWorkflowStore(
  db: Db,
  tenantId: string,
): WorkflowStore {
  return {
    async createRun(input) {
      const [row] = await db
        .insert(workflowRuns)
        .values({ ...input, status: 'running' })
        .returning()
      if (!row) throw new Error('Workflow run was not created')
      return toRun(row)
    },
    async getRun(id) {
      const [row] = await db
        .select()
        .from(workflowRuns)
        .where(
          and(eq(workflowRuns.tenantId, tenantId), eq(workflowRuns.id, id)),
        )
        .limit(1)
      return row ? toRun(row) : null
    },
    async setRunStatus(id, status, error) {
      await db
        .update(workflowRuns)
        .set({ status, error, updatedAt: new Date() })
        .where(
          and(eq(workflowRuns.tenantId, tenantId), eq(workflowRuns.id, id)),
        )
    },
    async claimRunResume(id) {
      const [row] = await db
        .update(workflowRuns)
        .set({ status: 'running', updatedAt: new Date() })
        .where(
          and(
            eq(workflowRuns.tenantId, tenantId),
            eq(workflowRuns.id, id),
            eq(workflowRuns.status, 'waiting'),
          ),
        )
        .returning({ id: workflowRuns.id })
      return Boolean(row)
    },
    async claimAction(runId, actionKey) {
      const [row] = await db
        .insert(workflowActionExecutions)
        .values({ tenantId, runId, actionKey })
        .onConflictDoUpdate({
          target: [
            workflowActionExecutions.runId,
            workflowActionExecutions.actionKey,
          ],
          set: { status: 'running', error: null, completedAt: null },
          setWhere: eq(workflowActionExecutions.status, 'failed'),
        })
        .returning({ id: workflowActionExecutions.id })
      return Boolean(row)
    },
    async completeAction(runId, actionKey, output) {
      await db
        .update(workflowActionExecutions)
        .set({ status: 'completed', output, completedAt: new Date() })
        .where(
          and(
            eq(workflowActionExecutions.tenantId, tenantId),
            eq(workflowActionExecutions.runId, runId),
            eq(workflowActionExecutions.actionKey, actionKey),
          ),
        )
    },
    async failAction(runId, actionKey, error) {
      await db
        .update(workflowActionExecutions)
        .set({ status: 'failed', error, completedAt: new Date() })
        .where(
          and(
            eq(workflowActionExecutions.tenantId, tenantId),
            eq(workflowActionExecutions.runId, runId),
            eq(workflowActionExecutions.actionKey, actionKey),
          ),
        )
    },
    async createGateGroup(runId, gate) {
      await db
        .insert(workflowGates)
        .values(
          gate.assigneeIds.map((assigneeId) => ({
            tenantId,
            runId,
            gateKey: gate.key,
            assigneeId,
            quorum: gate.quorum ?? 'any',
            gate,
          })),
        )
        .onConflictDoNothing({
          target: [
            workflowGates.runId,
            workflowGates.gateKey,
            workflowGates.assigneeId,
          ],
        })
      const rows = await db
        .select()
        .from(workflowGates)
        .where(
          and(
            eq(workflowGates.tenantId, tenantId),
            eq(workflowGates.runId, runId),
            eq(workflowGates.gateKey, gate.key),
          ),
        )
      return rows.map(toGate)
    },
    async listGateGroup(runId, gateKey) {
      const rows = await db
        .select()
        .from(workflowGates)
        .where(
          and(
            eq(workflowGates.tenantId, tenantId),
            eq(workflowGates.runId, runId),
            eq(workflowGates.gateKey, gateKey),
          ),
        )
      return rows.map(toGate)
    },
    async decideGate(id, assigneeId, decision) {
      const [row] = await db
        .update(workflowGates)
        .set({ status: decision, decidedAt: new Date() })
        .where(
          and(
            eq(workflowGates.tenantId, tenantId),
            eq(workflowGates.id, id),
            eq(workflowGates.assigneeId, assigneeId),
            eq(workflowGates.status, 'pending'),
          ),
        )
        .returning()
      return row ? toGate(row) : null
    },
    async cancelGates(ids) {
      if (ids.length)
        await db
          .update(workflowGates)
          .set({ status: 'cancelled' })
          .where(
            and(
              eq(workflowGates.tenantId, tenantId),
              inArray(workflowGates.id, [...ids]),
            ),
          )
    },
  }
}
function toRun(row: typeof workflowRuns.$inferSelect): WorkflowRun {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workflowKey: row.workflowKey,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    status: row.status,
    context: row.context,
    ...(row.error ? { error: row.error } : {}),
  }
}
function toGate(row: typeof workflowGates.$inferSelect): WorkflowGateRecord {
  return {
    id: row.id,
    runId: row.runId,
    gateKey: row.gateKey,
    assigneeId: row.assigneeId,
    quorum: row.quorum,
    status: row.status,
    gate: row.gate,
    ...(row.decidedAt ? { decidedAt: row.decidedAt } : {}),
  }
}
