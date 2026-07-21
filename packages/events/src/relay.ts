import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { domainEventEffects, domainEventOutbox } from '@appkit/db'

type Db = NodePgDatabase<Record<string, never>>

export type DomainEventPayload = {
  effects: Record<string, unknown>
  data?: Record<string, unknown>
}

export type DomainEventEnvelope = {
  id: string
  tenantId: string
  eventType: string
  subjectId: string
  dedupKey: string
  payload: DomainEventPayload
  attempts: number
  createdAt: Date
}

export type DomainEventEffectContext = {
  event: DomainEventEnvelope
  effectKey: string
  input: unknown
  /** Stable across every retry; pass it to downstream idempotency APIs. */
  idempotencyKey: string
}

export type DomainEventEffectHandler = (
  context: DomainEventEffectContext,
) => Promise<Record<string, unknown> | void>

export type DomainEventRelayOptions = {
  db: Db
  handlers: Record<string, DomainEventEffectHandler>
  batchSize?: number
  concurrency?: number
  claimTimeoutMs?: number
  retryAt?: (attempts: number, now: Date) => Date
}

export type DomainEventRelayResult = {
  claimed: number
  published: number
  retried: number
}

export const DOMAIN_EVENT_RELAY_DEFAULTS = {
  batchSize: 20,
  concurrency: 5,
  claimTimeoutMs: 10 * 60_000,
} as const

const INITIAL_RETRY_MS = 15_000
const MAX_RETRY_MS = 60 * 60_000

/** Retry forever: a transient outage must never turn a committed event into lost work. */
export function domainEventRetryAt(attempts: number, now: Date): Date {
  const safeAttempts = Number.isFinite(attempts) ? Math.trunc(attempts) : 1
  const exponent = Math.max(0, Math.min(30, safeAttempts - 1))
  return new Date(now.getTime() + Math.min(MAX_RETRY_MS, INITIAL_RETRY_MS * 2 ** exponent))
}

export function assertDomainEventPayload(value: unknown): asserts value is DomainEventPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('A domain event payload must be an object')
  }
  const effects = (value as { effects?: unknown }).effects
  if (!effects || typeof effects !== 'object' || Array.isArray(effects)) {
    throw new Error('A domain event payload requires an effects object')
  }
  const keys = Object.keys(effects)
  if (keys.length === 0) throw new Error('A domain event requires at least one delivery effect')
  if (keys.some((key) => !/^[a-z][a-z0-9_.-]{0,119}$/i.test(key))) {
    throw new Error('Domain event effect keys must be bounded identifiers')
  }
}

class DomainEventLeaseLost extends Error {
  constructor() {
    super('Domain event publishing lease was superseded')
  }
}

function nextLeaseTimestamp(previous: Date): Date {
  return new Date(Math.max(Date.now(), previous.getTime() + 1))
}

function sanitizeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ')
    .slice(0, 4_000)
}

