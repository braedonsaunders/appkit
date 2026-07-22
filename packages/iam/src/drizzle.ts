import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session'
import {
  auditLog,
  memberships,
  roleAssignments,
  roles,
  userPermissionOverrides,
  users,
} from '@appkit/db'
import { IamConflictError, IamNotFoundError, IamProtectedRecordError } from './memory'
import type {
  AuditEventRecord,
  BulkRoleAssignmentInput,
  IamAdminService,
  MemberCapabilities,
  MemberRecord,
  MembershipStatus,
  RoleCapabilities,
  RoleRecord,
  RoleScope,
} from './types'

/** Database-neutral contract shared by Drizzle's node-postgres and postgres-js drivers. */
export type IamDatabase<
  TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
  TSchema extends Record<string, unknown> = Record<string, never>,
> = PgDatabase<TQueryResult, TSchema>

export type DrizzleIamOptions<
  TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
  TSchema extends Record<string, unknown> = Record<string, never>,
> = {
  db: IamDatabase<TQueryResult, TSchema>
  tenantId: string
  actor: { userId: string; name?: string; isSuperAdmin?: boolean }
  currentMembershipId?: string
  /** Enqueue or deliver an initial or rotated identity-provider invitation. */
  afterInvitePersisted?: (member: MemberRecord, reason: 'initial' | 'resend') => Promise<void>
  permissionCatalogue?: readonly string[]
  roleCapabilities?: (role: RoleRecord) => RoleCapabilities
  memberCapabilities?: (member: MemberRecord) => MemberCapabilities
  maxBulkMembers?: number
  hooks?: DrizzleIamHooks<TQueryResult, TSchema>
}

export type DrizzleIamHooks<
  TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
  TSchema extends Record<string, unknown> = Record<string, never>,
> = {
  /** Application-owned referential guards run inside the delete transaction. */
  beforeDeleteRole?: (tx: IamDatabase<TQueryResult, TSchema>, role: RoleRecord) => Promise<void>
  /** Reconcile dashboards, policies, or other role-owned projections atomically. */
  afterRoleChanged?: (tx: IamDatabase<TQueryResult, TSchema>, input: { before: RoleRecord | null; after: RoleRecord; reason: 'create' | 'update' | 'duplicate'; source?: RoleRecord }) => Promise<void>
  /** Reconcile application-owned access projections atomically with IAM writes. */
  afterMembershipAccessChanged?: (tx: IamDatabase<TQueryResult, TSchema>, input: { membershipIds: string[]; reason: 'invite' | 'status' | 'remove' | 'assign' | 'scope' | 'unassign' | 'bulk' | 'override' }) => Promise<void>
}

