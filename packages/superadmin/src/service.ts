import type {
  AddTenantMemberInput,
  CreateTenantInput,
  CreateUserInput,
  PlatformTenantRecord,
  PlatformUserRecord,
  SuperadminService,
  SuperadminServiceOptions,
  TenantMemberRecord,
  UpdateUserInput,
} from './types'

/** A mutation was refused because it would break the platform's operability. */
export class SuperadminGuardError extends Error {
  override name = 'SuperadminGuardError'
}

/** The requested record does not exist. */
export class SuperadminNotFoundError extends Error {
  override name = 'SuperadminNotFoundError'
}

/** The mutation conflicts with an existing record. */
export class SuperadminConflictError extends Error {
  override name = 'SuperadminConflictError'
}

const LAST_SUPER_ADMIN_MESSAGE =
  'This is the last active super admin. Grant another account super-admin access before changing this one.'

/**
 * Slugs are lowercase kebab: they end up in URLs, provisioning scripts, and
 * support conversations, and are IMMUTABLE after creation (see
 * PlatformTenantRecord.slug), so the format is validated strictly up front.
 */
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * Builds the instance-operator service over any persistence adapter. All guard
 * rails live here: the last active super admin can be neither deactivated nor
 * demoted, deactivation revokes the account's live sessions, and revoking the
 * operator's own current session is flagged in the result rather than
 * happening silently.
 */