export function createDomainEventRelay(options: DomainEventRelayOptions) {
  const batchSize = Math.max(1, Math.min(100, options.batchSize ?? DOMAIN_EVENT_RELAY_DEFAULTS.batchSize))
  const concurrency = Math.max(1, Math.min(20, options.concurrency ?? DOMAIN_EVENT_RELAY_DEFAULTS.concurrency))
  const claimTimeoutMs = Math.max(60_000, options.claimTimeoutMs ?? DOMAIN_EVENT_RELAY_DEFAULTS.claimTimeoutMs)
  const retryAt = options.retryAt ?? domainEventRetryAt

  async function renewLease(eventId: string, previous: Date): Promise<Date> {
    const next = nextLeaseTimestamp(previous)
    const [renewed] = await options.db
      .update(domainEventOutbox)
      .set({ claimedAt: next })
      .where(and(
        eq(domainEventOutbox.id, eventId),
        eq(domainEventOutbox.status, 'publishing'),
        eq(domainEventOutbox.claimedAt, previous),
      ))
      .returning({ id: domainEventOutbox.id })
    if (!renewed) throw new DomainEventLeaseLost()
    return next
  }

  async function claim(now: Date): Promise<DomainEventEnvelope[]> {
    const staleBefore = new Date(now.getTime() - claimTimeoutMs)
    return options.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(domainEventOutbox)
        .where(or(
          and(eq(domainEventOutbox.status, 'pending'), lte(domainEventOutbox.availableAt, now)),
          and(eq(domainEventOutbox.status, 'publishing'), lte(domainEventOutbox.claimedAt, staleBefore)),
        ))
        .orderBy(asc(domainEventOutbox.createdAt))
        .limit(batchSize)
        .for('update', { skipLocked: true })

      for (const row of rows) {
        await tx
          .update(domainEventOutbox)
          .set({
            status: 'publishing',
            claimedAt: now,
            attempts: sql`${domainEventOutbox.attempts} + 1`,
            lastError: null,
          })
          .where(eq(domainEventOutbox.id, row.id))
      }
      return rows.map((row) => {
        assertDomainEventPayload(row.payload)
        return { ...row, payload: row.payload, attempts: row.attempts + 1 }
      })
    })
  }

  async function publish(event: DomainEventEnvelope, claimedAt: Date): Promise<'published' | 'retried'> {
    let leaseAt = claimedAt
    try {
      const effectEntries = Object.entries(event.payload.effects)
      const completed = await options.db
        .select({ effectKey: domainEventEffects.effectKey })
        .from(domainEventEffects)
        .where(and(
          eq(domainEventEffects.tenantId, event.tenantId),
          eq(domainEventEffects.eventId, event.id),
          inArray(domainEventEffects.effectKey, effectEntries.map(([effectKey]) => effectKey)),
        ))
      const completedKeys = new Set(completed.map((row) => row.effectKey))

      for (const [effectKey, input] of effectEntries) {
        if (completedKeys.has(effectKey)) continue
        const handler = options.handlers[effectKey]
        if (!handler) throw new Error(`No domain event handler is registered for ${effectKey}`)
        const detail = await handler({
          event,
          effectKey,
          input,
          idempotencyKey: `${event.id}:${effectKey}`,
        })
        await options.db.insert(domainEventEffects).values({
          tenantId: event.tenantId,
          eventId: event.id,
          effectKey,
          detail: detail ?? {},
        }).onConflictDoNothing({
          target: [domainEventEffects.tenantId, domainEventEffects.eventId, domainEventEffects.effectKey],
        })
        leaseAt = await renewLease(event.id, leaseAt)
      }

      const [published] = await options.db
        .update(domainEventOutbox)
        .set({ status: 'published', publishedAt: new Date(), claimedAt: null, lastError: null })
        .where(and(
          eq(domainEventOutbox.id, event.id),
          eq(domainEventOutbox.status, 'publishing'),
          eq(domainEventOutbox.claimedAt, leaseAt),
        ))
        .returning({ id: domainEventOutbox.id })
      if (!published) throw new DomainEventLeaseLost()
      return 'published'
    } catch (error) {
      const failedAt = new Date()
      const [released] = await options.db
        .update(domainEventOutbox)
        .set({
          status: 'pending',
          availableAt: retryAt(event.attempts, failedAt),
          claimedAt: null,
          lastError: sanitizeError(error),
        })
        .where(and(
          eq(domainEventOutbox.id, event.id),
          eq(domainEventOutbox.status, 'publishing'),
          eq(domainEventOutbox.claimedAt, leaseAt),
        ))
        .returning({ id: domainEventOutbox.id })
      if (!released && !(error instanceof DomainEventLeaseLost)) throw error
      return 'retried'
    }
  }

  return async function drain(now: Date = new Date()): Promise<DomainEventRelayResult> {
    const claimed = await claim(now)
    const result: DomainEventRelayResult = { claimed: claimed.length, published: 0, retried: 0 }
    for (let offset = 0; offset < claimed.length; offset += concurrency) {
      const outcomes = await Promise.all(
        claimed.slice(offset, offset + concurrency).map((event) => publish(event, now)),
      )
      for (const outcome of outcomes) result[outcome] += 1
    }
    return result
  }
}
