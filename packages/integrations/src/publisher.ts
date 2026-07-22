import type { IntegrationEvent } from './types'
import type { IntegrationStore } from './runtime'

export type OutboundDispatchJob = {
  tenantId: string
  automationId: string
  event: IntegrationEvent
}

export type EnqueueOutboundDispatch = (
  data: OutboundDispatchJob,
  jobId: string,
) => Promise<unknown>

export function outboundDispatchJobId(
  sourceEventId: string,
  automationId: string,
): string {
  return `domain-outbound|${sourceEventId}|${automationId}`
}

/**
 * Production event publisher extracted from the reference worker boundary.
 * The application supplies its durable queue, keeping this package independent
 * of any particular jobs implementation.
 */
export function createIntegrationPublisher(options: {
  store: IntegrationStore
  enqueueOutboundDispatch: EnqueueOutboundDispatch
}) {
  return async function publishIntegrationEvent(
    context: { tenantId: string },
    event: IntegrationEvent,
    sourceEventId: string,
  ): Promise<void> {
    if (event.tenantId !== context.tenantId)
      throw new Error('Integration event tenant does not match the publisher context')
    const ids = await options.store.listMatching(context.tenantId, event.type)
    await Promise.all(
      ids.map((automationId) =>
        options.enqueueOutboundDispatch(
          { tenantId: context.tenantId, automationId, event },
          outboundDispatchJobId(sourceEventId, automationId),
        ),
      ),
    )
  }
}
