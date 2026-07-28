import type {
  PlatformUserRecord,
  StoredSessionRecord,
  SuperadminPersistence,
  SuperadminService,
  SuperadminServiceOptions,
  UserWrite,
} from './types'
import { createSuperadminService } from './service'

export type MemoryUserSeed = {
  id: string
  name: string
  email: string
  image?: string | null
  emailVerified?: boolean
  isActive?: boolean
  isSuperAdmin?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type MemorySessionSeed = {
  id: string
  userId: string
  createdAt?: Date
  expiresAt?: Date
  ipAddress?: string | null
  userAgent?: string | null
}

export type MemorySuperadminState = {
  users: Map<string, Omit<PlatformUserRecord, 'hasCredential' | 'activeSessionCount' | 'lastSeenAt'>>
  /** userId → password hash */
  credentials: Map<string, string>
  sessions: Map<string, { id: string; userId: string; createdAt: Date; expiresAt: Date; ipAddress: string | null; userAgent: string | null }>
}

export type MemorySuperadminPersistence = SuperadminPersistence & { state: MemorySuperadminState }

/** In-memory persistence adapter for tests, previews, and local tooling. */
export function createMemorySuperadminPersistence(
  seed: { users?: MemoryUserSeed[]; credentials?: Record<string, string>; sessions?: MemorySessionSeed[] } = {},
  clock: { now?: () => Date; id?: () => string } = {},
): MemorySuperadminPersistence {
  const now = clock.now ?? (() => new Date())
  let sequence = 1
  const nextId = clock.id ?? (() => `memory-${sequence++}`)

  const state: MemorySuperadminState = {
    users: new Map(
      (seed.users ?? []).map((user) => [
        user.id,
        {
          id: user.id,
          name: user.name,
          email: user.email.toLocaleLowerCase(),
          image: user.image ?? null,
          emailVerified: user.emailVerified ?? true,
          isActive: user.isActive ?? true,
          isSuperAdmin: user.isSuperAdmin ?? false,
          createdAt: user.createdAt ?? now(),
          updatedAt: user.updatedAt ?? now(),
        },
      ]),
    ),
    credentials: new Map(Object.entries(seed.credentials ?? {})),
    sessions: new Map(
      (seed.sessions ?? []).map((session) => [
        session.id,
        {
          id: session.id,
          userId: session.userId,
          createdAt: session.createdAt ?? now(),
          expiresAt: session.expiresAt ?? new Date(now().getTime() + 24 * 60 * 60 * 1000),
          ipAddress: session.ipAddress ?? null,
          userAgent: session.userAgent ?? null,
        },
      ]),
    ),
  }

  function activeSessions(userId?: string) {
    const reference = now().getTime()
    return [...state.sessions.values()].filter(
      (session) => session.expiresAt.getTime() > reference && (userId === undefined || session.userId === userId),
    )
  }

  function expose(user: NonNullable<ReturnType<MemorySuperadminState['users']['get']>>): PlatformUserRecord {
    const sessions = activeSessions(user.id)
    const lastSeen = [...state.sessions.values()]
      .filter((session) => session.userId === user.id)
      .reduce<Date | null>((latest, session) => (!latest || session.createdAt > latest ? session.createdAt : latest), null)
    return {
      ...user,
      hasCredential: state.credentials.has(user.id),
      activeSessionCount: sessions.length,
      lastSeenAt: lastSeen,
    }
  }

  return {
    state,

    async listUsers(query) {
      let rows = [...state.users.values()].map(expose)
      const base = rows
      if (query.q) {
        const needle = query.q.toLocaleLowerCase()
        rows = rows.filter((user) => user.name.toLocaleLowerCase().includes(needle) || user.email.includes(needle))
      }
      const statusCounts = {
        active: rows.filter((user) => user.isActive).length,
        inactive: rows.filter((user) => !user.isActive).length,
      }
      if (query.status) rows = rows.filter((user) => user.isActive === (query.status === 'active'))
      const factor = query.direction === 'desc' ? -1 : 1
      rows.sort((a, b) => {
        if (query.sort === 'email') return a.email.localeCompare(b.email) * factor
        if (query.sort === 'created') return (a.createdAt.getTime() - b.createdAt.getTime()) * factor
        return a.name.localeCompare(b.name) * factor
      })
      return {
        rows: rows.slice((query.page - 1) * query.perPage, query.page * query.perPage),
        total: rows.length,
        statusCounts,
        superAdmins: base.filter((user) => user.isActive && user.isSuperAdmin).length,
      }
    },

    async getUser(userId) {
      const user = state.users.get(userId)
      return user ? expose(user) : null
    },

    async findUserIdByEmail(email) {
      const needle = email.toLocaleLowerCase()
      for (const user of state.users.values()) if (user.email === needle) return user.id
      return null
    },

    async insertUser(input: UserWrite) {
      const id = nextId()
      const record = { id, image: null, ...input, createdAt: now(), updatedAt: now() }
      state.users.set(id, record)
      return expose(record)
    },

    async updateUser(userId, patch) {
      const user = state.users.get(userId)
      if (!user) throw new Error(`User not found: ${userId}`)
      const next = { ...user, ...patch, updatedAt: now() }
      state.users.set(userId, next)
      return expose(next)
    },

    async countOtherActiveSuperAdmins(excludeUserId) {
      return [...state.users.values()].filter(
        (user) => user.id !== excludeUserId && user.isActive && user.isSuperAdmin,
      ).length
    },

    async setCredential(userId, passwordHash) {
      state.credentials.set(userId, passwordHash)
    },

    async listSessions(query) {
      let rows: StoredSessionRecord[] = activeSessions().map((session) => {
        const user = state.users.get(session.userId)
        return {
          ...session,
          userName: user?.name ?? 'Unknown account',
          userEmail: user?.email ?? '',
        }
      })
      if (query.q) {
        const needle = query.q.toLocaleLowerCase()
        rows = rows.filter(
          (session) => session.userName.toLocaleLowerCase().includes(needle) || session.userEmail.includes(needle),
        )
      }
      const factor = query.direction === 'desc' ? -1 : 1
      rows.sort((a, b) => {
        if (query.sort === 'expires') return (a.expiresAt.getTime() - b.expiresAt.getTime()) * factor
        if (query.sort === 'user') return a.userName.localeCompare(b.userName) * factor
        return (a.createdAt.getTime() - b.createdAt.getTime()) * factor
      })
      return {
        rows: rows.slice((query.page - 1) * query.perPage, query.page * query.perPage),
        total: rows.length,
      }
    },

    async deleteSessionsForUser(userId) {
      const removed: string[] = []
      for (const [id, session] of state.sessions) {
        if (session.userId === userId) {
          state.sessions.delete(id)
          removed.push(id)
        }
      }
      return removed
    },

    async deleteSession(sessionId) {
      const session = state.sessions.get(sessionId)
      if (!session) return null
      state.sessions.delete(sessionId)
      const user = state.users.get(session.userId)
      return {
        ...session,
        userName: user?.name ?? 'Unknown account',
        userEmail: user?.email ?? '',
      }
    },
  }
}

/** Complete in-memory service — the shape tests and previews consume. */
export function createMemorySuperadminService(
  seed: Parameters<typeof createMemorySuperadminPersistence>[0] = {},
  options: Partial<Omit<SuperadminServiceOptions, 'persistence'>> & {
    now?: () => Date
    id?: () => string
  } = {},
): { service: SuperadminService; persistence: MemorySuperadminPersistence } {
  const persistence = createMemorySuperadminPersistence(seed, {
    ...(options.now ? { now: options.now } : {}),
    ...(options.id ? { id: options.id } : {}),
  })
  const service = createSuperadminService({
    persistence,
    hashPassword: options.hashPassword ?? (async (password) => `plain:${password}`),
    ...(options.actor ? { actor: options.actor } : {}),
    ...(options.minPasswordLength !== undefined ? { minPasswordLength: options.minPasswordLength } : {}),
  })
  return { service, persistence }
}
