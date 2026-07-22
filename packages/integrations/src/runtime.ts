import type {
  DeliveryRef,
  DeliveryResult,
  IntegrationDefinition,
  IntegrationEvent,
} from './types'
import type { ReturnTypeRegistry } from './internal-types'

export type DeliveryLedgerEntry = {
  externalRef: string | null
  status: 'pushed' | 'failed' | 'reversed'
  detail?: Record<string, unknown>
}

export interface IntegrationStore {
  getDefinition(
    tenantId: string,
    automationId: string,
  ): Promise<IntegrationDefinition | null>
  listMatching(tenantId: string, triggerKey: string): Promise<string[]>
  priorDelivery(
    tenantId: string,
    automationId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<DeliveryLedgerEntry[]>
  replaceDelivery(
    tenantId: string,
    automationId: string,
    subjectType: string,
    subjectId: string,
    externalSystem: string,
    refs: DeliveryRef[],
    status: 'pushed' | 'failed',
  ): Promise<void>
  recordStatus(
    tenantId: string,
    automationId: string,
    result: { ok: boolean; error?: string },
  ): Promise<void>
}

export type PriorDelivery = {
  refs: string[]
  retryRefs: string[]
  complete: boolean
}

export function summarizePriorDelivery(
  rows: readonly Pick<DeliveryLedgerEntry, 'externalRef' | 'status'>[],
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

export type DispatchIntegrationOptions = {
  integrationId: string
  event: IntegrationEvent
  registry: ReturnTypeRegistry
  store: IntegrationStore
  unseal?: (value: unknown, key: string) => string | null
  log?: (level: 'info' | 'warn' | 'error', message: string) => void
  signal?: AbortSignal
  data?: unknown
}

/** The complete per-automation delivery unit used by the outbound worker. */
export async function dispatchIntegration(
  options: DispatchIntegrationOptions,
): Promise<DeliveryResult> {
  const tenantId = options.event.tenantId
  const definition = await options.store.getDefinition(
    tenantId,
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

  const destination = options.registry.destination(definition.destinationKey ?? '')
  // A draft may have been edited or removed after its durable job was queued.
  // The production dispatcher treats that as a safe no-op.
  if (!destination)
    return { ok: true, summary: 'Integration destination is no longer available.' }

  const config = definition.config ?? {}
  const oncePerRecord = config.oncePerRecord === true
  let prior: PriorDelivery
  try {
    prior = summarizePriorDelivery(
      await options.store.priorDelivery(
        tenantId,
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
  if (oncePerRecord && prior.complete)
    return { ok: true, summary: 'Already delivered.' }

  const secrets = Object.fromEntries(
    Object.entries(definition.secrets ?? {}).flatMap(([key, value]) => {
      const plain = options.unseal?.(value, key)
      return plain == null ? [] : [[key, plain]]
    }),
  )
  const mapping =
    typeof config.mapping === 'object' && config.mapping && !Array.isArray(config.mapping)
      ? (config.mapping as Record<string, unknown>)
      : {}
  const log = options.log ?? ((level, message) => {
    const line = `[integration:${definition.name ?? definition.id}] ${message}`
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  })

  let result: DeliveryResult
  try {
    result = await destination.deliver({
      tenantId,
      data: options.data,
      config,
      secrets,
      signal: options.signal,
      triggerKey: options.event.type,
      subjectId: options.event.subjectId,
      items: options.event.items,
      mapping,
      priorRefs: prior.refs,
      retryRefs: prior.retryRefs,
      oncePerRecord,
      log,
    })
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  // An explicitly returned empty ref list clears stale refs. Partial results
  // remain failed so the next attempt receives their ids as retryRefs.
  if (result.refs !== undefined) {
    try {
      await options.store.replaceDelivery(
        tenantId,
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

  // Matches the production source: delivery/ledger truth controls worker
  // retries; the denormalized status row is useful bookkeeping, not authority.
  try {
    await options.store.recordStatus(tenantId, definition.id, result)
  } catch {
    // best-effort status bookkeeping
  }
  return result
}

export function createIntegrationDispatcher(
  defaults: Omit<DispatchIntegrationOptions, 'integrationId' | 'event'>,
) {
  return function dispatchOne(
    context: { tenantId: string },
    automationId: string,
    event: IntegrationEvent,
  ): Promise<DeliveryResult> {
    if (event.tenantId !== context.tenantId)
      return Promise.resolve({
        ok: false,
        error: 'Integration event tenant does not match the dispatcher context',
      })
    return dispatchIntegration({
      ...defaults,
      integrationId: automationId,
      event,
    })
  }
}

export function createMemoryIntegrationStore(
  definitions: readonly IntegrationDefinition[],
): IntegrationStore & {
  definitions: Map<string, IntegrationDefinition>
  ledger: Map<string, DeliveryLedgerEntry[]>
  statuses: Map<string, Array<{ ok: boolean; error?: string }>>
} {
  const map = new Map(definitions.map((definition) => [definition.id, definition]))
  const ledger = new Map<string, DeliveryLedgerEntry[]>()
  const statuses = new Map<string, Array<{ ok: boolean; error?: string }>>()
  const key = (tenantId: string, id: string, trigger: string, subject: string) =>
    `${tenantId}:${id}:${trigger}:${subject}`
  return {
    definitions: map,
    ledger,
    statuses,
    async getDefinition(tenantId, id) {
      const definition = map.get(id)
      return definition?.tenantId === tenantId ? definition : null
    },
    async listMatching(tenantId, triggerKey) {
      return [...map.values()]
        .filter(
          (definition) =>
            definition.tenantId === tenantId &&
            definition.enabled &&
            definition.triggerKey === triggerKey,
        )
        .map((definition) => definition.id)
    },
    async priorDelivery(tenantId, id, trigger, subject) {
      const definition = map.get(id)
      if (definition?.tenantId !== tenantId) return []
      return ledger.get(key(tenantId, id, trigger, subject)) ?? []
    },
    async replaceDelivery(
      tenantId,
      id,
      trigger,
      subject,
      _destination,
      refs,
      status,
    ) {
      const definition = map.get(id)
      if (definition?.tenantId !== tenantId)
        throw new Error('Integration does not belong to the tenant')
      ledger.set(
        key(tenantId, id, trigger, subject),
        refs.map((ref) => ({ ...ref, status })),
      )
    },
    async recordStatus(tenantId, id, result) {
      const definition = map.get(id)
      if (definition?.tenantId !== tenantId)
        throw new Error('Integration does not belong to the tenant')
      statuses.set(id, [
        ...(statuses.get(id) ?? []),
        { ok: result.ok, ...(result.error ? { error: result.error } : {}) },
      ])
    },
  }
}
