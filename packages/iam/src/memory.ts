import type {
  AuditEventRecord,
  BulkRoleAssignmentInput,
  CreateRoleInput,
  IamAdminService,
  ListQuery,
  ListResult,
  MemberRecord,
  RoleAssignmentRecord,
  RoleRecord,
  RoleCapabilities,
  RoleScope,
  MemberCapabilities,
  UpdateRoleInput,
} from './types'

export type MemoryIamSeed = {
  roles?: RoleRecord[]
  members?: MemberRecord[]
  auditEvents?: AuditEventRecord[]
}

export type MemoryIamOptions = {
  actor?: { userId: string; name: string; isSuperAdmin?: boolean }
  now?: () => Date
  id?: () => string
  /** Application policy for immutable root roles and other protected records. */
  roleCapabilities?: (role: RoleRecord) => RoleCapabilities
  /** Application policy layered over the source-compatible self/super-admin guard. */
  memberCapabilities?: (member: MemberRecord) => MemberCapabilities
  /** Reject role and override keys outside the application's catalogue. */
  permissionCatalogue?: readonly string[]
  /** Deliver or enqueue both initial and rotated invitations. */
  afterInvitePersisted?: (member: MemberRecord, reason: 'initial' | 'resend') => Promise<void>
  maxBulkMembers?: number
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

  function capabilitiesForRole(role: RoleRecord): RoleCapabilities {
    return options.roleCapabilities?.(cloneRole(role)) ?? role.capabilities ?? defaultRoleCapabilities(role)
  }

  function capabilitiesForMember(member: MemberRecord): MemberCapabilities {
    return options.memberCapabilities?.(cloneMember(member)) ?? defaultMemberCapabilities(member, actor.isSuperAdmin === true)
  }

  function exposedRole(role: RoleRecord): RoleRecord {
    return { ...cloneRole(role), capabilities: capabilitiesForRole(role) }
  }

  function exposedMember(member: MemberRecord): MemberRecord {
    return { ...cloneMember(member), capabilities: capabilitiesForMember(member) }
  }

  function assertPermissions(values: readonly string[]): void {
    if (!options.permissionCatalogue) return
    const allowed = new Set(options.permissionCatalogue)
    const unknown = values.find((permission) => !allowed.has(permission))
    if (unknown) throw new Error(`Unknown permission: ${unknown}`)
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
      const matching = roleRows.filter((role) =>
        !q || `${role.name} ${role.key} ${role.description ?? ''}`.toLocaleLowerCase().includes(q),
      )
      let values = query.type ? matching.filter((role) => role.isBuiltIn === (query.type === 'built_in')) : matching
      values = sortRoles(values, query.sort ?? 'name', query.direction ?? 'asc')
      return {
        ...paginate(values.map(exposedRole), query),
        facets: { typeCounts: { built_in: matching.filter((role) => role.isBuiltIn).length, custom: matching.filter((role) => !role.isBuiltIn).length } },
      }
    },

    async getRole(roleId) {
      const row = roleRows.find((role) => role.id === roleId)
      return row ? exposedRole(row) : null
    },

    async createRole(input) {
      validateRoleInput(input)
      assertPermissions(input.permissions)
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
      return exposedRole(role)
    },

    async updateRole(roleId, input) {
      validateRoleInput(input)
      assertPermissions(input.permissions)
      const role = roleOrThrow(roleId)
      const before = cloneRole(role)
      const capabilities = capabilitiesForRole(role)
      const requestedKey = input.key?.trim()
      if (requestedKey && requestedKey !== role.key) {
        if (!capabilities.updateKey) throw new IamProtectedRecordError(capabilities.reason ?? 'This role key cannot be changed.')
        if (roleRows.some((row) => row.id !== role.id && row.key === requestedKey)) {
          throw new IamConflictError(`Role key already exists: ${requestedKey}`)
        }
        role.key = requestedKey
      }
      if (!capabilities.updateDetails && (
        input.name.trim() !== role.name || normalizeOptional(input.description) !== role.description
      )) throw new IamProtectedRecordError(capabilities.reason ?? 'This role\'s details cannot be changed.')
      if (!capabilities.updatePermissions && !sameStrings(input.permissions, role.permissions)) {
        throw new IamProtectedRecordError(capabilities.reason ?? 'This role\'s permissions cannot be changed.')
      }
      role.name = input.name.trim()
      role.description = normalizeOptional(input.description)
      role.permissions = unique(input.permissions)
      role.updatedAt = now()
      audit({ action: 'update', recordType: 'role', recordId: role.id, summary: `Updated role ${role.name}`, before, after: role })
      return exposedRole(role)
    },

    async duplicateRole(roleId, name) {
      const source = roleOrThrow(roleId)
      const capabilities = capabilitiesForRole(source)
      if (!capabilities.duplicate) throw new IamProtectedRecordError(capabilities.reason ?? 'This role cannot be duplicated.')
      return this.createRole({
        name: name?.trim() || `${source.name} copy`,
        description: source.description,
        permissions: source.permissions,
      })
    },

    async deleteRole(roleId) {
      const role = roleOrThrow(roleId)
      const capabilities = capabilitiesForRole(role)
      if (!capabilities.delete) throw new IamProtectedRecordError(capabilities.reason ?? 'This role cannot be deleted.')
      if (role.memberCount > 0) throw new IamConflictError('Remove every member assignment before deleting this role.')
      roleRows = roleRows.filter((row) => row.id !== roleId)
      audit({ action: 'delete', recordType: 'role', recordId: role.id, summary: `Deleted role ${role.name}`, before: role })
    },

    async bulkUpdateRoleAssignments(input) {
      validateBulkInput(input, options.maxBulkMembers ?? 250)
      const role = roleOrThrow(input.roleId)
      const changedIds: string[] = []
      const skippedIds: string[] = []
      for (const membershipId of unique(input.membershipIds)) {
        const member = memberRows.find((candidate) => candidate.id === membershipId)
        if (!member || !capabilitiesForMember(member).manageRoles) {
          skippedIds.push(membershipId)
          continue
        }
        const before = member.assignments.map((assignment) => structuredClone(assignment))
        const existing = member.assignments.find((assignment) => assignment.roleId === role.id)
        if (input.operation === 'replace') {
          member.assignments = [existing
            ? { ...existing, scope: cloneScope(input.scope) }
            : assignmentFor(nextId(), role, input.scope)]
        } else if (input.operation === 'remove') {
          member.assignments = member.assignments.filter((assignment) => assignment.roleId !== role.id)
        } else if (existing) {
          existing.scope = cloneScope(input.scope)
        } else {
          member.assignments.push(assignmentFor(nextId(), role, input.scope))
        }
        if (JSON.stringify(before) === JSON.stringify(member.assignments)) continue
        changedIds.push(member.id)
        audit({
          action: 'update',
          recordType: 'membership',
          recordId: member.id,
          summary: `${bulkVerb(input.operation)} role ${role.name}`,
          before: { assignments: before },
          after: { assignments: member.assignments },
          metadata: { roleId: role.id, operation: input.operation, scope: input.scope },
        })
      }
      refreshCounts()
      return { operation: input.operation, roleId: role.id, changedIds, skippedIds }
    },

    async listMembers(query = {}) {
      const q = query.q?.trim().toLocaleLowerCase()
      const matching = memberRows.filter((member) => {
        if (q && !`${member.name} ${member.email}`.toLocaleLowerCase().includes(q)) return false
        return !query.roleId || member.assignments.some((assignment) => assignment.roleId === query.roleId)
      })
      let values = query.status ? matching.filter((member) => member.status === query.status) : matching
      values = sortMembers(values, query.sort ?? 'name', query.direction ?? 'asc')
      return {
        ...paginate(values.map(exposedMember), query),
        facets: {
          statusCounts: {
            active: matching.filter((member) => member.status === 'active').length,
            invited: matching.filter((member) => member.status === 'invited').length,
            suspended: matching.filter((member) => member.status === 'suspended').length,
          },
        },
      }
    },

    async getMember(membershipId) {
      const row = memberRows.find((member) => member.id === membershipId)
      return row ? exposedMember(row) : null
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
        validatedScope(assignment.scope),
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
      const exposed = exposedMember(member)
      await options.afterInvitePersisted?.(exposed, 'initial')
      return exposed
    },

    async resendInvite(membershipId) {
      const member = memberOrThrow(membershipId)
      const capabilities = capabilitiesForMember(member)
      if (!capabilities.resendInvite || member.status !== 'invited') {
        throw new IamProtectedRecordError(capabilities.reason ?? 'Only pending invitations can be resent.')
      }
      const before = member.invitedAt
      const candidate = now()
      member.invitedAt = new Date(Math.max(candidate.getTime(), (before?.getTime() ?? 0) + 1))
      audit({
        action: 'invite',
        recordType: 'membership',
        recordId: member.id,
        summary: `Resent invite to ${member.email}`,
        before: { invitedAt: before },
        after: { invitedAt: member.invitedAt },
      })
      const exposed = exposedMember(member)
      await options.afterInvitePersisted?.(exposed, 'resend')
      return exposed
    },

    async updateMember(membershipId, input) {
      const member = memberOrThrow(membershipId)
      const capabilities = capabilitiesForMember(member)
      assertStatusTransition(member.status, input.status)
      if ((input.name !== undefined || input.localeOverride !== undefined) && !capabilities.updateProfile) {
        throw new IamProtectedRecordError(capabilities.reason ?? 'This member profile cannot be changed.')
      }
      if (input.status !== undefined && input.status !== member.status && !capabilities.changeStatus) {
        throw new IamProtectedRecordError(capabilities.reason ?? 'This membership status cannot be changed.')
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
      return exposedMember(member)
    },

    async removeMember(membershipId) {
      const member = memberOrThrow(membershipId)
      const capabilities = capabilitiesForMember(member)
      if (!capabilities.remove) throw new IamProtectedRecordError(capabilities.reason ?? 'This member cannot be removed.')
      memberRows = memberRows.filter((row) => row.id !== membershipId)
      refreshCounts()
      audit({ action: 'delete', recordType: 'membership', recordId: member.id, summary: `Removed ${member.email}`, before: member })
    },

    async assignRole(membershipId, roleId, scope) {
      const member = memberOrThrow(membershipId)
      const capabilities = capabilitiesForMember(member)
      if (!capabilities.manageRoles) throw new IamProtectedRecordError(capabilities.reason ?? 'This member\'s roles cannot be changed.')
      const role = roleOrThrow(roleId)
      scope = validatedScope(scope)
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
      const capabilities = capabilitiesForMember(owner)
      if (!capabilities.manageRoles) throw new IamProtectedRecordError(capabilities.reason ?? 'This member\'s roles cannot be changed.')
      scope = validatedScope(scope)
      const before = structuredClone(assignment)
      assignment.scope = cloneScope(scope)
      audit({ action: 'update', recordType: 'role_assignment', recordId: assignment.id, summary: `Updated ${owner.name}'s ${assignment.roleName} scope`, before, after: assignment })
      return structuredClone(assignment)
    },

    async removeAssignment(assignmentId) {
      const owner = memberRows.find((member) => member.assignments.some((assignment) => assignment.id === assignmentId))
      const assignment = owner?.assignments.find((row) => row.id === assignmentId)
      if (!owner || !assignment) throw new IamNotFoundError(`Role assignment not found: ${assignmentId}`)
      const capabilities = capabilitiesForMember(owner)
      if (!capabilities.manageRoles) throw new IamProtectedRecordError(capabilities.reason ?? 'This member\'s roles cannot be changed.')
      owner.assignments = owner.assignments.filter((row) => row.id !== assignmentId)
      refreshCounts()
      audit({ action: 'delete', recordType: 'role_assignment', recordId: assignment.id, summary: `Removed ${assignment.roleName} from ${owner.name}`, before: assignment })
    },

    async setPermissionOverride(membershipId, override) {
      const member = memberOrThrow(membershipId)
      const capabilities = capabilitiesForMember(member)
      if (!capabilities.manageOverrides) throw new IamProtectedRecordError(capabilities.reason ?? 'This member\'s permission overrides cannot be changed.')
      assertPermissions([override.permission])
      if (override.effect !== 'grant' && override.effect !== 'deny') throw new Error('Permission override effect must be grant or deny.')
      const before = member.overrides.find((row) => row.permission === override.permission) ?? null
      member.overrides = member.overrides.filter((row) => row.permission !== override.permission)
      member.overrides.push(structuredClone(override))
      audit({ action: before ? 'update' : 'insert', recordType: 'permission_override', recordId: membershipId, summary: `${override.effect === 'grant' ? 'Granted' : 'Denied'} ${override.permission} for ${member.name}`, before, after: override })
    },

    async removePermissionOverride(membershipId, permission) {
      const member = memberOrThrow(membershipId)
      const capabilities = capabilitiesForMember(member)
      if (!capabilities.manageOverrides) throw new IamProtectedRecordError(capabilities.reason ?? 'This member\'s permission overrides cannot be changed.')
      const existing = member.overrides.find((row) => row.permission === permission)
      if (!existing) return
      member.overrides = member.overrides.filter((row) => row.permission !== permission)
      audit({ action: 'delete', recordType: 'permission_override', recordId: membershipId, summary: `Removed ${permission} override from ${member.name}`, before: existing })
    },

    async listAuditEvents(query = {}) {
      const q = query.q?.trim().toLocaleLowerCase()
      const matching = auditRows.filter((event) => {
        if (query.recordId && event.recordId !== query.recordId) return false
        return !q || `${event.actorName ?? ''} ${event.action} ${event.recordType} ${event.summary ?? ''}`.toLocaleLowerCase().includes(q)
      })
      let values = matching.filter((event) => {
        if (query.action && event.action !== query.action) return false
        return !query.recordType || event.recordType === query.recordType
      })
      values = sortAudit(values, query.sort ?? 'at', query.direction ?? 'desc')
      return {
        ...paginate(values.map(cloneAudit), query),
        facets: {
          actions: [...new Set(matching.map((event) => event.action))].sort(),
          recordTypes: [...new Set(matching.map((event) => event.recordType))].sort(),
        },
      }
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

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index])
}

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

