import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { roleAssignments, roles, userPermissionOverrides, type RoleScope } from '@appkit/db'

/** The minimal shape `can`/`assertCan` need — a resolved request context. */
export type AccessCtx = {
  isSuperAdmin: boolean
  permissions: Set<string>
  scopes: RoleScope[]
}

export class ForbiddenError extends Error {
  override readonly name = 'ForbiddenError'
  constructor(public readonly permission: string) {
    super(`Missing permission: ${permission}`)
  }
}

/** Does this context hold `perm`? Super-admin holds everything; `module.*`
 *  wildcards grant any `module.x`; `.read.{all,site,self}` tiers cascade. */
export function can(ctx: AccessCtx, perm: string): boolean {
  if (ctx.isSuperAdmin) return true
  if (ctx.permissions.has(perm)) return true
  if (readTierCovers(ctx.permissions, perm)) return true
  for (const p of ctx.permissions) {
    if (p.endsWith('.*') && perm.startsWith(p.slice(0, -1))) return true
  }
  return false
}

export function assertCan(ctx: AccessCtx, perm: string): void {
  if (!can(ctx, perm)) throw new ForbiddenError(perm)
}

// A `module.read.all` grant implies `.read.site` and `.read.self`; `.read.site`
// implies `.read.self`.
function readTierCovers(permissions: Set<string>, requested: string): boolean {
  const match = /^(.+)\.read\.(all|site|self)$/.exec(requested)
  if (!match) return false
  const [, prefix, tier] = match
  if (!prefix) return false
  if (tier === 'site') return permissions.has(`${prefix}.read.all`)
  if (tier === 'self') return permissions.has(`${prefix}.read.all`) || permissions.has(`${prefix}.read.site`)
  return false
}

/** Narrow a role-assignment list to a single "switched-into" role, if set. */
export function effectiveRoleAssignments<T extends { roleId: string }>(
  activeRoleId: string | null | undefined,
  assignments: readonly T[],
): T[] {
  if (!activeRoleId) return [...assignments]
  return assignments.filter((a) => a.roleId === activeRoleId)
}

/**
 * Resolve a membership's effective permission set + scopes: the union of its
 * assigned roles' permission keys, plus per-user grants, minus per-user denies.
 * `permissionCatalogue` (the app's full key list) lets a specific deny carve
 * concrete keys out of a wildcard grant.
 */
export async function resolveMembershipAccess(
  tx: NodePgDatabase<Record<string, never>>,
  membershipId: string,
  permissionCatalogue: readonly string[],
  activeRoleId?: string | null,
): Promise<{ permissions: Set<string>; scopes: RoleScope[]; appliedRoleId: string | null }> {
  const assignments = await tx
    .select({ roleId: roleAssignments.roleId, permissions: roles.permissions, scope: roleAssignments.scope })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(eq(roleAssignments.membershipId, membershipId))

  const appliedRoleId =
    activeRoleId && assignments.some((a) => a.roleId === activeRoleId) ? activeRoleId : null
  const effective = appliedRoleId ? assignments.filter((a) => a.roleId === appliedRoleId) : assignments

  const permissions = new Set<string>()
  const scopes = effective.map((a) => a.scope)
  for (const a of effective) for (const p of a.permissions) permissions.add(p)

  const overrides = await tx
    .select({ permission: userPermissionOverrides.permission, effect: userPermissionOverrides.effect })
    .from(userPermissionOverrides)
    .where(eq(userPermissionOverrides.membershipId, membershipId))

  for (const o of overrides) if (o.effect === 'grant') permissions.add(o.permission)
  applyPermissionDenies(
    permissions,
    overrides.filter((o) => o.effect === 'deny').map((o) => o.permission),
    permissionCatalogue,
  )

  return { permissions, scopes, appliedRoleId }
}

function applyPermissionDenies(
  permissions: Set<string>,
  denies: string[],
  catalogue: readonly string[],
): void {
  const specificDenies = denies.filter((d) => !d.endsWith('.*'))
  // A specific deny under a wildcard grant expands the wildcard to the concrete,
  // non-denied keys so the rest of the grant survives.
  for (const grant of [...permissions]) {
    if (!grant.endsWith('.*')) continue
    const prefix = grant.slice(0, -1)
    if (!specificDenies.some((d) => d.startsWith(prefix))) continue
    permissions.delete(grant)
    for (const key of catalogue) if (key.startsWith(prefix)) permissions.add(key)
  }
  for (const denied of denies) {
    permissions.delete(denied)
    if (!denied.endsWith('.*')) continue
    const prefix = denied.slice(0, -1)
    for (const grant of [...permissions]) if (grant.startsWith(prefix)) permissions.delete(grant)
  }
}

// --- Visibility scopes ------------------------------------------------------

export function canSeeSite(ctx: AccessCtx, siteId: string | null): boolean {
  if (!siteId || ctx.isSuperAdmin) return true
  for (const scope of ctx.scopes) {
    if (scope.type === 'tenant') return true
    if (scope.type === 'sites' && scope.siteIds.includes(siteId)) return true
  }
  return false
}

/** The single widest scope the context holds. */
export function widestScope(ctx: AccessCtx): RoleScope {
  if (ctx.isSuperAdmin) return { type: 'tenant' }
  const order = { tenant: 3, sites: 2, self: 1 } as const
  let widest: RoleScope | null = null
  for (const s of ctx.scopes) {
    if (!widest || order[s.type] > order[widest.type]) widest = s
  }
  return widest ?? { type: 'self' }
}
