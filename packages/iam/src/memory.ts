import type {
  AuditEventRecord,
  CreateRoleInput,
  IamAdminService,
  ListQuery,
  ListResult,
  MemberRecord,
  RoleAssignmentRecord,
  RoleRecord,
  RoleScope,
  UpdateRoleInput,
} from './types'

export type MemoryIamSeed = {
  roles?: RoleRecord[]
  members?: MemberRecord[]
  auditEvents?: AuditEventRecord[]
}

export type MemoryIamOptions = {
  actor?: { userId: string; name: string }
  now?: () => Date
  id?: () => string
}

export class IamConflictError extends Error {
  override readonly name = 'IamConflictError'
}

export class IamNotFoundError extends Error {
  override readonly name = 'IamNotFoundError'
}

export class IamProtectedRecordError extends Error {
  override readonly name = 'IamProtectedRecordError'
}

/**
 * Complete, deterministic adapter for browser-only applications, tests, and
 * local-first products. It exercises the same mutations and protections as a
 * persistent adapter; callers can replace it without changing UI code.
 */
export function createMemoryIamService(
  seed: MemoryIamSeed = {},
  options: MemoryIamOptions = {},
): IamAdminService {
  const now = options.now ?? (() => new Date())
  const nextId = options.id ?? (() => globalThis.crypto.randomUUID())
  const actor = options.actor ?? { userId: 'system', name: 'System' }
  let roleRows = (seed.roles ?? []).map(cloneRole)
  let memberRows = (seed.members ?? []).map(cloneMember)
  let auditRows = (seed.auditEvents ?? []).map(cloneAudit)

  function roleOrThrow(roleId: string): RoleRecord {
    const role = roleRows.find((row) => row.id === roleId)
    if (!role) throw new IamNotFoundError(`Role not found: ${roleId}`)
    return role
  }

  function memberOrThrow(membershipId: string): MemberRecord {
    const member = memberRows.find((row) => row.id === membershipId)
    if (!member) throw new IamNotFoundError(`Member not found: ${membershipId}`)
    return member
  }

  function audit(input: {
    action: string
    recordType: string
    recordId?: string | null
    summary: string
    before?: unknown
    after?: unknown
    metadata?: Record<string, unknown>
  }) {
    auditRows.unshift({
      id: nextId(),
      at: now(),
      actorName: actor.name,
      actorUserId: actor.userId,
      action: input.action,
      recordType: input.recordType,
      recordId: input.recordId ?? null,
      requestId: null,
      summary: input.summary,
      before: structuredClone(input.before ?? null),
      after: structuredClone(input.after ?? null),
      metadata: structuredClone(input.metadata ?? {}),
    })
  }

  function refreshCounts() {
    const counts = new Map<string, number>()
    for (const member of memberRows) {
      for (const assignment of member.assignments) {
        counts.set(assignment.roleId, (counts.get(assignment.roleId) ?? 0) + 1)
      }
    }
    roleRows = roleRows.map((role) => ({ ...role, memberCount: counts.get(role.id) ?? 0 }))
  }

  return {
    async listRoles(query = {}) {
      const q = query.q?.trim().toLocaleLowerCase()
      let values = roleRows.filter((role) =>
        !q || `${role.name} ${role.key} ${role.description ?? ''}`.toLocaleLowerCase().includes(q),
      )
      values = sortRoles(values, query.sort ?? 'name', query.direction ?? 'asc')
      return paginate(values.map(cloneRole), query)
    },

    async getRole(roleId) {
      const row = roleRows.find((role) => role.id === roleId)
      return row ? cloneRole(row) : null
    },

    async createRole(input) {
      validateRoleInput(input)
      const key = uniqueRoleKey(input.key ?? slugify(input.name), roleRows)
      const timestamp = now()
      const role: RoleRecord = {
        id: nextId(),
        key,
        name: input.name.trim(),
        description: normalizeOptional(input.description),
        isBuiltIn: false,
        permissions: unique(input.permissions),
        memberCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      roleRows.push(role)
      audit({ action: 'insert', recordType: 'role', recordId: role.id, summary: `Created role ${role.name}`, after: role })
      return cloneRole(role)
    },

    async updateRole(roleId, input) {
      validateRoleInput(input)
      const role = roleOrThrow(roleId)
      const before = cloneRole(role)
      const requestedKey = input.key?.trim()
      if (requestedKey && requestedKey !== role.key) {
        if (role.isBuiltIn) throw new IamProtectedRecordError('Built-in role keys cannot be changed.')
        if (roleRows.some((row) => row.id !== role.id && row.key === requestedKey)) {
          throw new IamConflictError(`Role key already exists: ${requestedKey}`)
        }
        role.key = requestedKey
      }
      role.name = input.name.trim()
      role.description = normalizeOptional(input.description)
      role.permissions = unique(input.permissions)
      role.updatedAt = now()
      audit({ action: 'update', recordType: 'role', recordId: role.id, summary: `Updated role ${role.name}`, before, after: role })
      return cloneRole(role)
    },

    async duplicateRole(roleId, name) {
      const source = roleOrThrow(roleId)
      return this.createRole({
        name: name?.trim() || `${source.name} copy`,
        description: source.description,
        permissions: source.permissions,
      })
    },

    async deleteRole(roleId) {
      const role = roleOrThrow(roleId)
      if (role.isBuiltIn) throw new IamProtectedRecordError('Built-in roles cannot be deleted.')
      if (role.memberCount > 0) throw new IamConflictError('Remove every member assignment before deleting this role.')
      roleRows = roleRows.filter((row) => row.id !== roleId)
      audit({ action: 'delete', recordType: 'role', recordId: role.id, summary: `Deleted role ${role.name}`, before: role })
    },

    async listMembers(query = {}) {
      const q = query.q?.trim().toLocaleLowerCase()
      let values = memberRows.filter((member) => {
        if (q && !`${member.name} ${member.email}`.toLocaleLowerCase().includes(q)) return false
        if (query.status && member.status !== query.status) return false
        return !query.roleId || member.assignments.some((assignment) => assignment.roleId === query.roleId)
      })
      values = sortMembers(values, query.sort ?? 'name', query.direction ?? 'asc')
      return paginate(values.map(cloneMember), query)
    },

    async getMember(membershipId) {
      const row = memberRows.find((member) => member.id === membershipId)
      return row ? cloneMember(row) : null
    },

    async inviteMember(input) {
      const email = input.email.trim().toLocaleLowerCase()
      if (!email || !email.includes('@')) throw new Error('A valid email address is required.')
      if (!input.name.trim()) throw new Error('A member name is required.')
      if (memberRows.some((member) => member.email.toLocaleLowerCase() === email)) {
        throw new IamConflictError(`A member already exists for ${email}.`)
      }
      const timestamp = now()
      const membershipId = nextId()
      const assignments = input.assignments.map((assignment) => assignmentFor(
        nextId(),
        roleOrThrow(assignment.roleId),
        assignment.scope,
      ))
      const member: MemberRecord = {
        id: membershipId,
        userId: nextId(),
        name: input.name.trim(),
        email,
        image: null,
        status: 'invited',
        isSuperAdmin: false,
        isCurrentUser: false,
        localeOverride: input.localeOverride ?? null,
        joinedAt: null,
        invitedAt: timestamp,
        createdAt: timestamp,
        assignments,
        overrides: [],
      }
      memberRows.push(member)
      refreshCounts()
      audit({ action: 'insert', recordType: 'membership', recordId: member.id, summary: `Invited ${member.email}`, after: member })
      return cloneMember(member)
    },

    async updateMember(membershipId, input) {
      const member = memberOrThrow(membershipId)
      if (member.isCurrentUser && input.status && input.status !== 'active') {
        throw new IamProtectedRecordError('You cannot suspend your own membership.')
      }
      if (member.isSuperAdmin && input.status && input.status !== 'active') {
        throw new IamProtectedRecordError('A protected super-admin cannot be suspended.')
      }
      const before = cloneMember(member)
      if (input.name !== undefined) {
        if (!input.name.trim()) throw new Error('A member name is required.')
        member.name = input.name.trim()
      }
      if (input.status !== undefined) member.status = input.status
      if (input.localeOverride !== undefined) member.localeOverride = input.localeOverride
      if (member.status === 'active' && member.joinedAt === null) member.joinedAt = now()
      audit({ action: 'update', recordType: 'membership', recordId: member.id, summary: `Updated ${member.email}`, before, after: member })
      return cloneMember(member)
    },

    async removeMember(membershipId) {
      const member = memberOrThrow(membershipId)
      if (member.isCurrentUser) throw new IamProtectedRecordError('You cannot remove your own membership.')
      if (member.isSuperAdmin) throw new IamProtectedRecordError('A protected super-admin cannot be removed.')
      memberRows = memberRows.filter((row) => row.id !== membershipId)
      refreshCounts()
      audit({ action: 'delete', recordType: 'membership', recordId: member.id, summary: `Removed ${member.email}`, before: member })
    },

    async assignRole(membershipId, roleId, scope) {
      const member = memberOrThrow(membershipId)
      const role = roleOrThrow(roleId)
      const existing = member.assignments.find((assignment) => assignment.roleId === roleId)
      if (existing) {
        const before = structuredClone(existing)
        existing.scope = cloneScope(scope)
        audit({ action: 'update', recordType: 'role_assignment', recordId: existing.id, summary: `Updated ${member.name}'s ${role.name} scope`, before, after: existing })
        return structuredClone(existing)
      }
      const assignment = assignmentFor(nextId(), role, scope)
      member.assignments.push(assignment)
      refreshCounts()
      audit({ action: 'insert', recordType: 'role_assignment', recordId: assignment.id, summary: `Assigned ${role.name} to ${member.name}`, after: assignment })
      return structuredClone(assignment)
    },

    async updateAssignmentScope(assignmentId, scope) {
      const owner = memberRows.find((member) => member.assignments.some((assignment) => assignment.id === assignmentId))
      const assignment = owner?.assignments.find((row) => row.id === assignmentId)
      if (!owner || !assignment) throw new IamNotFoundError(`Role assignment not found: ${assignmentId}`)
      const before = structuredClone(assignment)
      assignment.scope = cloneScope(scope)
      audit({ action: 'update', recordType: 'role_assignment', recordId: assignment.id, summary: `Updated ${owner.name}'s ${assignment.roleName} scope`, before, after: assignment })
      return structuredClone(assignment)
    },

    async removeAssignment(assignmentId) {
      const owner = memberRows.find((member) => member.assignments.some((assignment) => assignment.id === assignmentId))
      const assignment = owner?.assignments.find((row) => row.id === assignmentId)
      if (!owner || !assignment) throw new IamNotFoundError(`Role assignment not found: ${assignmentId}`)
      if ((owner.isCurrentUser || owner.isSuperAdmin) && owner.assignments.length === 1) {
        throw new IamProtectedRecordError('The final role cannot be removed from a protected member.')
      }
      owner.assignments = owner.assignments.filter((row) => row.id !== assignmentId)
      refreshCounts()
      audit({ action: 'delete', recordType: 'role_assignment', recordId: assignment.id, summary: `Removed ${assignment.roleName} from ${owner.name}`, before: assignment })
    },

    async setPermissionOverride(membershipId, override) {
      const member = memberOrThrow(membershipId)
      const before = member.overrides.find((row) => row.permission === override.permission) ?? null
      member.overrides = member.overrides.filter((row) => row.permission !== override.permission)
      member.overrides.push(structuredClone(override))
      audit({ action: before ? 'update' : 'insert', recordType: 'permission_override', recordId: membershipId, summary: `${override.effect === 'grant' ? 'Granted' : 'Denied'} ${override.permission} for ${member.name}`, before, after: override })
    },

    async removePermissionOverride(membershipId, permission) {
      const member = memberOrThrow(membershipId)
      const existing = member.overrides.find((row) => row.permission === permission)
      if (!existing) return
      member.overrides = member.overrides.filter((row) => row.permission !== permission)
      audit({ action: 'delete', recordType: 'permission_override', recordId: membershipId, summary: `Removed ${permission} override from ${member.name}`, before: existing })
    },

    async listAuditEvents(query = {}) {
      const q = query.q?.trim().toLocaleLowerCase()
      let values = auditRows.filter((event) => {
        if (query.action && event.action !== query.action) return false
        if (query.recordType && event.recordType !== query.recordType) return false
        return !q || `${event.actorName ?? ''} ${event.action} ${event.recordType} ${event.summary ?? ''}`.toLocaleLowerCase().includes(q)
      })
      values = sortAudit(values, query.sort ?? 'at', query.direction ?? 'desc')
      return paginate(values.map(cloneAudit), query)
    },

    async getAuditEvent(eventId) {
      const row = auditRows.find((event) => event.id === eventId)
      return row ? cloneAudit(row) : null
    },
  }
}

function assignmentFor(id: string, role: RoleRecord, scope: RoleScope): RoleAssignmentRecord {
  return { id, roleId: role.id, roleKey: role.key, roleName: role.name, scope: cloneScope(scope) }
}

function validateRoleInput(input: CreateRoleInput | UpdateRoleInput) {
  if (!input.name.trim()) throw new Error('A role name is required.')
  if (input.key !== undefined && !/^[a-z][a-z0-9_-]*$/.test(input.key)) {
    throw new Error('Role keys must start with a letter and contain lowercase letters, numbers, underscores, or hyphens.')
  }
}

function uniqueRoleKey(preferred: string, roles: RoleRecord[]): string {
  const base = slugify(preferred) || 'role'
  let candidate = base
  let suffix = 2
  while (roles.some((role) => role.key === candidate)) candidate = `${base}-${suffix++}`
  return candidate
}

function slugify(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function cloneScope(scope: RoleScope): RoleScope {
  return structuredClone(scope)
}

function cloneRole(role: RoleRecord): RoleRecord {
  return { ...role, permissions: [...role.permissions], createdAt: new Date(role.createdAt), updatedAt: new Date(role.updatedAt) }
}

function cloneMember(member: MemberRecord): MemberRecord {
  return {
    ...member,
    joinedAt: member.joinedAt ? new Date(member.joinedAt) : null,
    invitedAt: member.invitedAt ? new Date(member.invitedAt) : null,
    createdAt: new Date(member.createdAt),
    assignments: member.assignments.map((assignment) => structuredClone(assignment)),
    overrides: member.overrides.map((override) => structuredClone(override)),
  }
}

function cloneAudit(event: AuditEventRecord): AuditEventRecord {
  return { ...event, at: new Date(event.at), before: structuredClone(event.before), after: structuredClone(event.after), metadata: structuredClone(event.metadata) }
}

function paginate<T>(values: T[], query: ListQuery<string>): ListResult<T> {
  const perPage = Math.max(1, Math.min(100, query.perPage ?? 25))
  const page = Math.max(1, query.page ?? 1)
  const start = (page - 1) * perPage
  return { rows: values.slice(start, start + perPage), total: values.length, page, perPage }
}

function compare(a: string | number, b: string | number): number {
  return typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b)
}

function directed(value: number, direction: 'asc' | 'desc'): number {
  return direction === 'asc' ? value : -value
}

function sortRoles(values: RoleRecord[], sort: 'name' | 'permissions' | 'members' | 'updated', direction: 'asc' | 'desc') {
  return [...values].sort((a, b) => directed(compare(
    sort === 'permissions' ? a.permissions.length : sort === 'members' ? a.memberCount : sort === 'updated' ? a.updatedAt.getTime() : a.name,
    sort === 'permissions' ? b.permissions.length : sort === 'members' ? b.memberCount : sort === 'updated' ? b.updatedAt.getTime() : b.name,
  ), direction))
}

function sortMembers(values: MemberRecord[], sort: 'name' | 'email' | 'status' | 'joined', direction: 'asc' | 'desc') {
  return [...values].sort((a, b) => directed(compare(
    sort === 'email' ? a.email : sort === 'status' ? a.status : sort === 'joined' ? (a.joinedAt?.getTime() ?? 0) : a.name,
    sort === 'email' ? b.email : sort === 'status' ? b.status : sort === 'joined' ? (b.joinedAt?.getTime() ?? 0) : b.name,
  ), direction))
}

function sortAudit(values: AuditEventRecord[], sort: 'at' | 'actor' | 'action' | 'record', direction: 'asc' | 'desc') {
  return [...values].sort((a, b) => directed(compare(
    sort === 'actor' ? (a.actorName ?? '') : sort === 'action' ? a.action : sort === 'record' ? a.recordType : a.at.getTime(),
    sort === 'actor' ? (b.actorName ?? '') : sort === 'action' ? b.action : sort === 'record' ? b.recordType : b.at.getTime(),
  ), direction))
}
