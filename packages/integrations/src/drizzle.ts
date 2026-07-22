import { and, eq, isNull } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { IntegrationStore } from './runtime'
import { integrationExportLog, tenantIntegrations } from './schema'

type Db = NodePgDatabase<Record<string, never>>
export type IntegrationTenantRunner = <T>(
  tenantId: string,
  operation: () => Promise<T>,
) => Promise<T>

/** RLS-aware persistence for production automation definitions and ledgers. */
export function createDrizzleIntegrationStore(
  db: Db,
  withTenant: IntegrationTenantRunner,
): IntegrationStore {
  return {
    async getDefinition(tenantId, automationId) {
      const row = await withTenant(tenantId, async () => {
        const [found] = await db
          .select()
          .from(tenantIntegrations)
          .where(
            and(
              eq(tenantIntegrations.tenantId, tenantId),
              eq(tenantIntegrations.id, automationId),
              isNull(tenantIntegrations.deletedAt),
            ),
          )
          .limit(1)
        return found
      })
      return row
        ? {
            id: row.id,
            tenantId: row.tenantId,
            name: row.name,
            enabled: row.enabled,
            triggerKey: row.triggerKey,
            destinationKey: row.destinationKey,
            config: row.config,
            secrets: row.secrets,
            status: row.status,
            lastError: row.lastError,
            lastRunAt: row.lastRunAt,
          }
        : null
    },
    async listMatching(tenantId, triggerKey) {
      return withTenant(tenantId, async () => {
        const rows = await db
          .select({ id: tenantIntegrations.id })
          .from(tenantIntegrations)
          .where(
            and(
              eq(tenantIntegrations.tenantId, tenantId),
              eq(tenantIntegrations.enabled, true),
              eq(tenantIntegrations.triggerKey, triggerKey),
              isNull(tenantIntegrations.deletedAt),
            ),
          )
        return rows.map((row) => row.id)
      })
    },
    async priorDelivery(
      tenantId,
      automationId,
      subjectType,
      subjectId,
    ) {
      return withTenant(tenantId, async () => {
        const rows = await db
          .select({
            externalRef: integrationExportLog.externalRef,
            status: integrationExportLog.status,
            detail: integrationExportLog.detail,
          })
          .from(integrationExportLog)
          .where(
            and(
              eq(integrationExportLog.tenantId, tenantId),
              eq(integrationExportLog.automationId, automationId),
              eq(integrationExportLog.subjectType, subjectType),
              eq(integrationExportLog.subjectId, subjectId),
            ),
          )
        return rows.map((row) => ({
          externalRef: row.externalRef,
          status: row.status,
          ...(row.detail ? { detail: row.detail } : {}),
        }))
      })
    },
    async replaceDelivery(
      tenantId,
      automationId,
      subjectType,
      subjectId,
      externalSystem,
      refs,
      status,
    ) {
      await withTenant(tenantId, () =>
        db.transaction(async (transaction) => {
          await transaction
            .delete(integrationExportLog)
            .where(
              and(
                eq(integrationExportLog.tenantId, tenantId),
                eq(integrationExportLog.automationId, automationId),
                eq(integrationExportLog.subjectType, subjectType),
                eq(integrationExportLog.subjectId, subjectId),
              ),
            )
          if (refs.length)
            await transaction.insert(integrationExportLog).values(
              refs.map((ref) => ({
                tenantId,
                automationId,
                subjectType,
                subjectId,
                externalSystem,
                externalRef: ref.externalRef,
                status,
                detail: ref.detail,
              })),
            )
        }),
      )
    },
    async recordStatus(tenantId, automationId, result) {
      await withTenant(tenantId, () =>
        db
          .update(tenantIntegrations)
          .set({
            status: result.ok ? 'ready' : 'error',
            lastError: result.ok ? null : (result.error ?? 'Unknown error'),
            lastRunAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tenantIntegrations.tenantId, tenantId),
              eq(tenantIntegrations.id, automationId),
            ),
          ),
      )
    },
  }
}

export {
  tenantIntegrations,
  integrationExportLog,
  INTEGRATION_TENANT_TABLES,
} from './schema'
