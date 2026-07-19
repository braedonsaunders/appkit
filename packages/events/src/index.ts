import { and, eq } from 'drizzle-orm'
import { isDeepStrictEqual } from 'node:util'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { auditLog, domainEventOutbox } from '@appkit/db'

type Db = NodePgDatabase<Record<string, never>>

// --- Audit trail (copied from the beaconhs audit package) ------------------

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'sign'
  | 'publish'
  | 'archive'
  | 'invite'
  | 'login'
  | 'logout'
  | 'export'
  | 'copy'
  | 'send'
  | 'view_sensitive'
  | 'impersonate'
  | 'impersonate_stop'

export type AuditEvent = {
  tenantId: string
  actorUserId?: string | null
  actorIp?: string | null
  actorUserAgent?: string | null
  entityType: string
  entityId?: string
  action: AuditAction
  summary?: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}

export async function audit(db: Db, evt: AuditEvent): Promise<void> {
  await db.insert(auditLog).values({
    tenantId: evt.tenantId,
    actorUserId: evt.actorUserId ?? null,
    actorIp: evt.actorIp ?? null,
    actorUserAgent: evt.actorUserAgent ?? null,
    entityType: evt.entityType,
    entityId: evt.entityId,
    action: evt.action,
    summary: evt.summary,
    before: evt.before ?? null,
    after: evt.after ?? null,
    metadata: evt.metadata ?? {},
  })
}

/** Shallow diff of two JSON-serialisable objects → { added, removed, changed }. */
export function diff<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: T | null | undefined,
): {
  added: Record<string, unknown>
  removed: Record<string, unknown>
  changed: Record<string, { before: unknown; after: unknown }>
} {
  const b = before ?? ({} as T)
  const a = after ?? ({} as T)
  const added: Record<string, unknown> = {}
  const removed: Record<string, unknown> = {}
  const changed: Record<string, { before: unknown; after: unknown }> = {}
  const keys = new Set([...Object.keys(b), ...Object.keys(a)])
  for (const k of keys) {
    const bv = b[k]
    const av = a[k]
    if (!(k in b)) added[k] = av
    else if (!(k in a)) removed[k] = bv
    else if (JSON.stringify(bv) !== JSON.stringify(av)) changed[k] = { before: bv, after: av }
  }
  return { added, removed, changed }
}

// --- Transactional outbox (generalized from the beaconhs events outbox) ----

export type RecordDomainEventInput = {
  tenantId: string
  eventType: string
  subjectId: string
  dedupKey: string
  payload: Record<string, unknown>
}

/** Every event needs a type + a stable dedup key. */
export function assertDomainEvent(input: RecordDomainEventInput): void {
  if (!input.eventType.trim() || !input.dedupKey.trim()) {
    throw new Error('A domain event requires an event type and a deduplication key')
  }
}

/**
 * Write an event to the outbox in the SAME transaction as its domain mutation.
 * Idempotent on (tenant_id, dedup_key): a re-run with the same identity returns
 * the existing id; a dedup-key collision with a *different* event throws.
 */
export async function recordDomainEvent(tx: Db, input: RecordDomainEventInput): Promise<string> {
  assertDomainEvent(input)
  const [inserted] = await tx
    .insert(domainEventOutbox)
    .values(input)
    .onConflictDoNothing({ target: [domainEventOutbox.tenantId, domainEventOutbox.dedupKey] })
    .returning({ id: domainEventOutbox.id })
  if (inserted) return inserted.id

  const [existing] = await tx
    .select({
      id: domainEventOutbox.id,
      eventType: domainEventOutbox.eventType,
      subjectId: domainEventOutbox.subjectId,
      payload: domainEventOutbox.payload,
    })
    .from(domainEventOutbox)
    .where(
      and(eq(domainEventOutbox.tenantId, input.tenantId), eq(domainEventOutbox.dedupKey, input.dedupKey)),
    )
    .limit(1)
  if (
    !existing ||
    existing.eventType !== input.eventType ||
    existing.subjectId !== input.subjectId ||
    !isDeepStrictEqual(existing.payload, input.payload)
  ) {
    throw new Error('Domain event deduplication key conflicts with another event')
  }
  return existing.id
}
