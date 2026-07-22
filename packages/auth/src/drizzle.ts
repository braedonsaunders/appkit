import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { AppkitDb } from '@appkit/db'
import {
  auditLog,
  memberships,
  tenants,
  users,
} from '@appkit/db/schema'
import type {
  InviteGrantPayload,
  InviteRecord,
  InviteStore,
} from './invites'
import { evaluateInviteAccess } from './invites'
import * as appkitSchema from '@appkit/db/schema'

type Schema = typeof appkitSchema
type Database = NodePgDatabase<Schema>

export type DrizzleInviteStoreOptions = {
  /** Optional domain hook committed in the same transaction as acceptance. */
  onAccepted?: (db: Database, tenantId: string, userId: string) => Promise<void>
  /** Customize the audit vocabulary without changing the state machine. */
  audit?: {
    entityType?: string
    action?: string
    summary?: string
  }
}

/**
 * Tenant-safe durable invitation adapter. Acceptance, the optional domain hook,
 * and its audit record commit atomically under the BYPASSRLS system handle.
 */
export function createDrizzleInviteStore(
  database: Pick<AppkitDb<Schema>, 'withSuperAdmin'>,
  options: DrizzleInviteStoreOptions = {},
): InviteStore {
  async function load(db: Database, membershipId: string, lock: boolean): Promise<InviteRecord | null> {
    let query = db
      .select({
        membershipId: memberships.id,
        tenantId: memberships.tenantId,
        tenantName: tenants.name,
        userId: memberships.userId,
        invitedAt: memberships.invitedAt,
        status: memberships.status,
        emailVerified: users.emailVerified,
        tenantStatus: tenants.status,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.id, membershipId))
      .limit(1)
    if (lock) query = query.for('update') as typeof query
    const [row] = await query
    return row ?? null
  }

  return {
    inspect: (membershipId) => database.withSuperAdmin((db) => load(db, membershipId, false)),
    accept: (payload, sessionUserId) =>
      database.withSuperAdmin((db) =>
        db.transaction(async (tx) => acceptInTransaction(tx, payload, sessionUserId, options, load)),
      ),
  }
}

async function acceptInTransaction(
  tx: Database,
  payload: InviteGrantPayload,
  sessionUserId: string,
  options: DrizzleInviteStoreOptions,
  load: (db: Database, membershipId: string, lock: boolean) => Promise<InviteRecord | null>,
) {
  const row = await load(tx, payload.membershipId, true)
  const state = evaluateInviteAccess(payload, sessionUserId, row)
  if (state !== 'pending' || !row) return state

  const acceptedAt = new Date()
  const [accepted] = await tx
    .update(memberships)
    .set({ status: 'active', joinedAt: acceptedAt, updatedAt: acceptedAt })
    .where(
      and(
        eq(memberships.id, payload.membershipId),
        eq(memberships.tenantId, payload.tenantId),
        eq(memberships.userId, payload.userId),
        eq(memberships.status, 'invited'),
        eq(memberships.invitedAt, new Date(payload.invitedAt)),
      ),
    )
    .returning({ id: memberships.id })

  if (!accepted) {
    const current = await load(tx, payload.membershipId, false)
    return evaluateInviteAccess(payload, sessionUserId, current)
  }

  await options.onAccepted?.(tx, payload.tenantId, payload.userId)
  await tx.insert(auditLog).values({
    tenantId: payload.tenantId,
    actorUserId: sessionUserId,
    entityType: options.audit?.entityType ?? 'tenant_user',
    entityId: payload.membershipId,
    action: options.audit?.action ?? 'update',
    summary: options.audit?.summary ?? 'Accepted membership invitation',
    before: { status: 'invited' },
    after: { status: 'active', joinedAt: acceptedAt.toISOString() },
    metadata: { acceptedVia: 'magic_link' },
  })
  return 'active' as const
}
