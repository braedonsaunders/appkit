import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { IntegrationStore } from './runtime'
import { integrationDeliveryLedger, integrations } from './schema'
type Db = NodePgDatabase<Record<string, never>>
export function createDrizzleIntegrationStore(
  db: Db,
  tenantId: string,
): IntegrationStore {
  return {
    async getDefinition(requestTenantId, integrationId) {
      if (requestTenantId !== tenantId) return null
      const [row] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.tenantId, tenantId),
            eq(integrations.id, integrationId),
          ),
        )
        .limit(1)
      return row
        ? {
            id: row.id,
            tenantId: row.tenantId,
            name: row.name,
            enabled: row.enabled,
            triggerKey: row.triggerKey,
            destinationKey: row.destinationKey,
            config: row.config,
            sealedSecrets: row.sealedSecrets,
            oncePerRecord: row.oncePerRecord,
          }
        : null
    },
    async priorDelivery(integrationId, triggerKey, subjectId) {
      return db
        .select({
          externalRef: integrationDeliveryLedger.externalRef,
          status: integrationDeliveryLedger.status,
          detail: integrationDeliveryLedger.detail,
        })
        .from(integrationDeliveryLedger)
        .where(
          and(
            eq(integrationDeliveryLedger.tenantId, tenantId),
            eq(integrationDeliveryLedger.integrationId, integrationId),
            eq(integrationDeliveryLedger.triggerKey, triggerKey),
            eq(integrationDeliveryLedger.subjectId, subjectId),
          ),
        )
        .then((rows) =>
          rows.map((row) => ({
            externalRef: row.externalRef,
            status: row.status,
            ...(row.detail ? { detail: row.detail } : {}),
          })),
        )
    },
    async replaceDelivery(
      integrationId,
      triggerKey,
      subjectId,
      destinationKey,
      refs,
      status,
    ) {
      await db.transaction(async (tx) => {
        await tx
          .delete(integrationDeliveryLedger)
          .where(
            and(
              eq(integrationDeliveryLedger.tenantId, tenantId),
              eq(integrationDeliveryLedger.integrationId, integrationId),
              eq(integrationDeliveryLedger.triggerKey, triggerKey),
              eq(integrationDeliveryLedger.subjectId, subjectId),
            ),
          )
        if (refs.length)
          await tx.insert(integrationDeliveryLedger).values(
            refs.map((ref) => ({
              tenantId,
              integrationId,
              triggerKey,
              subjectId,
              destinationKey,
              externalRef: ref.externalRef,
              status,
              detail: ref.detail,
            })),
          )
      })
    },
    async recordStatus(integrationId, result) {
      await db
        .update(integrations)
        .set({
          status: result.ok ? 'ready' : 'error',
          lastError: result.error,
          lastRunAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(integrations.tenantId, tenantId),
            eq(integrations.id, integrationId),
          ),
        )
    },
  }
}
export {
  integrations,
  integrationDeliveryLedger,
  INTEGRATION_TENANT_TABLES,
} from './schema'