/** Postgres/RLS implementation of the complete IAM administration contract. */
export function createDrizzleIamService<
  TQueryResult extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(options: DrizzleIamOptions<TQueryResult, TSchema>): IamAdminService {
  type Database = IamDatabase<TQueryResult, TSchema>
  const { db, tenantId, actor } = options

  function capabilitiesForRole(role: RoleRecord): RoleCapabilities {
    return options.roleCapabilities?.(role) ?? role.capabilities ?? defaultRoleCapabilities(role)
  }

  function capabilitiesForMember(member: MemberRecord): MemberCapabilities {
    return options.memberCapabilities?.(member)
      ?? defaultMemberCapabilities(member, actor.isSuperAdmin === true)
  }

  function exposeRole(role: RoleRecord): RoleRecord {
    return { ...role, permissions: [...role.permissions], capabilities: capabilitiesForRole(role) }
  }

  function exposeMember(member: MemberRecord): MemberRecord {
    return { ...member, capabilities: capabilitiesForMember(member) }
  }

  function assertPermissions(values: readonly string[]): void {
    if (!options.permissionCatalogue) return
    const allowed = new Set(options.permissionCatalogue)
    const unknown = values.find((permission) => !allowed.has(permission))
    if (unknown) throw new Error(`Unknown permission: ${unknown}`)
  }

  async function writeAudit(
    tx: Database,
    input: { action: string; recordType: string; recordId?: string | null; summary: string; before?: unknown; after?: unknown; metadata?: Record<string, unknown> },
  ) {
    await tx.insert(auditLog).values({
      tenantId,
      actorUserId: actor.userId,
      action: input.action,
      entityType: input.recordType,
      entityId: input.recordId ?? null,
      summary: input.summary,
      before: input.before ?? null,
      after: input.after ?? null,
      metadata: input.metadata ?? {},
    })
  }

  async function roleById(source: Database, roleId: string): Promise<RoleRecord | null> {
    const [row] = await source
      .select({
        id: roles.id,
        key: roles.key,
        name: roles.name,
        description: roles.description,
        isBuiltIn: roles.isBuiltIn,
        permissions: roles.permissions,
        createdAt: roles.createdAt,
        updatedAt: roles.updatedAt,
        memberCount: count(roleAssignments.id),
      })
      .from(roles)
      .leftJoin(roleAssignments, eq(roleAssignments.roleId, roles.id))
      .where(and(eq(roles.tenantId, tenantId), eq(roles.id, roleId)))
      .groupBy(roles.id)
      .limit(1)
    return row ? exposeRole(row) : null
  }

  async function memberById(source: Database, membershipId: string): Promise<MemberRecord | null> {
    const [row] = await source
      .select({
        id: memberships.id,
        userId: memberships.userId,
        name: memberships.displayName,
        email: users.email,
        image: users.image,
        status: memberships.status,
        isSuperAdmin: users.isSuperAdmin,
        localeOverride: memberships.localeOverride,
        joinedAt: memberships.joinedAt,
        invitedAt: memberships.invitedAt,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)))
      .limit(1)
    if (!row) return null
    const [assignments, overrides] = await Promise.all([
      source
        .select({
          id: roleAssignments.id,
          roleId: roles.id,
          roleKey: roles.key,
          roleName: roles.name,
          scope: roleAssignments.scope,
        })
        .from(roleAssignments)
        .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
        .where(and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.membershipId, membershipId)))
        .orderBy(asc(roles.name)),
      source
        .select({ permission: userPermissionOverrides.permission, effect: userPermissionOverrides.effect })
        .from(userPermissionOverrides)
        .where(and(eq(userPermissionOverrides.tenantId, tenantId), eq(userPermissionOverrides.membershipId, membershipId)))
        .orderBy(asc(userPermissionOverrides.permission)),
    ])
    return exposeMember({
      ...row,
      isCurrentUser: row.id === options.currentMembershipId,
      assignments,
      overrides,
    })
  }

  return {
    async listRoles(query = {}) {
      const page = boundedPage(query.page)
      const perPage = boundedPerPage(query.perPage)
      const baseFilters: SQL[] = [eq(roles.tenantId, tenantId)]
      if (query.q) baseFilters.push(or(ilike(roles.name, escapedPattern(query.q)), ilike(roles.key, escapedPattern(query.q)), ilike(roles.description, escapedPattern(query.q)))!)
      const roleFilters = query.type ? [...baseFilters, eq(roles.isBuiltIn, query.type === 'built_in')] : baseFilters
      const where = and(...roleFilters)
      const [totalRows, values, typeRows] = await Promise.all([
        db.select({ value: count() }).from(roles).where(where),
        db
          .select({
            id: roles.id,
            key: roles.key,
            name: roles.name,
            description: roles.description,
            isBuiltIn: roles.isBuiltIn,
            permissions: roles.permissions,
            createdAt: roles.createdAt,
            updatedAt: roles.updatedAt,
            memberCount: count(roleAssignments.id),
          })
          .from(roles)
          .leftJoin(roleAssignments, eq(roleAssignments.roleId, roles.id))
          .where(where)
          .groupBy(roles.id)
          .orderBy(roleOrder(query.sort ?? 'name', query.direction ?? 'asc'))
          .limit(perPage)
          .offset((page - 1) * perPage),
        db.select({ isBuiltIn: roles.isBuiltIn, value: count() }).from(roles).where(and(...baseFilters)).groupBy(roles.isBuiltIn),
      ])
      const typeCounts = { built_in: 0, custom: 0 }
      for (const row of typeRows) typeCounts[row.isBuiltIn ? 'built_in' : 'custom'] = row.value
      return { rows: values.map((role) => exposeRole(role)), total: totalRows[0]?.value ?? 0, page, perPage, facets: { typeCounts } }
    },

    async getRole(roleId) {
      return roleById(db, roleId)
    },

    async createRole(input) {
      validateRole(input.name, input.key)
      assertPermissions(input.permissions)
      return db.transaction(async (tx) => {
        const key = await availableRoleKey(tx as Database, tenantId, input.key ?? slugify(input.name))
        const [inserted] = await tx.insert(roles).values({
          tenantId,
          key,
          name: input.name.trim(),
          description: normalizeOptional(input.description),
          permissions: unique(input.permissions),
          createdBy: actor.userId,
          updatedBy: actor.userId,
        }).returning({ id: roles.id })
        const role = await roleById(tx as Database, inserted!.id)
        if (!role) throw new Error('The created role could not be reloaded.')
        await options.hooks?.afterRoleChanged?.(tx as Database, { before: null, after: role, reason: 'create' })
        await writeAudit(tx as Database, { action: 'insert', recordType: 'role', recordId: role.id, summary: `Created role ${role.name}`, after: role })
        return role
      })
    },

    async updateRole(roleId, input) {
      validateRole(input.name, input.key)
      assertPermissions(input.permissions)
      return db.transaction(async (tx) => {
        const before = await roleById(tx as Database, roleId)
        if (!before) throw new IamNotFoundError(`Role not found: ${roleId}`)
        const capabilities = capabilitiesForRole(before)
        if (input.key && input.key !== before.key && !capabilities.updateKey) {
          throw new IamProtectedRecordError(capabilities.reason ?? 'This role key cannot be changed.')
        }
        if (input.key && input.key !== before.key) {
          const [conflict] = await tx.select({ id: roles.id }).from(roles).where(and(eq(roles.tenantId, tenantId), eq(roles.key, input.key))).limit(1)
          if (conflict) throw new IamConflictError(`Role key already exists: ${input.key}`)
        }
        if (!capabilities.updateDetails && (
          input.name.trim() !== before.name || normalizeOptional(input.description) !== before.description
        )) throw new IamProtectedRecordError(capabilities.reason ?? 'This role\'s details cannot be changed.')
        if (!capabilities.updatePermissions && !sameStrings(input.permissions, before.permissions)) {
          throw new IamProtectedRecordError(capabilities.reason ?? 'This role\'s permissions cannot be changed.')
        }
        await tx.update(roles).set({
          key: input.key ?? before.key,
          name: input.name.trim(),
          description: normalizeOptional(input.description),
          permissions: unique(input.permissions),
          updatedAt: new Date(),
          updatedBy: actor.userId,
        }).where(and(eq(roles.tenantId, tenantId), eq(roles.id, roleId)))
        const after = await roleById(tx as Database, roleId)
        if (!after) throw new Error('The updated role could not be reloaded.')
        await options.hooks?.afterRoleChanged?.(tx as Database, { before, after, reason: 'update' })
        await writeAudit(tx as Database, { action: 'update', recordType: 'role', recordId: roleId, summary: `Updated role ${after.name}`, before, after })
        return after
      })
    },

    async duplicateRole(roleId, name) {
      const source = await roleById(db, roleId)
      if (!source) throw new IamNotFoundError(`Role not found: ${roleId}`)
      const capabilities = capabilitiesForRole(source)
      if (!capabilities.duplicate) throw new IamProtectedRecordError(capabilities.reason ?? 'This role cannot be duplicated.')
      return db.transaction(async (tx) => {
        const duplicateName = name?.trim() || `${source.name} copy`
        const key = await availableRoleKey(tx as Database, tenantId, slugify(duplicateName))
        const [inserted] = await tx.insert(roles).values({
          tenantId,
          key,
          name: duplicateName,
          description: source.description,
          permissions: source.permissions,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        }).returning({ id: roles.id })
        const after = await roleById(tx as Database, inserted!.id)
        if (!after) throw new Error('The duplicated role could not be reloaded.')
        await options.hooks?.afterRoleChanged?.(tx as Database, { before: null, after, reason: 'duplicate', source })
        await writeAudit(tx as Database, { action: 'insert', recordType: 'role', recordId: after.id, summary: `Duplicated role ${source.name}`, after })
        return after
      })
    },

    async deleteRole(roleId) {
      await db.transaction(async (tx) => {
        const before = await roleById(tx as Database, roleId)
        if (!before) throw new IamNotFoundError(`Role not found: ${roleId}`)
        const capabilities = capabilitiesForRole(before)
        if (!capabilities.delete) throw new IamProtectedRecordError(capabilities.reason ?? 'This role cannot be deleted.')
        if (before.memberCount > 0) throw new IamConflictError('Remove every member assignment before deleting this role.')
        await options.hooks?.beforeDeleteRole?.(tx as Database, before)
        await tx.delete(roles).where(and(eq(roles.tenantId, tenantId), eq(roles.id, roleId)))
        await writeAudit(tx as Database, { action: 'delete', recordType: 'role', recordId: roleId, summary: `Deleted role ${before.name}`, before })
      })
    },

    async bulkUpdateRoleAssignments(input) {
      const scope = validatedScope(input.scope)
      const membershipIds = validateBulkInput(input, options.maxBulkMembers ?? 250)
      return db.transaction(async (tx): Promise<Awaited<ReturnType<IamAdminService['bulkUpdateRoleAssignments']>>> => {
        const role = await roleById(tx as Database, input.roleId)
        if (!role) throw new IamNotFoundError(`Role not found: ${input.roleId}`)
        const selected = await tx
          .select({ id: memberships.id, isSuperAdmin: users.isSuperAdmin })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(and(eq(memberships.tenantId, tenantId), inArray(memberships.id, membershipIds)))
        const eligible = selected.filter((member) =>
          member.id !== options.currentMembershipId && (actor.isSuperAdmin === true || !member.isSuperAdmin),
        )
        const eligibleIds = eligible.map((member) => member.id)
        const eligibleSet = new Set(eligibleIds)
        const skippedIds = membershipIds.filter((id) => !eligibleSet.has(id))
        const changedIds: string[] = []

        for (const membershipId of eligibleIds) {
          if (input.operation === 'remove') {
            const [removed] = await tx.delete(roleAssignments).where(and(
              eq(roleAssignments.tenantId, tenantId),
              eq(roleAssignments.membershipId, membershipId),
              eq(roleAssignments.roleId, role.id),
            )).returning({ id: roleAssignments.id })
            if (!removed) continue
          } else {
            if (input.operation === 'replace') {
              await tx.delete(roleAssignments).where(and(
                eq(roleAssignments.tenantId, tenantId),
                eq(roleAssignments.membershipId, membershipId),
              ))
            }
            await tx.insert(roleAssignments).values({
              tenantId,
              membershipId,
              roleId: role.id,
              scope,
              createdBy: actor.userId,
              updatedBy: actor.userId,
            }).onConflictDoUpdate({
              target: [roleAssignments.tenantId, roleAssignments.membershipId, roleAssignments.roleId],
              set: { scope, updatedAt: new Date(), updatedBy: actor.userId },
            })
          }
          changedIds.push(membershipId)
          await writeAudit(tx as Database, {
            action: 'update',
            recordType: 'membership',
            recordId: membershipId,
            summary: `${bulkVerb(input.operation)} role ${role.name}`,
            metadata: { roleId: role.id, operation: input.operation, scope },
          })
        }
        if (changedIds.length) {
          await options.hooks?.afterMembershipAccessChanged?.(tx as Database, {
            membershipIds: changedIds,
            reason: 'bulk',
          })
        }
        return { operation: input.operation, roleId: role.id, changedIds, skippedIds }
      })
    },

    async listMembers(query = {}) {
      const page = boundedPage(query.page)
      const perPage = boundedPerPage(query.perPage)
      const baseFilters: SQL[] = [eq(memberships.tenantId, tenantId)]
      if (query.q) baseFilters.push(or(ilike(memberships.displayName, escapedPattern(query.q)), ilike(users.email, escapedPattern(query.q)))!)
      if (query.roleId) {
        const assigned = await db.select({ membershipId: roleAssignments.membershipId }).from(roleAssignments).where(and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.roleId, query.roleId)))
        if (assigned.length === 0) return { rows: [], total: 0, page, perPage, facets: { statusCounts: emptyStatusCounts() } }
        baseFilters.push(inArray(memberships.id, assigned.map((row) => row.membershipId)))
      }
      const baseWhere = and(...baseFilters)
      const filters = query.status ? [...baseFilters, eq(memberships.status, query.status)] : baseFilters
      const where = and(...filters)
      const [totalRows, ids, statusRows] = await Promise.all([
        db.select({ value: count() }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(where),
        db.select({ id: memberships.id }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(where).orderBy(memberOrder(query.sort ?? 'name', query.direction ?? 'asc')).limit(perPage).offset((page - 1) * perPage),
        db.select({ status: memberships.status, value: count() }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(baseWhere).groupBy(memberships.status),
      ])
      const values = (await Promise.all(ids.map((row) => memberById(db, row.id)))).filter((row): row is MemberRecord => Boolean(row))
      const statusCounts = emptyStatusCounts()
      for (const row of statusRows) statusCounts[row.status] = row.value
      return { rows: values, total: totalRows[0]?.value ?? 0, page, perPage, facets: { statusCounts } }
    },

    async getMember(membershipId) {
      return memberById(db, membershipId)
    },

    async inviteMember(input) {
      const email = input.email.trim().toLocaleLowerCase()
      if (!email || !email.includes('@')) throw new Error('A valid email address is required.')
      if (!input.name.trim()) throw new Error('A member name is required.')
      const member = await db.transaction(async (tx) => {
        let [identity] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
        if (!identity) {
          ;[identity] = await tx.insert(users).values({ email, name: input.name.trim() }).returning({ id: users.id })
        }
        const [existing] = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, identity!.id))).limit(1)
        if (existing) throw new IamConflictError(`A member already exists for ${email}.`)
        const invitedAt = new Date()
        const [membership] = await tx.insert(memberships).values({ tenantId, userId: identity!.id, displayName: input.name.trim(), localeOverride: input.localeOverride ?? null, status: 'invited', invitedAt, invitedBy: actor.userId, createdBy: actor.userId, updatedBy: actor.userId }).returning({ id: memberships.id })
        for (const assignment of input.assignments) {
          await tx.insert(roleAssignments).values({ tenantId, membershipId: membership!.id, roleId: assignment.roleId, scope: validatedScope(assignment.scope), createdBy: actor.userId, updatedBy: actor.userId })
        }
        const after = await memberById(tx as Database, membership!.id)
        if (!after) throw new Error('The invited member could not be reloaded.')
        await options.hooks?.afterMembershipAccessChanged?.(tx as Database, { membershipIds: [after.id], reason: 'invite' })
        await writeAudit(tx as Database, { action: 'insert', recordType: 'membership', recordId: after.id, summary: `Invited ${after.email}`, after })
        return after
      })
      await options.afterInvitePersisted?.(member, 'initial')
      return member
    },

    async resendInvite(membershipId) {
      const member = await db.transaction(async (tx) => {
        const before = await memberById(tx as Database, membershipId)
        if (!before) throw new IamNotFoundError(`Member not found: ${membershipId}`)
        const capabilities = capabilitiesForMember(before)
        if (before.status !== 'invited' || !capabilities.resendInvite) {
          throw new IamProtectedRecordError(capabilities.reason ?? 'Only pending invitations can be resent.')
        }
        const candidate = new Date()
        const invitedAt = new Date(Math.max(candidate.getTime(), (before.invitedAt?.getTime() ?? 0) + 1))
        const [rotated] = await tx.update(memberships).set({ invitedAt, updatedAt: candidate, updatedBy: actor.userId }).where(and(
          eq(memberships.tenantId, tenantId),
          eq(memberships.id, membershipId),
          eq(memberships.status, 'invited'),
        )).returning({ id: memberships.id })
        if (!rotated) throw new IamConflictError('The invitation changed. Refresh and try again.')
        const after = await memberById(tx as Database, membershipId)
        if (!after) throw new Error('The rotated invitation could not be reloaded.')
        await writeAudit(tx as Database, {
          action: 'invite', recordType: 'membership', recordId: membershipId,
          summary: `Resent invite to ${after.email}`,
          before: { invitedAt: before.invitedAt }, after: { invitedAt },
        })
        return after
      })
      await options.afterInvitePersisted?.(member, 'resend')
      return member
    },

    async updateMember(membershipId, input) {
      return db.transaction(async (tx) => {
        const before = await memberById(tx as Database, membershipId)
        if (!before) throw new IamNotFoundError(`Member not found: ${membershipId}`)
        const capabilities = capabilitiesForMember(before)
        assertStatusTransition(before.status, input.status)
        if ((input.name !== undefined || input.localeOverride !== undefined) && !capabilities.updateProfile) {
          throw new IamProtectedRecordError(capabilities.reason ?? 'This member profile cannot be changed.')
        }
        if (input.status !== undefined && input.status !== before.status && !capabilities.changeStatus) {
          throw new IamProtectedRecordError(capabilities.reason ?? 'This membership status cannot be changed.')
        }
        if (input.name !== undefined && !input.name.trim()) throw new Error('A member name is required.')
        await tx.update(memberships).set({ displayName: input.name?.trim() ?? before.name, status: input.status ?? before.status, localeOverride: input.localeOverride === undefined ? before.localeOverride : input.localeOverride, joinedAt: input.status === 'active' && !before.joinedAt ? new Date() : before.joinedAt, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)))
        const after = await memberById(tx as Database, membershipId)
        if (!after) throw new Error('The updated member could not be reloaded.')
        if (input.status !== undefined && input.status !== before.status) {
          await options.hooks?.afterMembershipAccessChanged?.(tx as Database, { membershipIds: [membershipId], reason: 'status' })
        }
        await writeAudit(tx as Database, { action: 'update', recordType: 'membership', recordId: membershipId, summary: `Updated ${after.email}`, before, after })
        return after
      })
    },

    async removeMember(membershipId) {
      await db.transaction(async (tx) => {
        const before = await memberById(tx as Database, membershipId)
        if (!before) throw new IamNotFoundError(`Member not found: ${membershipId}`)
        const capabilities = capabilitiesForMember(before)
        if (!capabilities.remove) throw new IamProtectedRecordError(capabilities.reason ?? 'This member cannot be removed.')
        await options.hooks?.afterMembershipAccessChanged?.(tx as Database, { membershipIds: [membershipId], reason: 'remove' })
        await tx.delete(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)))
        await writeAudit(tx as Database, { action: 'delete', recordType: 'membership', recordId: membershipId, summary: `Removed ${before.email}`, before })
      })
    },

    async assignRole(membershipId, roleId, scope) {
      return db.transaction(async (tx) => {
        const member = await memberById(tx as Database, membershipId)
        const role = await roleById(tx as Database, roleId)
        if (!member) throw new IamNotFoundError(`Member not found: ${membershipId}`)
        if (!role) throw new IamNotFoundError(`Role not found: ${roleId}`)
        const capabilities = capabilitiesForMember(member)
        if (!capabilities.manageRoles) throw new IamProtectedRecordError(capabilities.reason ?? 'This member\'s roles cannot be changed.')
        scope = validatedScope(scope)
        const [existing] = await tx.select({ id: roleAssignments.id, scope: roleAssignments.scope }).from(roleAssignments).where(and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.membershipId, membershipId), eq(roleAssignments.roleId, roleId))).limit(1)
        let id: string
        if (existing) {
          id = existing.id
          await tx.update(roleAssignments).set({ scope, updatedAt: new Date(), updatedBy: actor.userId }).where(eq(roleAssignments.id, id))
          await writeAudit(tx as Database, { action: 'update', recordType: 'role_assignment', recordId: id, summary: `Updated ${member.name}'s ${role.name} scope`, before: existing, after: { ...existing, scope } })
        } else {
          const [inserted] = await tx.insert(roleAssignments).values({ tenantId, membershipId, roleId, scope, createdBy: actor.userId, updatedBy: actor.userId }).returning({ id: roleAssignments.id })
          id = inserted!.id
          await writeAudit(tx as Database, { action: 'insert', recordType: 'role_assignment', recordId: id, summary: `Assigned ${role.name} to ${member.name}`, after: { roleId, membershipId, scope } })
        }
        await options.hooks?.afterMembershipAccessChanged?.(tx as Database, { membershipIds: [membershipId], reason: 'assign' })
        return { id, roleId, roleKey: role.key, roleName: role.name, scope }
      })
    },

    async updateAssignmentScope(assignmentId, scope) {
      return db.transaction(async (tx) => {
        const [before] = await tx.select({ id: roleAssignments.id, roleId: roleAssignments.roleId, membershipId: roleAssignments.membershipId, scope: roleAssignments.scope }).from(roleAssignments).where(and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.id, assignmentId))).limit(1)
        if (!before) throw new IamNotFoundError(`Role assignment not found: ${assignmentId}`)
        const member = await memberById(tx as Database, before.membershipId)
        if (!member) throw new IamNotFoundError(`Member not found: ${before.membershipId}`)
        const capabilities = capabilitiesForMember(member)
        if (!capabilities.manageRoles) throw new IamProtectedRecordError(capabilities.reason ?? 'This member\'s roles cannot be changed.')
        scope = validatedScope(scope)
        await tx.update(roleAssignments).set({ scope, updatedAt: new Date(), updatedBy: actor.userId }).where(eq(roleAssignments.id, assignmentId))
        const role = await roleById(tx as Database, before.roleId)
        if (!role) throw new Error('The assignment role could not be reloaded.')
        await options.hooks?.afterMembershipAccessChanged?.(tx as Database, { membershipIds: [before.membershipId], reason: 'scope' })
        await writeAudit(tx as Database, { action: 'update', recordType: 'role_assignment', recordId: assignmentId, summary: `Updated ${role.name} scope`, before, after: { ...before, scope } })
        return { id: assignmentId, roleId: role.id, roleKey: role.key, roleName: role.name, scope }
      })
    },

    async removeAssignment(assignmentId) {
      await db.transaction(async (tx) => {
        const [before] = await tx.select({ id: roleAssignments.id, roleId: roleAssignments.roleId, membershipId: roleAssignments.membershipId, scope: roleAssignments.scope }).from(roleAssignments).where(and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.id, assignmentId))).limit(1)
        if (!before) throw new IamNotFoundError(`Role assignment not found: ${assignmentId}`)
        const member = await memberById(tx as Database, before.membershipId)
        if (!member) throw new IamNotFoundError(`Member not found: ${before.membershipId}`)
        const capabilities = capabilitiesForMember(member)
        if (!capabilities.manageRoles) throw new IamProtectedRecordError(capabilities.reason ?? 'This member\'s roles cannot be changed.')
        await tx.delete(roleAssignments).where(eq(roleAssignments.id, assignmentId))
        await options.hooks?.afterMembershipAccessChanged?.(tx as Database, { membershipIds: [before.membershipId], reason: 'unassign' })
        await writeAudit(tx as Database, { action: 'delete', recordType: 'role_assignment', recordId: assignmentId, summary: 'Removed role assignment', before })
      })
    },

    async setPermissionOverride(membershipId, override) {
      assertPermissions([override.permission])
      if (override.effect !== 'grant' && override.effect !== 'deny') throw new Error('Permission override effect must be grant or deny.')
      await db.transaction(async (tx) => {
        const member = await memberById(tx as Database, membershipId)
        if (!member) throw new IamNotFoundError(`Member not found: ${membershipId}`)
        const capabilities = capabilitiesForMember(member)
        if (!capabilities.manageOverrides) throw new IamProtectedRecordError(capabilities.reason ?? 'This member\'s permission overrides cannot be changed.')
        const [before] = await tx.select({ permission: userPermissionOverrides.permission, effect: userPermissionOverrides.effect }).from(userPermissionOverrides).where(and(eq(userPermissionOverrides.tenantId, tenantId), eq(userPermissionOverrides.membershipId, membershipId), eq(userPermissionOverrides.permission, override.permission))).limit(1)
        await tx.insert(userPermissionOverrides).values({ tenantId, membershipId, permission: override.permission, effect: override.effect, createdBy: actor.userId, updatedBy: actor.userId }).onConflictDoUpdate({ target: [userPermissionOverrides.membershipId, userPermissionOverrides.permission], set: { effect: override.effect, updatedAt: new Date(), updatedBy: actor.userId } })
        await writeAudit(tx as Database, { action: before ? 'update' : 'insert', recordType: 'permission_override', recordId: membershipId, summary: `${override.effect === 'grant' ? 'Granted' : 'Denied'} ${override.permission}`, before: before ?? null, after: override })
        await options.hooks?.afterMembershipAccessChanged?.(tx as Database, { membershipIds: [membershipId], reason: 'override' })
      })
    },

    async removePermissionOverride(membershipId, permission) {
      await db.transaction(async (tx) => {
        const member = await memberById(tx as Database, membershipId)
        if (!member) throw new IamNotFoundError(`Member not found: ${membershipId}`)
        const capabilities = capabilitiesForMember(member)
        if (!capabilities.manageOverrides) throw new IamProtectedRecordError(capabilities.reason ?? 'This member\'s permission overrides cannot be changed.')
        const [before] = await tx.select({ permission: userPermissionOverrides.permission, effect: userPermissionOverrides.effect }).from(userPermissionOverrides).where(and(eq(userPermissionOverrides.tenantId, tenantId), eq(userPermissionOverrides.membershipId, membershipId), eq(userPermissionOverrides.permission, permission))).limit(1)
        if (!before) return
        await tx.delete(userPermissionOverrides).where(and(eq(userPermissionOverrides.tenantId, tenantId), eq(userPermissionOverrides.membershipId, membershipId), eq(userPermissionOverrides.permission, permission)))
        await writeAudit(tx as Database, { action: 'delete', recordType: 'permission_override', recordId: membershipId, summary: `Removed ${permission} override`, before })
        await options.hooks?.afterMembershipAccessChanged?.(tx as Database, { membershipIds: [membershipId], reason: 'override' })
      })
    },

    async listAuditEvents(query = {}) {
      const page = boundedPage(query.page)
      const perPage = boundedPerPage(query.perPage)
      const baseFilters: SQL[] = [eq(auditLog.tenantId, tenantId)]
      if (query.q) baseFilters.push(or(ilike(auditLog.action, escapedPattern(query.q)), ilike(auditLog.entityType, escapedPattern(query.q)), ilike(auditLog.summary, escapedPattern(query.q)))!)
      if (query.recordId) baseFilters.push(eq(auditLog.entityId, query.recordId))
      const filters = [...baseFilters]
      if (query.action) filters.push(eq(auditLog.action, query.action))
      if (query.recordType) filters.push(eq(auditLog.entityType, query.recordType))
      const where = and(...filters)
      const baseWhere = and(...baseFilters)
      const [totalRows, values, actionRows, recordTypeRows] = await Promise.all([
        db.select({ value: count() }).from(auditLog).where(where),
        db.select({ id: auditLog.id, at: auditLog.createdAt, actorName: users.name, actorUserId: auditLog.actorUserId, action: auditLog.action, recordType: auditLog.entityType, recordId: auditLog.entityId, requestId: auditLog.metadata, summary: auditLog.summary, before: auditLog.before, after: auditLog.after, metadata: auditLog.metadata }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorUserId)).where(where).orderBy(auditOrder(query.sort ?? 'at', query.direction ?? 'desc')).limit(perPage).offset((page - 1) * perPage),
        db.selectDistinct({ value: auditLog.action }).from(auditLog).where(baseWhere).orderBy(asc(auditLog.action)),
        db.selectDistinct({ value: auditLog.entityType }).from(auditLog).where(baseWhere).orderBy(asc(auditLog.entityType)),
      ])
      const rows: AuditEventRecord[] = values.map((row) => ({ ...row, requestId: typeof row.requestId.requestId === 'string' ? row.requestId.requestId : null }))
      return { rows, total: totalRows[0]?.value ?? 0, page, perPage, facets: { actions: actionRows.map((row) => row.value), recordTypes: recordTypeRows.map((row) => row.value) } }
    },

    async getAuditEvent(eventId) {
      const [row] = await db.select({ id: auditLog.id, at: auditLog.createdAt, actorName: users.name, actorUserId: auditLog.actorUserId, action: auditLog.action, recordType: auditLog.entityType, recordId: auditLog.entityId, summary: auditLog.summary, before: auditLog.before, after: auditLog.after, metadata: auditLog.metadata }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorUserId)).where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.id, eventId))).limit(1)
      if (!row) return null
      return { ...row, requestId: typeof row.metadata.requestId === 'string' ? row.metadata.requestId : null }
    },
  }
}