function assertStatusTransition(current: MemberRecord['status'], requested: MemberRecord['status'] | undefined): void {
  if (!requested || requested === current) return
  const allowed = (current === 'active' && requested === 'suspended')
    || (current === 'suspended' && requested === 'active')
  if (!allowed) throw new IamConflictError('Pending invitations activate only when the member accepts the invitation.')
}

function validateBulkInput(input: BulkRoleAssignmentInput, maxMembers: number): void {
  if (input.operation !== 'add' && input.operation !== 'replace' && input.operation !== 'remove') {
    throw new Error('Bulk role operation must be add, replace, or remove.')
  }
  if (!input.roleId.trim()) throw new Error('A role is required.')
  const membershipIds = unique(input.membershipIds.filter((value) => typeof value === 'string' && value.trim()))
  if (membershipIds.length === 0) throw new Error('Select at least one member.')
  if (membershipIds.length > maxMembers) throw new Error(`Select ${maxMembers} or fewer members at a time.`)
  validatedScope(input.scope)
}

function validatedScope(value: RoleScope): RoleScope {
  if (!value || typeof value !== 'object') throw new Error('A valid role scope is required.')
  if (value.type === 'tenant' || value.type === 'self') return { type: value.type }
  if (value.type === 'sites') return { type: 'sites', siteIds: stringArray(value.siteIds, 'siteIds') }
  if (value.type === 'people') return { type: 'people', personIds: stringArray(value.personIds, 'personIds') }
  if (value.type === 'crews') return { type: 'crews', crewIds: stringArray(value.crewIds, 'crewIds') }
  if (value.type === 'team') {
    return {
      type: 'team',
      departmentIds: stringArray(value.departmentIds, 'departmentIds'),
      groupIds: stringArray(value.groupIds, 'groupIds'),
    }
  }
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
