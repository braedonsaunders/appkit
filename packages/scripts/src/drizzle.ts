import { and, asc, eq, isNull, or } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { ScriptDefinition, ScriptRun, ScriptStore } from './index'
import { scriptRuns, userScripts } from './schema'

type Db = NodePgDatabase<Record<string, never>>

export function createDrizzleScriptStore(db: Db): ScriptStore {
  return {
    async listForTrigger({ tenantId, triggerPoint, subjectType }) {
      const rows = await db.select().from(userScripts).where(and(
        eq(userScripts.tenantId, tenantId),
        eq(userScripts.triggerPoint, triggerPoint),
        eq(userScripts.isActive, true),
        subjectType ? or(isNull(userScripts.subjectType), eq(userScripts.subjectType, subjectType)) : isNull(userScripts.subjectType),
      )).orderBy(asc(userScripts.sortOrder), asc(userScripts.name))
      return rows.map(toDefinition)
    },
    async findById(tenantId, scriptId) {
      const [row] = await db.select().from(userScripts).where(and(eq(userScripts.tenantId, tenantId), eq(userScripts.id, scriptId))).limit(1)
      return row ? toDefinition(row) : null
    },
    async findEndpoint(tenantId, slug) {
      const [row] = await db.select().from(userScripts).where(and(eq(userScripts.tenantId, tenantId), eq(userScripts.endpointSlug, slug), eq(userScripts.kind, 'endpoint'))).limit(1)
      return row ? toDefinition(row) : null
    },
    async listScheduled(tenantId) {
      const rows = await db.select().from(userScripts).where(and(eq(userScripts.tenantId, tenantId), eq(userScripts.kind, 'scheduled'), eq(userScripts.isActive, true)))
      return rows.map(toDefinition)
    },
    async recordRun(run) {
      await db.insert(scriptRuns).values({
        tenantId: run.tenantId,
        scriptId: run.scriptId,
        targetType: run.targetType,
        targetId: run.targetId,
        status: run.status,
        logs: run.logs,
        errorMessage: run.errorMessage,
        returned: run.returned,
        changes: run.changes,
        units: run.units,
        durationMs: run.durationMs,
        at: run.at,
      })
    },
    async updateSchedule(scriptId, input) {
      const set: { lastRunAt?: Date; nextRunAt?: Date | null } = {}
      if ('lastRunAt' in input) set.lastRunAt = input.lastRunAt
      if ('nextRunAt' in input) set.nextRunAt = input.nextRunAt
      if (Object.keys(set).length) await db.update(userScripts).set(set).where(eq(userScripts.id, scriptId))
    },
  }
}

function toDefinition(row: typeof userScripts.$inferSelect): ScriptDefinition {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    kind: row.kind,
    triggerPoint: row.triggerPoint,
    subjectType: row.subjectType,
    endpointSlug: row.endpointSlug,
    source: row.source,
    cron: row.cron,
    timezone: row.timezone,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    timeoutMs: row.timeoutMs,
    unitBudget: row.unitBudget,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  }
}

export { userScripts, scriptRuns, SCRIPT_TENANT_TABLES } from './schema'
export type { ScriptRun }
