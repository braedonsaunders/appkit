import type {
  CreateUserInput,
  PlatformUserRecord,
  SuperadminService,
  SuperadminServiceOptions,
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
  }
}

function boundedPage(page?: number): number {
  return Math.max(1, Math.trunc(page ?? 1))
}

function boundedPerPage(perPage?: number): number {
  return Math.max(1, Math.min(100, Math.trunc(perPage ?? 25)))
}
