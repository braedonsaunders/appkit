import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, id, tenantRef } from '../helpers'

/** A public-API credential. The secret is never stored — only its sha256 hash. */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: id(),
    tenantId: tenantRef(),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [uniqueIndex('api_keys_key_hash_key').on(t.keyHash)],
)

/** Idempotency reservations for API writes — replay the stored response on retry. */
export const apiIdempotencyKeys = pgTable(
  'api_idempotency_keys',
  {
    id: id(),
    tenantId: tenantRef(),
    apiKeyId: uuid('api_key_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    status: text('status').$type<'processing' | 'completed'>().notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('api_idempotency_key_scope').on(t.apiKeyId, t.idempotencyKey)],
)

export const API_TENANT_TABLES = ['api_keys', 'api_idempotency_keys'] as const
