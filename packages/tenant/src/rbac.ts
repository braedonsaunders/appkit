import { eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session'
import { roleAssignments, roles, userPermissionOverrides, type RoleScope } from '@appkit/db'

export function permissionSetCovers(
  permissions: ReadonlySet<string>,
  permission: string,
): boolean {
  if (permissions.has('*') || permissions.has(permission)) return true
  if (readTierCovers(permissions, permission)) return true
  for (const grant of permissions) {
    if (grant.endsWith('.*') && permission.startsWith(grant.slice(0, -1))) return true
  }
  return false
}

function readTierCovers(permissions: ReadonlySet<string>, requested: string): boolean {
  const match = /^(.+)\.read\.(all|site|self)$/.exec(requested)
  if (!match) return false
  const prefix = match[1]
  const tier = match[2]
  if (!prefix) return false
  if (tier === 'site') return permissions.has(`${prefix}.read.all`)
  if (tier === 'self') {
    return permissions.has(`${prefix}.read.all`) || permissions.has(`${prefix}.read.site`)
  }
  return false
}

/** Deny wins, including when a concrete deny carves a key out of a wildcard. */
export function applyPermissionOverrides(
  base: Iterable<string>,
  overrides: Iterable<{ permission: string; effect: 'grant' | 'deny' }>,
  catalogue: Iterable<string>,
): Set<string> {
  const permissions = new Set(base)
  const values = [...overrides]
  for (const override of values) {
    if (override.effect === 'grant') permissions.add(override.permission)
  }

  const catalogueKeys = [...catalogue]
  const denies = values
    .filter((value) => value.effect === 'deny')
    .map((value) => value.permission)
  const concreteDenies = denies.filter((permission) => !permission.endsWith('.*'))
  for (const grant of [...permissions]) {
    if (!grant.endsWith('.*')) continue
    const prefix = grant.slice(0, -1)
    if (!concreteDenies.some((permission) => permission.startsWith(prefix))) continue
    permissions.delete(grant)
    for (const permission of catalogueKeys) {
      if (permission.startsWith(prefix)) permissions.add(permission)
    }
  }
  for (const denied of denies) {
    permissions.delete(denied)
    if (!denied.endsWith('.*')) continue
    const prefix = denied.slice(0, -1)
    for (const permission of [...permissions]) {
      if (permission.startsWith(prefix)) permissions.delete(permission)
    }
  }
  return permissions
}

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

export class ImpersonationBlockedError extends Error {
  override readonly name = 'ImpersonationBlockedError'
  constructor(public readonly action?: string) {
    super(
      action
        ? `This action is blocked while impersonating: ${action}`
        : 'This action is blocked while impersonating another user',
    )
  }
}

export function assertNotImpersonating(
  ctx: { impersonation?: unknown | null },
  action?: string,
): void {
  if (ctx.impersonation) throw new ImpersonationBlockedError(action)
}

/** Does this context hold `perm`? Super-admin holds everything; `module.*`
 *  wildcards grant any `module.x`; `.read.{all,site,self}` tiers cascade. */
export function can(ctx: AccessCtx, perm: string): boolean {
  if (ctx.isSuperAdmin) return true
  return permissionSetCovers(ctx.permissions, perm)
}

export function assertCan(ctx: AccessCtx, perm: string): void {
  if (!can(ctx, perm)) throw new ForbiddenError(perm)
}

/** Narrow a role-assignment list to a single "switched-into" role, if set. */
export function effectiveRoleAssignments<T extends { roleId: string }>(
  activeRoleId: string | null | undefined,
  assignments: readonly T[],
): T[] {
  if (!activeRoleId) return [...assignments]
  return assignments.filter((a) => a.roleId === activeRoleId)
}

export type MembershipAccessOptions = {
  /**
   * The application's complete permission key list. It is only required when
   * a concrete deny must carve one permission out of a wildcard role grant.
   */
  permissionCatalogue?: readonly string[]
}

/** Database-neutral Postgres contract shared by Drizzle's node-postgres and postgres-js drivers. */
export type MembershipAccessDatabase<
  TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
  TSchema extends Record<string, unknown> = Record<string, never>,
> = PgDatabase<TQueryResult, TSchema>

export class PermissionCatalogueRequiredError extends Error {
  override readonly name = 'PermissionCatalogueRequiredError'
  constructor() {
    super(
      'A permission catalogue is required when a concrete deny overrides a wildcard grant. Bind one with createMembershipAccessResolver().',
    )
  }
}

/**
 * Bind application-owned permission keys once while retaining the production
 * `(tx, membershipId, activeRoleId?)` resolver contract at every call site.
 */
export function createMembershipAccessResolver(options: MembershipAccessOptions) {
  return <
    TQueryResult extends PgQueryResultHKT,
    TSchema extends Record<string, unknown>,
  >(
    tx: MembershipAccessDatabase<TQueryResult, TSchema>,
    membershipId: string,
    activeRoleId?: string | null,
  ) => resolveMembershipAccess(tx, membershipId, activeRoleId, options)
}

/**
 * Resolve a membership's effective permission set + scopes: the union of its
 * assigned roles' permission keys, plus per-user grants, minus per-user denies.
 * The first three arguments preserve the production source contract exactly.
 */
export async function resolveMembershipAccess<
  TQueryResult extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  tx: MembershipAccessDatabase<TQueryResult, TSchema>,
  membershipId: string,
  activeRoleId?: string | null,
  options: MembershipAccessOptions = {},
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

  const concreteDenies = overrides
    .filter((override) => override.effect === 'deny' && !override.permission.endsWith('.*'))
    .map((override) => override.permission)
  const wildcardNeedsCatalogue = [...permissions].some(
    (grant) =>
      grant.endsWith('.*') &&
      concreteDenies.some((deny) => deny.startsWith(grant.slice(0, -1))),
  )
  if (wildcardNeedsCatalogue && !options.permissionCatalogue) {
    throw new PermissionCatalogueRequiredError()
  }

  const resolved = applyPermissionOverrides(
    permissions,
    overrides,
    options.permissionCatalogue ?? [],
  )

  return { permissions: resolved, scopes, appliedRoleId }
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
  const order = { tenant: 6, sites: 5, team: 4, crews: 3, people: 2, self: 1 } as const
  let widest: RoleScope | null = null
  for (const s of ctx.scopes) {
    if (!widest || order[s.type] > order[widest.type]) widest = s
  }
  return widest ?? { type: 'self' }
}

