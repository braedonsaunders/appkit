import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { roleAssignments, roles, userPermissionOverrides, type RoleScope } from '@appkit/db'
import { applyPermissionOverrides, permissionSetCovers } from '@appkit/iam'

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

  const resolved = applyPermissionOverrides(
    permissions,
    overrides,
    permissionCatalogue,
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
