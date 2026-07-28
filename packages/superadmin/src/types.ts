/**
 * Instance-operator administration over the platform identity model. This is
 * deliberately NOT tenant IAM (@appkit/iam): it manages the global accounts
 * that can sign in at all — credentials, activation, super-admin standing,
 * and live sessions — across every tenant of the installation.
 */

/** A platform sign-in account, enriched with credential and session presence. */
export type PlatformUserRecord = {
  id: string
  name: string
  email: string
  image: string | null
  emailVerified: boolean
  isActive: boolean
  isSuperAdmin: boolean
  /** Whether a password credential exists for this account. */
  hasCredential: boolean
  /** Sessions that have not yet expired. */
  activeSessionCount: number
  /** The most recent session activity, or null if the user never signed in. */
  lastSeenAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** A live (unexpired) authentication session with its owning account. */
export type PlatformSessionRecord = {
  id: string
  userId: string
  userName: string
  userEmail: string
  createdAt: Date
  expiresAt: Date
  ipAddress: string | null
  userAgent: string | null
  /** True when this is the acting operator's own current session. */
  isCurrentSession: boolean
}

export type UserSort = 'name' | 'email' | 'created'
export type SessionSort = 'created' | 'expires' | 'user'

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

export type UserListResult = ListResult<PlatformUserRecord> & {
  facets: { statusCounts: { active: number; inactive: number }; superAdmins: number }
}

export type SessionListResult = ListResult<PlatformSessionRecord>

export type CreateUserInput = {
  name: string
  email: string
  password: string
  isSuperAdmin?: boolean
  emailVerified?: boolean
}

export type UpdateUserInput = {
  name?: string
  isActive?: boolean
  isSuperAdmin?: boolean
  emailVerified?: boolean
}

// --- Tenants ---------------------------------------------------------------

export type PlatformTenantStatus = 'active' | 'suspended' | 'archived'
export type TenantMemberStatus = 'active' | 'invited' | 'suspended'

/** A tenant (workspace) of the installation, enriched with member presence. */
export type PlatformTenantRecord = {
  id: string
  name: string
  /**
   * Immutable after creation: slugs are the tenant's stable external handle
   * (URLs, provisioning scripts, support conversations), so renaming a tenant
   * changes `name` only. There is deliberately no API to change a slug.
   */
  slug: string
  status: PlatformTenantStatus
  /** Memberships with status 'active'. */
  memberCount: number
  createdAt: Date
  updatedAt: Date
}

/** A user's membership in a tenant, enriched with the account's identity. */
export type TenantMemberRecord = {
  membershipId: string
  tenantId: string
  userId: string
  userName: string
  userEmail: string
  status: TenantMemberStatus
  joinedAt: Date | null
  createdAt: Date
}

export type CreateTenantInput = { name: string; slug: string }

/** Result of a tenant activation change. */
export type TenantStatusResult = {
  tenant: PlatformTenantRecord
  /**
   * True when the operator suspended the tenant they are currently operating
   * in (actor.tenantId) — the caller must surface this, because the operator's
   * own workspace context just went away.
   */
  suspendedCurrentTenant: boolean
}

export type AddTenantMemberInput = {
  /** Email of an existing platform account. Members are accounts; create the account first. */
  email: string
  /** Defaults to the account's name. */
  displayName?: string
}

/** Result of a session-revocation operation. */
export type RevokeSessionsResult = {
  revokedCount: number
  /**
   * True when the operator's own current session was among those revoked —
   * the caller must surface this instead of signing the operator out silently.
   */
  revokedCurrentSession: boolean
}

/**
 * The complete instance-operator administration boundary. Implementations are
 * built from a persistence adapter via createSuperadminService; every mutation
 * runs the shared guard rails (last-super-admin protection, self-revocation
 * flagging) regardless of the storage backend.
 */
export interface SuperadminService {
  listUsers(query?: ListQuery<UserSort> & { status?: 'active' | 'inactive' }): Promise<UserListResult>
  getUser(userId: string): Promise<PlatformUserRecord | null>
  createUser(input: CreateUserInput): Promise<PlatformUserRecord>
  updateUser(userId: string, input: UpdateUserInput): Promise<PlatformUserRecord>
  setPassword(userId: string, password: string): Promise<PlatformUserRecord>
  revokeUserSessions(userId: string): Promise<RevokeSessionsResult>
  listSessions(query?: ListQuery<SessionSort>): Promise<SessionListResult>
  revokeSession(sessionId: string): Promise<RevokeSessionsResult>
  listTenants(): Promise<PlatformTenantRecord[]>
  getTenant(tenantId: string): Promise<PlatformTenantRecord | null>
  createTenant(input: CreateTenantInput): Promise<PlatformTenantRecord>
  /** Suspend or reactivate a tenant. Archival is out of scope for this surface. */
  setTenantStatus(tenantId: string, status: 'active' | 'suspended'): Promise<TenantStatusResult>
  listTenantMembers(tenantId: string): Promise<TenantMemberRecord[]>
  addTenantMember(tenantId: string, input: AddTenantMemberInput): Promise<TenantMemberRecord>
  setTenantMemberStatus(
    tenantId: string,
    membershipId: string,
    status: TenantMemberStatus,
  ): Promise<TenantMemberRecord>
  removeTenantMember(tenantId: string, membershipId: string): Promise<void>
}

/** A session row as stored — the service annotates isCurrentSession. */
export type StoredSessionRecord = Omit<PlatformSessionRecord, 'isCurrentSession'>

export type UserWrite = {
  name: string
  email: string
  emailVerified: boolean
  isActive: boolean
  isSuperAdmin: boolean
}

/**
 * Storage port the service is built over. Adapters implement mechanical reads
 * and writes only; validation and guard rails live in the service so every
 * backend enforces them identically.
 */
export interface SuperadminPersistence {
  listUsers(query: {
    q?: string
    status?: 'active' | 'inactive'
    page: number
    perPage: number
    sort: UserSort
    direction: 'asc' | 'desc'
  }): Promise<{ rows: PlatformUserRecord[]; total: number; statusCounts: { active: number; inactive: number }; superAdmins: number }>
  getUser(userId: string): Promise<PlatformUserRecord | null>
  findUserIdByEmail(email: string): Promise<string | null>
  insertUser(input: UserWrite): Promise<PlatformUserRecord>
  updateUser(userId: string, patch: Partial<UserWrite>): Promise<PlatformUserRecord>
  /** Active super admins other than the given user. */
  countOtherActiveSuperAdmins(excludeUserId: string): Promise<number>
  /** Create or replace the password credential for the user. */
  setCredential(userId: string, passwordHash: string): Promise<void>
  listSessions(query: {
    q?: string
    page: number
    perPage: number
    sort: SessionSort
    direction: 'asc' | 'desc'
  }): Promise<{ rows: StoredSessionRecord[]; total: number }>
  /** Delete every session belonging to the user; returns the deleted session ids. */
  deleteSessionsForUser(userId: string): Promise<string[]>
  /** Delete one session; returns it, or null if it did not exist. */
  deleteSession(sessionId: string): Promise<StoredSessionRecord | null>
  listTenants(): Promise<PlatformTenantRecord[]>
  getTenant(tenantId: string): Promise<PlatformTenantRecord | null>
  findTenantIdBySlug(slug: string): Promise<string | null>
  insertTenant(input: { name: string; slug: string }): Promise<PlatformTenantRecord>
  setTenantStatus(tenantId: string, status: 'active' | 'suspended'): Promise<PlatformTenantRecord>
  listTenantMembers(tenantId: string): Promise<TenantMemberRecord[]>
  getTenantMember(tenantId: string, membershipId: string): Promise<TenantMemberRecord | null>
  findTenantMemberByUser(tenantId: string, userId: string): Promise<TenantMemberRecord | null>
  insertTenantMember(input: {
    tenantId: string
    userId: string
    displayName: string
    invitedBy?: string | null
  }): Promise<TenantMemberRecord>
  setTenantMemberStatus(
    tenantId: string,
    membershipId: string,
    status: TenantMemberStatus,
  ): Promise<TenantMemberRecord>
  /** Returns false when the membership did not exist. */
  deleteTenantMember(tenantId: string, membershipId: string): Promise<boolean>
}

export type SuperadminServiceOptions = {
  persistence: SuperadminPersistence
  /**
   * Password hasher injected by the application so the package does not
   * hard-depend on an auth runtime. Pass better-auth's exported hasher
   * (import { hashPassword } from 'better-auth/crypto') so stored hashes are
   * exactly what sign-in verifies.
   */
  hashPassword: (password: string) => Promise<string>
  /**
   * The acting operator, used for self-revocation flagging. `tenantId` is the
   * tenant the operator is currently operating in, so suspending it can be
   * flagged in the result rather than passing silently.
   */
  actor?: { userId?: string; sessionId?: string; tenantId?: string }
  /** Minimum accepted password length. Default 8, matching the auth runtime. */
  minPasswordLength?: number
}