/** Concise alias retained for compatible application adapters. */
export const selfOnlyFilter = widestScope

export type TemplateAccessDescriptor = {
  status: 'draft' | 'published' | 'archived'
  allowedRoles: string[] | null | undefined
  deletedAt?: Date | null
}
export type TemplateAccessMode = 'operate' | 'browse-records' | 'builder-edit'
export type ResponsePayloadAccessDescriptor = {
  status: string
  locked: boolean
  submittedBy: string | null
}

export function isTemplateBuilder(ctx: AccessCtx): boolean {
  return ctx.isSuperAdmin || can(ctx, 'forms.template.create')
}

export function canAccessTemplate(
  ctx: AccessCtx,
  template: TemplateAccessDescriptor,
  effectiveRoleKeys: ReadonlySet<string>,
  mode: TemplateAccessMode,
): boolean {
  if (template.deletedAt) return false
  const builder = isTemplateBuilder(ctx)
  if (mode === 'builder-edit') return builder
  if (mode === 'browse-records' && builder) return true
  if (template.status !== 'published') return false
  const allowed = template.allowedRoles
  return builder || !allowed || allowed.length === 0 || allowed.some((role) => effectiveRoleKeys.has(role))
}

export function canEditResponsePayload(
  ctx: AccessCtx & { membership: { id: string } | null },
  response: ResponsePayloadAccessDescriptor,
): boolean {
  if (response.locked) return false
  const isDraft = response.status === 'draft' || response.status === 'in_progress'
  const membershipId = ctx.membership?.id ?? null
  const isOwner = response.submittedBy !== null && response.submittedBy === membershipId
  const canWorkDraft = isDraft && can(ctx, 'forms.response.create')
  return (
    ctx.isSuperAdmin ||
    ctx.permissions.has('*') ||
    can(ctx, 'forms.response.read.all') ||
    (isOwner && (can(ctx, 'forms.response.update.own') || canWorkDraft)) ||
    (response.submittedBy === null && canWorkDraft)
  )
}
