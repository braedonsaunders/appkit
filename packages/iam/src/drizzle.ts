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
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
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
  IamAdminService,
  MemberRecord,
  RoleRecord,
} from './types'

type Database = NodePgDatabase<Record<string, never>>

export type DrizzleIamOptions = {
  db: Database
  tenantId: string
  actor: { userId: string; name?: string }
  currentMembershipId?: string
  /** Enqueue or deliver the identity-provider invitation after persistence. */
  afterInvitePersisted?: (member: MemberRecord) => Promise<void>
}

/** Postgres/RLS implementation of the complete IAM administration contract. */
export function createDrizzleIamService(options: DrizzleIamOptions): IamAdminService {
  const { db, tenantId, actor } = options

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
    return row ?? null
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
    return {
      ...row,
      isCurrentUser: row.id === options.currentMembershipId,
      assignments,
      overrides,
    }
  }

  return {
    async listRoles(query = {}) {
      const page = boundedPage(query.page)
      const perPage = boundedPerPage(query.perPage)
      const where = query.q
        ? and(eq(roles.tenantId, tenantId), or(ilike(roles.name, escapedPattern(query.q)), ilike(roles.key, escapedPattern(query.q)), ilike(roles.description, escapedPattern(query.q))))
        : eq(roles.tenantId, tenantId)
      const [totalRows, values] = await Promise.all([
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
      ])
      return { rows: values, total: totalRows[0]?.value ?? 0, page, perPage }
    },

    async getRole(roleId) {
      return roleById(db, roleId)
    },

    async createRole(input) {
      validateRole(input.name, input.key)
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
        await writeAudit(tx as Database, { action: 'insert', recordType: 'role', recordId: role.id, summary: `Created role ${role.name}`, after: role })
        return role
      })
    },

    async updateRole(roleId, input) {
      validateRole(input.name, input.key)
      return db.transaction(async (tx) => {
        const before = await roleById(tx as Database, roleId)
        if (!before) throw new IamNotFoundError(`Role not found: ${roleId}`)
        if (before.isBuiltIn && input.key && input.key !== before.key) throw new IamProtectedRecordError('Built-in role keys cannot be changed.')
        if (input.key && input.key !== before.key) {
          const [conflict] = await tx.select({ id: roles.id }).from(roles).where(and(eq(roles.tenantId, tenantId), eq(roles.key, input.key))).limit(1)
          if (conflict) throw new IamConflictError(`Role key already exists: ${input.key}`)
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
        await writeAudit(tx as Database, { action: 'update', recordType: 'role', recordId: roleId, summary: `Updated role ${after.name}`, before, after })
        return after
      })
    },

    async duplicateRole(roleId, name) {
      const source = await roleById(db, roleId)
      if (!source) throw new IamNotFoundError(`Role not found: ${roleId}`)
      return this.createRole({ name: name?.trim() || `${source.name} copy`, description: source.description, permissions: source.permissions })
    },

    async deleteRole(roleId) {
      await db.transaction(async (tx) => {
        const before = await roleById(tx as Database, roleId)
        if (!before) throw new IamNotFoundError(`Role not found: ${roleId}`)
        if (before.isBuiltIn) throw new IamProtectedRecordError('Built-in roles cannot be deleted.')
        if (before.memberCount > 0) throw new IamConflictError('Remove every member assignment before deleting this role.')
        await tx.delete(roles).where(and(eq(roles.tenantId, tenantId), eq(roles.id, roleId)))
        await writeAudit(tx as Database, { action: 'delete', recordType: 'role', recordId: roleId, summary: `Deleted role ${before.name}`, before })
      })
    },

    async listMembers(query = {}) {
      const page = boundedPage(query.page)
      const perPage = boundedPerPage(query.perPage)
      const filters: SQL[] = [eq(memberships.tenantId, tenantId)]
      if (query.q) filters.push(or(ilike(memberships.displayName, escapedPattern(query.q)), ilike(users.email, escapedPattern(query.q)))!)
      if (query.status) filters.push(eq(memberships.status, query.status))
      if (query.roleId) {
        const assigned = await db.select({ membershipId: roleAssignments.membershipId }).from(roleAssignments).where(and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.roleId, query.roleId)))
        if (assigned.length === 0) return { rows: [], total: 0, page, perPage }
        filters.push(inArray(memberships.id, assigned.map((row) => row.membershipId)))
      }
      const where = and(...filters)
      const [totalRows, ids] = await Promise.all([
        db.select({ value: count() }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(where),
        db.select({ id: memberships.id }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(where).orderBy(memberOrder(query.sort ?? 'name', query.direction ?? 'asc')).limit(perPage).offset((page - 1) * perPage),
      ])
      const values = (await Promise.all(ids.map((row) => memberById(db, row.id)))).filter((row): row is MemberRecord => Boolean(row))
      return { rows: values, total: totalRows[0]?.value ?? 0, page, perPage }
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
          await tx.insert(roleAssignments).values({ tenantId, membershipId: membership!.id, roleId: assignment.roleId, scope: assignment.scope, createdBy: actor.userId, updatedBy: actor.userId })
        }
        const after = await memberById(tx as Database, membership!.id)
        if (!after) throw new Error('The invited member could not be reloaded.')
        await writeAudit(tx as Database, { action: 'insert', recordType: 'membership', recordId: after.id, summary: `Invited ${after.email}`, after })
        return after
      })
      await options.afterInvitePersisted?.(member)
      return member
    },

    async updateMember(membershipId, input) {
      return db.transaction(async (tx) => {
        const before = await memberById(tx as Database, membershipId)
        if (!before) throw new IamNotFoundError(`Member not found: ${membershipId}`)
        if ((before.isCurrentUser || before.isSuperAdmin) && input.status && input.status !== 'active') throw new IamProtectedRecordError('A protected member cannot be suspended.')
        if (input.name !== undefined && !input.name.trim()) throw new Error('A member name is required.')
        await tx.update(memberships).set({ displayName: input.name?.trim() ?? before.name, status: input.status ?? before.status, localeOverride: input.localeOverride === undefined ? before.localeOverride : input.localeOverride, joinedAt: input.status === 'active' && !before.joinedAt ? new Date() : before.joinedAt, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)))
        const after = await memberById(tx as Database, membershipId)
        if (!after) throw new Error('The updated member could not be reloaded.')
        await writeAudit(tx as Database, { action: 'update', recordType: 'membership', recordId: membershipId, summary: `Updated ${after.email}`, before, after })
        return after
      })
    },

    async removeMember(membershipId) {
      await db.transaction(async (tx) => {
        const before = await memberById(tx as Database, membershipId)
        if (!before) throw new IamNotFoundError(`Member not found: ${membershipId}`)
        if (before.isCurrentUser || before.isSuperAdmin) throw new IamProtectedRecordError('A protected member cannot be removed.')
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
        return { id, roleId, roleKey: role.key, roleName: role.name, scope }
      })
    },

    async updateAssignmentScope(assignmentId, scope) {
      return db.transaction(async (tx) => {
        const [before] = await tx.select({ id: roleAssignments.id, roleId: roleAssignments.roleId, membershipId: roleAssignments.membershipId, scope: roleAssignments.scope }).from(roleAssignments).where(and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.id, assignmentId))).limit(1)
        if (!before) throw new IamNotFoundError(`Role assignment not found: ${assignmentId}`)
        await tx.update(roleAssignments).set({ scope, updatedAt: new Date(), updatedBy: actor.userId }).where(eq(roleAssignments.id, assignmentId))
        const role = await roleById(tx as Database, before.roleId)
        if (!role) throw new Error('The assignment role could not be reloaded.')
        await writeAudit(tx as Database, { action: 'update', recordType: 'role_assignment', recordId: assignmentId, summary: `Updated ${role.name} scope`, before, after: { ...before, scope } })
        return { id: assignmentId, roleId: role.id, roleKey: role.key, roleName: role.name, scope }
      })
    },

    async removeAssignment(assignmentId) {
      await db.transaction(async (tx) => {
        const [before] = await tx.select({ id: roleAssignments.id, roleId: roleAssignments.roleId, membershipId: roleAssignments.membershipId, scope: roleAssignments.scope }).from(roleAssignments).where(and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.id, assignmentId))).limit(1)
        if (!before) throw new IamNotFoundError(`Role assignment not found: ${assignmentId}`)
        const member = await memberById(tx as Database, before.membershipId)
        if (member && (member.isCurrentUser || member.isSuperAdmin) && member.assignments.length === 1) throw new IamProtectedRecordError('The final role cannot be removed from a protected member.')
        await tx.delete(roleAssignments).where(eq(roleAssignments.id, assignmentId))
        await writeAudit(tx as Database, { action: 'delete', recordType: 'role_assignment', recordId: assignmentId, summary: 'Removed role assignment', before })
      })
    },

    async setPermissionOverride(membershipId, override) {
      await db.transaction(async (tx) => {
        const [before] = await tx.select({ permission: userPermissionOverrides.permission, effect: userPermissionOverrides.effect }).from(userPermissionOverrides).where(and(eq(userPermissionOverrides.tenantId, tenantId), eq(userPermissionOverrides.membershipId, membershipId), eq(userPermissionOverrides.permission, override.permission))).limit(1)
        await tx.insert(userPermissionOverrides).values({ tenantId, membershipId, permission: override.permission, effect: override.effect, createdBy: actor.userId, updatedBy: actor.userId }).onConflictDoUpdate({ target: [userPermissionOverrides.membershipId, userPermissionOverrides.permission], set: { effect: override.effect, updatedAt: new Date(), updatedBy: actor.userId } })
        await writeAudit(tx as Database, { action: before ? 'update' : 'insert', recordType: 'permission_override', recordId: membershipId, summary: `${override.effect === 'grant' ? 'Granted' : 'Denied'} ${override.permission}`, before: before ?? null, after: override })
      })
    },

    async removePermissionOverride(membershipId, permission) {
      await db.transaction(async (tx) => {
        const [before] = await tx.select({ permission: userPermissionOverrides.permission, effect: userPermissionOverrides.effect }).from(userPermissionOverrides).where(and(eq(userPermissionOverrides.tenantId, tenantId), eq(userPermissionOverrides.membershipId, membershipId), eq(userPermissionOverrides.permission, permission))).limit(1)
        if (!before) return
        await tx.delete(userPermissionOverrides).where(and(eq(userPermissionOverrides.tenantId, tenantId), eq(userPermissionOverrides.membershipId, membershipId), eq(userPermissionOverrides.permission, permission)))
        await writeAudit(tx as Database, { action: 'delete', recordType: 'permission_override', recordId: membershipId, summary: `Removed ${permission} override`, before })
      })
    },

    async listAuditEvents(query = {}) {
      const page = boundedPage(query.page)
      const perPage = boundedPerPage(query.perPage)
      const filters: SQL[] = [eq(auditLog.tenantId, tenantId)]
      if (query.q) filters.push(or(ilike(auditLog.action, escapedPattern(query.q)), ilike(auditLog.entityType, escapedPattern(query.q)), ilike(auditLog.summary, escapedPattern(query.q)))!)
      if (query.action) filters.push(eq(auditLog.action, query.action))
      if (query.recordType) filters.push(eq(auditLog.entityType, query.recordType))
      const where = and(...filters)
      const [totalRows, values] = await Promise.all([
        db.select({ value: count() }).from(auditLog).where(where),
        db.select({ id: auditLog.id, at: auditLog.createdAt, actorName: users.name, actorUserId: auditLog.actorUserId, action: auditLog.action, recordType: auditLog.entityType, recordId: auditLog.entityId, requestId: auditLog.metadata, summary: auditLog.summary, before: auditLog.before, after: auditLog.after, metadata: auditLog.metadata }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorUserId)).where(where).orderBy(auditOrder(query.sort ?? 'at', query.direction ?? 'desc')).limit(perPage).offset((page - 1) * perPage),
      ])
      const rows: AuditEventRecord[] = values.map((row) => ({ ...row, requestId: typeof row.requestId.requestId === 'string' ? row.requestId.requestId : null }))
      return { rows, total: totalRows[0]?.value ?? 0, page, perPage }
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
function escapedPattern(value: string) { return `%${value.trim().replace(/[\\%_]/g, '\\$&')}%` }
function normalizeOptional(value: string | null | undefined) { const next = value?.trim(); return next ? next : null }
function unique(values: string[]) { return [...new Set(values)] }
function slugify(value: string) { return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'role' }
function validateRole(name: string, key?: string) { if (!name.trim()) throw new Error('A role name is required.'); if (key && !/^[a-z][a-z0-9_-]*$/.test(key)) throw new Error('Role keys must start with a letter and contain lowercase letters, numbers, underscores, or hyphens.') }
async function availableRoleKey(db: Database, tenantId: string, preferred: string) { const base = slugify(preferred); let candidate = base; let suffix = 2; while ((await db.select({ id: roles.id }).from(roles).where(and(eq(roles.tenantId, tenantId), eq(roles.key, candidate))).limit(1)).length) candidate = `${base}-${suffix++}`; return candidate }
function roleOrder(sort: 'name' | 'permissions' | 'members' | 'updated', direction: 'asc' | 'desc') { const order = direction === 'asc' ? asc : desc; if (sort === 'permissions') return order(sql<number>`jsonb_array_length(${roles.permissions})`); if (sort === 'members') return order(count(roleAssignments.id)); if (sort === 'updated') return order(roles.updatedAt); return order(roles.name) }
function memberOrder(sort: 'name' | 'email' | 'status' | 'joined', direction: 'asc' | 'desc') { const order = direction === 'asc' ? asc : desc; if (sort === 'email') return order(users.email); if (sort === 'status') return order(memberships.status); if (sort === 'joined') return order(memberships.joinedAt); return order(memberships.displayName) }
function auditOrder(sort: 'at' | 'actor' | 'action' | 'record', direction: 'asc' | 'desc') { const order = direction === 'asc' ? asc : desc; if (sort === 'actor') return order(users.name); if (sort === 'action') return order(auditLog.action); if (sort === 'record') return order(auditLog.entityType); return order(auditLog.createdAt) }
