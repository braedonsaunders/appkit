import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { authAccounts, memberships, roleAssignments, roles, tenants, users } from './schema/identity'
import type { RoleScope } from './schema/identity'

type Db = NodePgDatabase<Record<string, never>>

/**
 * Provisioning helpers to seed a fresh install — a tenant, a (possibly
 * super-admin) user, memberships, and built-in roles. Password hashing is the
 * caller's job (pass a hash produced by the configured authentication runtime)
 * so this package stays dependency-clean. Run these with the BYPASSRLS
 * `superDb` (tenant rows don't exist yet to scope to).
 */

export async function createTenant(db: Db, input: { name: string; slug: string }): Promise<{ id: string }> {
  const [row] = await db.insert(tenants).values(input).returning({ id: tenants.id })
  return row!
}

export async function createUser(
  db: Db,
  input: { email: string; name: string; credentialHash?: string; isSuperAdmin?: boolean },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name,
      isSuperAdmin: input.isSuperAdmin ?? false,
    })
    .returning({ id: users.id })
  if (input.credentialHash) {
    await db.insert(authAccounts).values({
      userId: row!.id,
      accountId: row!.id,
      providerId: 'credential',
      password: input.credentialHash,
    })
  }
  return row!
}

export async function addMembership(
  db: Db,
  input: { tenantId: string; userId: string; displayName: string },
): Promise<{ id: string }> {
  const [row] = await db.insert(memberships).values(input).returning({ id: memberships.id })
  return row!
}

/** Upsert built-in roles for a tenant by their stable `key`. */
export async function seedRoles(
  db: Db,
  tenantId: string,
  defs: { key: string; name: string; permissions: string[] }[],
): Promise<Record<string, string>> {
  const byKey: Record<string, string> = {}
  for (const def of defs) {
    const [row] = await db
      .insert(roles)
      .values({ tenantId, key: def.key, name: def.name, permissions: def.permissions })
      .onConflictDoUpdate({
        target: [roles.tenantId, roles.key],
        set: { name: def.name, permissions: def.permissions },
      })
      .returning({ id: roles.id })
    byKey[def.key] = row!.id
  }
  return byKey
}

export async function assignRole(
  db: Db,
  input: { tenantId: string; membershipId: string; roleId: string; scope?: RoleScope },
): Promise<void> {
  await db.insert(roleAssignments).values({
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    roleId: input.roleId,
    scope: input.scope ?? { type: 'tenant' },
  })
}

/** Look up a user by email (case-insensitive not applied here — pass lowercased). */
export async function findUserByEmail(db: Db, email: string): Promise<{ id: string } | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  return row ?? null
}