export function createSuperadminService(options: SuperadminServiceOptions): SuperadminService {
  const { persistence, hashPassword, actor } = options
  const minPasswordLength = options.minPasswordLength ?? 8

  function assertPassword(password: string): void {
    if (password.length < minPasswordLength) {
      throw new Error(`Passwords must contain at least ${minPasswordLength} characters.`)
    }
  }

  async function requireUser(userId: string): Promise<PlatformUserRecord> {
    const user = await persistence.getUser(userId)
    if (!user) throw new SuperadminNotFoundError(`User not found: ${userId}`)
    return user
  }

  async function requireTenant(tenantId: string): Promise<PlatformTenantRecord> {
    const tenant = await persistence.getTenant(tenantId)
    if (!tenant) throw new SuperadminNotFoundError(`Tenant not found: ${tenantId}`)
    return tenant
  }

  async function requireTenantMember(tenantId: string, membershipId: string): Promise<TenantMemberRecord> {
    await requireTenant(tenantId)
    const member = await persistence.getTenantMember(tenantId, membershipId)
    if (!member) throw new SuperadminNotFoundError(`Membership not found: ${membershipId}`)
    return member
  }

  return {
    async listUsers(query = {}) {
      const page = boundedPage(query.page)
      const perPage = boundedPerPage(query.perPage)
      const listed = await persistence.listUsers({
        ...(query.q?.trim() ? { q: query.q.trim() } : {}),
        ...(query.status ? { status: query.status } : {}),
        page,
        perPage,
        sort: query.sort ?? 'name',
        direction: query.direction ?? 'asc',
      })
      return {
        rows: listed.rows,
        total: listed.total,
        page,
        perPage,
        facets: { statusCounts: listed.statusCounts, superAdmins: listed.superAdmins },
      }
    },

    async getUser(userId) {
      return persistence.getUser(userId)
    },

    async createUser(input: CreateUserInput) {
      const email = input.email.trim().toLocaleLowerCase()
      const name = input.name.trim()
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('A valid email address is required.')
      }
      if (!name) throw new Error('A name is required.')
      assertPassword(input.password)
      const existing = await persistence.findUserIdByEmail(email)
      if (existing) throw new SuperadminConflictError(`An account already exists for ${email}.`)
      const passwordHash = await hashPassword(input.password)
      const user = await persistence.insertUser({
        name,
        email,
        emailVerified: input.emailVerified ?? true,
        isActive: true,
        isSuperAdmin: input.isSuperAdmin ?? false,
      })
      await persistence.setCredential(user.id, passwordHash)
      return { ...user, hasCredential: true }
    },

    async updateUser(userId, input: UpdateUserInput) {
      const before = await requireUser(userId)
      if (input.name !== undefined && !input.name.trim()) {
        throw new Error('A name is required.')
      }
      const losesStanding =
        before.isActive &&
        before.isSuperAdmin &&
        (input.isActive === false || input.isSuperAdmin === false)
      if (losesStanding) {
        const others = await persistence.countOtherActiveSuperAdmins(userId)
        if (others === 0) throw new SuperadminGuardError(LAST_SUPER_ADMIN_MESSAGE)
      }
      const patch = {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isSuperAdmin !== undefined ? { isSuperAdmin: input.isSuperAdmin } : {}),
        ...(input.emailVerified !== undefined ? { emailVerified: input.emailVerified } : {}),
      }
      const after = await persistence.updateUser(userId, patch)
      if (before.isActive && input.isActive === false) {
        // A deactivated account must lose access now, not at session expiry.
        await persistence.deleteSessionsForUser(userId)
        return { ...after, activeSessionCount: 0 }
      }
      return after
    },

    async setPassword(userId, password) {
      const user = await requireUser(userId)
      assertPassword(password)
      await persistence.setCredential(userId, await hashPassword(password))
      return { ...user, hasCredential: true }
    },

    async revokeUserSessions(userId) {
      await requireUser(userId)
      const revokedIds = await persistence.deleteSessionsForUser(userId)
      return {
        revokedCount: revokedIds.length,
        revokedCurrentSession:
          actor?.sessionId !== undefined && revokedIds.includes(actor.sessionId),
      }
    },

    async listSessions(query = {}) {
      const page = boundedPage(query.page)
      const perPage = boundedPerPage(query.perPage)
      const listed = await persistence.listSessions({
        ...(query.q?.trim() ? { q: query.q.trim() } : {}),
        page,
        perPage,
        sort: query.sort ?? 'created',
        direction: query.direction ?? 'desc',
      })
      return {
        rows: listed.rows.map((session) => ({
          ...session,
          isCurrentSession: session.id === actor?.sessionId,
        })),
        total: listed.total,
        page,
        perPage,
      }
    },

    async revokeSession(sessionId) {
      const removed = await persistence.deleteSession(sessionId)
      if (!removed) throw new SuperadminNotFoundError(`Session not found: ${sessionId}`)
      return {
        revokedCount: 1,
        revokedCurrentSession: actor?.sessionId !== undefined && removed.id === actor.sessionId,
      }
    },

    async listTenants() {
      return persistence.listTenants()
    },

    async getTenant(tenantId) {
      return persistence.getTenant(tenantId)
    },

    async createTenant(input: CreateTenantInput) {
      const name = input.name.trim()
      const slug = input.slug.trim().toLocaleLowerCase()
      if (!name) throw new Error('A tenant name is required.')
      if (!TENANT_SLUG_PATTERN.test(slug)) {
        throw new Error(
          'Slugs are lowercase letters, digits, and hyphens (no leading/trailing hyphen), at most 63 characters — and cannot be changed after creation.',
        )
      }
      const existing = await persistence.findTenantIdBySlug(slug)
      if (existing) throw new SuperadminConflictError(`A tenant already uses the slug "${slug}".`)
      return persistence.insertTenant({ name, slug })
    },

    async setTenantStatus(tenantId, status) {
      await requireTenant(tenantId)
      const tenant = await persistence.setTenantStatus(tenantId, status)
      return {
        tenant,
        suspendedCurrentTenant:
          status === 'suspended' && actor?.tenantId !== undefined && actor.tenantId === tenantId,
      }
    },

    async listTenantMembers(tenantId) {
      await requireTenant(tenantId)
      return persistence.listTenantMembers(tenantId)
    },

    async addTenantMember(tenantId, input: AddTenantMemberInput) {
      await requireTenant(tenantId)
      const email = input.email.trim().toLocaleLowerCase()
      if (!email) throw new Error('An email address is required.')
      const userId = await persistence.findUserIdByEmail(email)
      if (!userId) {
        throw new SuperadminNotFoundError(
          `No account exists for ${email}. Create the user first, then add them to the tenant.`,
        )
      }
      const user = await requireUser(userId)
      const already = await persistence.findTenantMemberByUser(tenantId, userId)
      if (already) throw new SuperadminConflictError(`${email} is already a member of this tenant.`)
      return persistence.insertTenantMember({
        tenantId,
        userId,
        displayName: input.displayName?.trim() || user.name,
        invitedBy: actor?.userId ?? null,
      })
    },

    async setTenantMemberStatus(tenantId, membershipId, status) {
      await requireTenantMember(tenantId, membershipId)
      return persistence.setTenantMemberStatus(tenantId, membershipId, status)
    },

    async removeTenantMember(tenantId, membershipId) {
      await requireTenant(tenantId)
      const removed = await persistence.deleteTenantMember(tenantId, membershipId)
      if (!removed) throw new SuperadminNotFoundError(`Membership not found: ${membershipId}`)
    },
  }
}

function boundedPage(page?: number): number {
  return Math.max(1, Math.trunc(page ?? 1))
}

function boundedPerPage(perPage?: number): number {
  return Math.max(1, Math.min(100, Math.trunc(perPage ?? 25)))
}
