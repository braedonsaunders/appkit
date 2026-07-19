import { sql } from 'drizzle-orm'
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { id, tenantRef } from '../helpers'

/** Append-only audit trail. Every mutation should write a before/after row. */
export const auditLog = pgTable('audit_log', {
  id: id(),
  tenantId: tenantRef(),
  actorUserId: uuid('actor_user_id'),
  actorIp: text('actor_ip'),
  actorUserAgent: text('actor_user_agent'),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  action: text('action').notNull(),
  summary: text('summary'),
  before: jsonb('before'),
  after: jsonb('after'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Transactional outbox — an event written in the SAME tx as its domain
 *  mutation, drained by a relay. Unique (tenant_id, dedup_key) makes it
 *  idempotent. */
export const domainEventOutbox = pgTable(
  'domain_event_outbox',
  {
    id: id(),
    tenantId: tenantRef(),
    eventType: text('event_type').notNull(),
    subjectId: text('subject_id').notNull(),
    dedupKey: text('dedup_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('domain_event_outbox_dedup_key').on(t.tenantId, t.dedupKey)],
)

export const PLATFORM_TENANT_TABLES = ['audit_log', 'domain_event_outbox'] as const
