import { sql } from 'drizzle-orm'
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
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
export const domainEventOutboxStatus = pgEnum('domain_event_outbox_status', [
  'pending',
  'publishing',
  'published',
])

export const domainEventOutbox = pgTable(
  'domain_event_outbox',
  {
    id: id(),
    tenantId: tenantRef(),
    eventType: text('event_type').notNull(),
    subjectId: text('subject_id').notNull(),
    dedupKey: text('dedup_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: domainEventOutboxStatus('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('domain_event_outbox_tenant_id_id_ux').on(t.tenantId, t.id),
    uniqueIndex('domain_event_outbox_dedup_key').on(t.tenantId, t.dedupKey),
    index('domain_event_outbox_status_available_idx').on(t.status, t.availableAt),
    index('domain_event_outbox_status_claimed_idx').on(t.status, t.claimedAt),
    index('domain_event_outbox_tenant_subject_idx').on(t.tenantId, t.subjectId, t.createdAt),
  ],
)

export const domainEventEffects = pgTable(
  'domain_event_effects',
  {
    id: id(),
    tenantId: tenantRef(),
    eventId: uuid('event_id').notNull(),
    effectKey: text('effect_key').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('domain_event_effects_event_effect_ux').on(t.tenantId, t.eventId, t.effectKey),
    index('domain_event_effects_event_idx').on(t.tenantId, t.eventId),
    foreignKey({
      name: 'domain_event_effects_tenant_event_fk',
      columns: [t.tenantId, t.eventId],
      foreignColumns: [domainEventOutbox.tenantId, domainEventOutbox.id],
    }).onDelete('cascade'),
  ],
)

export const PLATFORM_TENANT_TABLES = [
  'audit_log',
  'domain_event_outbox',
  'domain_event_effects',
] as const
