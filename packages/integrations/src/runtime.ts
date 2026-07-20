import type {
  DeliveryRef,
  IntegrationDefinition,
  IntegrationEvent,
} from './types'
import type { ReturnTypeRegistry } from './internal-types'

export type DeliveryLedgerEntry = {
  externalRef: string | null
  status: 'pushed' | 'failed'
  detail?: Record<string, unknown>
}
export interface IntegrationStore {
  getDefinition(
    tenantId: string,
    integrationId: string,
  ): Promise<IntegrationDefinition | null>
  priorDelivery(
    integrationId: string,
    triggerKey: string,
    subjectId: string,
  ): Promise<DeliveryLedgerEntry[]>
  replaceDelivery(
    integrationId: string,
    triggerKey: string,
    subjectId: string,
    destinationKey: string,
    refs: DeliveryRef[],
    status: 'pushed' | 'failed',
  ): Promise<void>
  recordStatus(
    integrationId: string,
    result: { ok: boolean; error?: string },
  ): Promise<void>
}
export type PriorDelivery = {
  refs: string[]
  retryRefs: string[]
  complete: boolean
}
export function summarizePriorDelivery(
  rows: readonly DeliveryLedgerEntry[],
): PriorDelivery {
  const refs = rows
    .map((row) => row.externalRef)
    .filter((ref): ref is string => Boolean(ref))
  return {
    refs,
    retryRefs: rows
      .filter((row) => row.status !== 'pushed')
      .map((row) => row.externalRef)
      .filter((ref): ref is string => Boolean(ref)),
    complete: rows.length > 0 && rows.every((row) => row.status === 'pushed'),
  }
}

export async function dispatchIntegration(options: {
  integrationId: string
  event: IntegrationEvent
  registry: ReturnTypeRegistry
  store: IntegrationStore
  unseal?: (value: unknown, key: string) => string | null
  log?: (level: 'info' | 'warn' | 'error', message: string) => void
  signal?: AbortSignal
}) {
  const definition = await options.store.getDefinition(
    options.event.tenantId,
    options.integrationId,
  )
  if (
    !definition ||
    !definition.enabled ||
    definition.triggerKey !== options.event.type
  )
    return {
      ok: true,
      summary: 'Integration is disabled or no longer matches the event.',
    }
  const destination = options.registry.destination(definition.destinationKey)
  if (!destination)
    return {
      ok: false,
      error: `Unknown integration destination: ${definition.destinationKey}`,
    }
  let prior: PriorDelivery
  try {
    prior = summarizePriorDelivery(
      await options.store.priorDelivery(
        definition.id,
        options.event.type,
        options.event.subjectId,
      ),
    )
  } catch (error) {
    return {
      ok: false,
      error: `Cannot verify the outbound delivery ledger: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  if (definition.oncePerRecord && prior.complete)
    return { ok: true, summary: 'Already delivered.' }
  const secrets = Object.fromEntries(
    Object.entries(definition.sealedSecrets ?? {}).flatMap(([key, value]) => {
      const plain = options.unseal?.(value, key)
      return plain == null ? [] : [[key, plain]]
    }),
  )
  let result
  try {
    result = await destination.deliver({
      tenantId: options.event.tenantId,
      config: definition.config,
      secrets,
      signal: options.signal,
      triggerKey: options.event.type,
      subjectId: options.event.subjectId,
      items: options.event.items,
      mapping:
        typeof definition.config.mapping === 'object' &&
        definition.config.mapping
          ? (definition.config.mapping as Record<string, unknown>)
          : {},
      priorRefs: prior.refs,
      retryRefs: prior.retryRefs,
      oncePerRecord: definition.oncePerRecord ?? false,
      log: options.log ?? (() => {}),
    })
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  if (result.refs !== undefined) {
    try {
      await options.store.replaceDelivery(
        definition.id,
        options.event.type,
        options.event.subjectId,
        destination.key,
        result.refs,
        result.ok ? 'pushed' : 'failed',
      )
    } catch (error) {
      result = {
        ...result,
        ok: false,
        error: `Outbound delivery could not be recorded safely: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
  try {
    await options.store.recordStatus(definition.id, result)
  } catch (error) {
    result = {
      ...result,
      ok: false,
      error: [
        result.error,
        `Integration status could not be recorded: ${error instanceof Error ? error.message : String(error)}`,
      ].filter(Boolean).join(' '),
    }
  }
  return result
}

export function createMemoryIntegrationStore(
  definitions: readonly IntegrationDefinition[],
): IntegrationStore & {
  ledger: Map<string, DeliveryLedgerEntry[]>
  statuses: Map<string, Array<{ ok: boolean; error?: string }>>
} {
  const map = new Map(
    definitions.map((definition) => [definition.id, definition]),
  )
  const ledger = new Map<string, DeliveryLedgerEntry[]>()
  const statuses = new Map<string, Array<{ ok: boolean; error?: string }>>()
  const key = (id: string, trigger: string, subject: string) =>
    `${id}:${trigger}:${subject}`
  return {
    ledger,
    statuses,
    async getDefinition(tenant, id) {
      const definition = map.get(id)
      return definition?.tenantId === tenant ? definition : null
    },
    async priorDelivery(id, trigger, subject) {
      return ledger.get(key(id, trigger, subject)) ?? []
    },
    async replaceDelivery(id, trigger, subject, _destination, refs, status) {
      ledger.set(
        key(id, trigger, subject),
        refs.map((ref) => ({ ...ref, status })),
      )
    },
    async recordStatus(id, result) {
      statuses.set(id, [
        ...(statuses.get(id) ?? []),
        { ok: result.ok, ...(result.error ? { error: result.error } : {}) },
      ])
    },
  }
}
