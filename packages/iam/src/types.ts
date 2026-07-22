/** A hierarchical permission definition supplied by the consuming application. */
export type PermissionDefinition = {
  key: string
  label: string
  description?: string
}

export type PermissionGroup = {
  key: string
  label: string
  description?: string
  permissions: PermissionDefinition[]
}

export type RoleScope =
  | { type: 'tenant' }
  | { type: 'self' }
  | { type: 'sites'; siteIds: string[] }
  | { type: 'team'; departmentIds: string[]; groupIds: string[] }
  | { type: 'people'; personIds: string[] }
  | { type: 'crews'; crewIds: string[] }

export type RoleRecord = {
  id: string
  key: string
  name: string
  description: string | null
  isBuiltIn: boolean
  permissions: string[]
  memberCount: number
  createdAt: Date
  updatedAt: Date
  /** Actor-aware mutation policy. Adapters enforce this as well as the UI. */
  capabilities?: RoleCapabilities
}

export type RoleCapabilities = {
  updateKey: boolean
  updateDetails: boolean
  updatePermissions: boolean
  duplicate: boolean
  delete: boolean
  reason?: string
}

export type PermissionOverride = {
  permission: string
  effect: 'grant' | 'deny'
}

export type RoleAssignmentRecord = {
  id: string
  roleId: string
  roleKey: string
  roleName: string
  scope: RoleScope
}

export type MembershipStatus = 'active' | 'invited' | 'suspended'

export type MemberRecord = {
  id: string
  userId: string
  name: string
  email: string
  image: string | null
  status: MembershipStatus
  isSuperAdmin: boolean
  isCurrentUser: boolean
  localeOverride: string | null
  joinedAt: Date | null
  invitedAt: Date | null
  createdAt: Date
  assignments: RoleAssignmentRecord[]
  overrides: PermissionOverride[]
  /** Actor-aware mutation policy. Adapters enforce this as well as the UI. */
  capabilities?: MemberCapabilities
}

export type MemberCapabilities = {
  updateProfile: boolean
  changeStatus: boolean
  remove: boolean
  manageRoles: boolean
  manageOverrides: boolean
  resendInvite: boolean
  reason?: string
}

export type AuditEventRecord = {
  id: string
  at: Date
  actorName: string | null
  actorUserId: string | null
  action: string
  recordType: string
  recordId: string | null
  requestId: string | null
  summary: string | null
  before: unknown
  after: unknown
  metadata: Record<string, unknown>
}

export type ListQuery<TSort extends string> = {
  q?: string
  page?: number
  perPage?: number
  sort?: TSort
  direction?: 'asc' | 'desc'
}

export type ListResult<T> = {
  rows: T[]
  total: number
  page: number
  perPage: number
}

export type MemberListResult = ListResult<MemberRecord> & {
  facets: { statusCounts: Record<MembershipStatus, number> }
}

export type RoleListResult = ListResult<RoleRecord> & {
  facets: { typeCounts: { built_in: number; custom: number } }
}

export type AuditListResult = ListResult<AuditEventRecord> & {
  facets: { actions: string[]; recordTypes: string[] }
}

export type CreateRoleInput = {
  key?: string
  name: string
  description?: string | null
  permissions: string[]
}

export type UpdateRoleInput = Omit<CreateRoleInput, 'key'> & { key?: string }

export type InviteMemberInput = {
  email: string
  name: string
  localeOverride?: string | null
  assignments: Array<{ roleId: string; scope: RoleScope }>
}

export type BulkRoleAssignmentOperation = 'add' | 'replace' | 'remove'

export type BulkRoleAssignmentInput = {
  operation: BulkRoleAssignmentOperation
  roleId: string
  membershipIds: string[]
  scope: RoleScope
}

export type BulkRoleAssignmentResult = {
  operation: BulkRoleAssignmentOperation
  roleId: string
  changedIds: string[]
  skippedIds: string[]
}

/**
 * Complete IAM administration boundary. Database, HTTP, RPC, and in-memory
 * implementations all satisfy the same tenant-bound contract.
 */
export interface IamAdminService {
  listRoles(query?: ListQuery<'name' | 'permissions' | 'members' | 'updated'> & { type?: 'built_in' | 'custom' }): Promise<RoleListResult>
  getRole(roleId: string): Promise<RoleRecord | null>
  createRole(input: CreateRoleInput): Promise<RoleRecord>
  updateRole(roleId: string, input: UpdateRoleInput): Promise<RoleRecord>
  duplicateRole(roleId: string, name?: string): Promise<RoleRecord>
  deleteRole(roleId: string): Promise<void>
  bulkUpdateRoleAssignments(input: BulkRoleAssignmentInput): Promise<BulkRoleAssignmentResult>

  listMembers(query?: ListQuery<'name' | 'email' | 'status' | 'joined'> & { roleId?: string; status?: MembershipStatus }): Promise<MemberListResult>
  getMember(membershipId: string): Promise<MemberRecord | null>
  inviteMember(input: InviteMemberInput): Promise<MemberRecord>
  resendInvite(membershipId: string): Promise<MemberRecord>
  updateMember(membershipId: string, input: { name?: string; status?: MembershipStatus; localeOverride?: string | null }): Promise<MemberRecord>
  removeMember(membershipId: string): Promise<void>

  assignRole(membershipId: string, roleId: string, scope: RoleScope): Promise<RoleAssignmentRecord>
  updateAssignmentScope(assignmentId: string, scope: RoleScope): Promise<RoleAssignmentRecord>
  removeAssignment(assignmentId: string): Promise<void>
  setPermissionOverride(membershipId: string, override: PermissionOverride): Promise<void>
  removePermissionOverride(membershipId: string, permission: string): Promise<void>

  listAuditEvents(query?: ListQuery<'at' | 'actor' | 'action' | 'record'> & { action?: string; recordType?: string; recordId?: string }): Promise<AuditListResult>
  getAuditEvent(eventId: string): Promise<AuditEventRecord | null>
}

export type ScopeOption = { value: string; label: string; hint?: string }

export type ScopeOptions = {
  sites?: ScopeOption[]
  departments?: ScopeOption[]
  groups?: ScopeOption[]
  people?: ScopeOption[]
  crews?: ScopeOption[]
}