function boundedPage(page?: number) { return Math.max(1, Math.trunc(page ?? 1)) }
function boundedPerPage(perPage?: number) { return Math.max(1, Math.min(100, Math.trunc(perPage ?? 25))) }
function emptyStatusCounts() { return { active: 0, invited: 0, suspended: 0 } satisfies Record<MembershipStatus, number> }
function escapedPattern(value: string) { return `%${value.trim().replace(/[\\%_]/g, '\\$&')}%` }
function normalizeOptional(value: string | null | undefined) { const next = value?.trim(); return next ? next : null }
function unique(values: string[]) { return [...new Set(values)] }
function sameStrings(left: readonly string[], right: readonly string[]) {
  const a = [...new Set(left)].sort()
  const b = [...new Set(right)].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}
function slugify(value: string) { return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'role' }
function validateRole(name: string, key?: string) { if (!name.trim()) throw new Error('A role name is required.'); if (key && !/^[a-z][a-z0-9_-]*$/.test(key)) throw new Error('Role keys must start with a letter and contain lowercase letters, numbers, underscores, or hyphens.') }
function defaultRoleCapabilities(role: RoleRecord): RoleCapabilities {
  return {
    updateKey: !role.isBuiltIn,
    updateDetails: true,
    updatePermissions: true,
    duplicate: true,
    delete: !role.isBuiltIn,
    reason: role.isBuiltIn ? 'Built-in role keys and deletion are protected.' : undefined,
  }
}
function defaultMemberCapabilities(member: MemberRecord, actorIsSuperAdmin: boolean): MemberCapabilities {
  const canActOnAccount = actorIsSuperAdmin || !member.isSuperAdmin
  const canChangeAccess = !member.isCurrentUser && canActOnAccount
  return {
    updateProfile: canActOnAccount,
    changeStatus: canChangeAccess && member.status !== 'invited',
    remove: canChangeAccess,
    manageRoles: canChangeAccess,
    manageOverrides: canChangeAccess,
    resendInvite: canActOnAccount && member.status === 'invited',
    reason: member.isCurrentUser
      ? 'You cannot change your own access or membership lifecycle.'
      : !canActOnAccount
        ? 'Only a super-admin can change a super-admin account.'
        : undefined,
  }
}
function assertStatusTransition(current: MemberRecord['status'], requested: MemberRecord['status'] | undefined) {
  if (!requested || requested === current) return
  const allowed = (current === 'active' && requested === 'suspended')
    || (current === 'suspended' && requested === 'active')
  if (!allowed) throw new IamConflictError('Pending invitations activate only when the member accepts the invitation.')
}
function validateBulkInput(input: BulkRoleAssignmentInput, maxMembers: number): string[] {
  if (input.operation !== 'add' && input.operation !== 'replace' && input.operation !== 'remove') {
    throw new Error('Bulk role operation must be add, replace, or remove.')
  }
  if (!input.roleId.trim()) throw new Error('A role is required.')
  const membershipIds = unique(input.membershipIds.filter((value) => typeof value === 'string' && value.trim()))
  if (membershipIds.length === 0) throw new Error('Select at least one member.')
  if (membershipIds.length > maxMembers) throw new Error(`Select ${maxMembers} or fewer members at a time.`)
  return membershipIds
}
function validatedScope(value: RoleScope): RoleScope {
  if (!value || typeof value !== 'object') throw new Error('A valid role scope is required.')
  if (value.type === 'tenant' || value.type === 'self') return { type: value.type }
  if (value.type === 'sites') return { type: 'sites', siteIds: stringArray(value.siteIds, 'siteIds') }
  if (value.type === 'people') return { type: 'people', personIds: stringArray(value.personIds, 'personIds') }
  if (value.type === 'crews') return { type: 'crews', crewIds: stringArray(value.crewIds, 'crewIds') }
  if (value.type === 'team') return { type: 'team', departmentIds: stringArray(value.departmentIds, 'departmentIds'), groupIds: stringArray(value.groupIds, 'groupIds') }
  throw new Error('Unknown role scope type.')
}
function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim())) {
    throw new Error(`${label} must contain non-empty string identifiers.`)
  }
  return unique(value)
}
function bulkVerb(operation: BulkRoleAssignmentInput['operation']): string {
  if (operation === 'replace') return 'Replaced roles with'
  if (operation === 'remove') return 'Removed'
  return 'Set'
}
async function availableRoleKey<
  TQueryResult extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(db: IamDatabase<TQueryResult, TSchema>, tenantId: string, preferred: string) { const base = slugify(preferred); let candidate = base; let suffix = 2; while ((await db.select({ id: roles.id }).from(roles).where(and(eq(roles.tenantId, tenantId), eq(roles.key, candidate))).limit(1)).length) candidate = `${base}-${suffix++}`; return candidate }
function roleOrder(sort: 'name' | 'permissions' | 'members' | 'updated', direction: 'asc' | 'desc') { const order = direction === 'asc' ? asc : desc; if (sort === 'permissions') return order(sql<number>`jsonb_array_length(${roles.permissions})`); if (sort === 'members') return order(count(roleAssignments.id)); if (sort === 'updated') return order(roles.updatedAt); return order(roles.name) }
function memberOrder(sort: 'name' | 'email' | 'status' | 'joined', direction: 'asc' | 'desc') { const order = direction === 'asc' ? asc : desc; if (sort === 'email') return order(users.email); if (sort === 'status') return order(memberships.status); if (sort === 'joined') return order(memberships.joinedAt); return order(memberships.displayName) }
function auditOrder(sort: 'at' | 'actor' | 'action' | 'record', direction: 'asc' | 'desc') { const order = direction === 'asc' ? asc : desc; if (sort === 'actor') return order(users.name); if (sort === 'action') return order(auditLog.action); if (sort === 'record') return order(auditLog.entityType); return order(auditLog.createdAt) }
