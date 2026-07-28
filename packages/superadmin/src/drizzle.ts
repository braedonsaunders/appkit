import { and, asc, count, desc, eq, gt, ilike, inArray, max, ne, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session'
import { authAccounts, authSessions, users } from '@appkit/db'
import { createSuperadminService } from './service'
import type {
  PlatformUserRecord,
  StoredSessionRecord,
  SuperadminPersistence,
  SuperadminService,
  SuperadminServiceOptions,
  UserSort,
} from './types'

const CREDENTIAL_PROVIDER = 'credential'

/** Database-neutral contract shared by Drizzle's node-postgres and postgres-js drivers. */
export type SuperadminDatabase<
  TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
  TSchema extends Record<string, unknown> = Record<string, never>,
> = PgDatabase<TQueryResult, TSchema>

export type DrizzleSuperadminOptions<
  TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
  TSchema extends Record<string, unknown> = Record<string, never>,
> = {
  /**
   * A connection that can reach the GLOBAL identity tables (users, sessions,
   * accounts). These tables carry no tenant scope — run this on the
   * cross-tenant pool the auth runtime itself uses.
   */
  db: SuperadminDatabase<TQueryResult, TSchema>
}

/** Postgres persistence adapter over the @appkit/db identity schema. */
export function createDrizzleSuperadminPersistence<
  TQueryResult extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(options: DrizzleSuperadminOptions<TQueryResult, TSchema>): SuperadminPersistence {
  const { db } = options

  async function enrich(rows: Array<typeof users.$inferSelect>): Promise<PlatformUserRecord[]> {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const [credentialRows, sessionRows] = await Promise.all([
      db
        .selectDistinct({ userId: authAccounts.userId })
        .from(authAccounts)
        .where(and(inArray(authAccounts.userId, ids), eq(authAccounts.providerId, CREDENTIAL_PROVIDER))),
      db
        .select({
          userId: authSessions.userId,
          activeCount: count(sql`case when ${authSessions.expiresAt} > now() then 1 end`),
          lastSeenAt: max(authSessions.updatedAt),
        })
        .from(authSessions)
        .where(inArray(authSessions.userId, ids))
        .groupBy(authSessions.userId),
    ])
    const credentialed = new Set(credentialRows.map((row) => row.userId))
    const sessionsByUser = new Map(sessionRows.map((row) => [row.userId, row]))
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      emailVerified: row.emailVerified,
      isActive: row.isActive,
      isSuperAdmin: row.isSuperAdmin,
      hasCredential: credentialed.has(row.id),
      activeSessionCount: sessionsByUser.get(row.id)?.activeCount ?? 0,
      lastSeenAt: sessionsByUser.get(row.id)?.lastSeenAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
  }

  async function userById(userId: string): Promise<PlatformUserRecord | null> {
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    const [enriched] = await enrich(rows)
    return enriched ?? null
  }

  return {
    async listUsers(query) {
      const filters: SQL[] = []
      if (query.q) {
        filters.push(or(ilike(users.name, escapedPattern(query.q)), ilike(users.email, escapedPattern(query.q)))!)
      }
      const baseWhere = filters.length ? and(...filters) : undefined
      const statusFilters = query.status ? [...filters, eq(users.isActive, query.status === 'active')] : filters
      const where = statusFilters.length ? and(...statusFilters) : undefined
      const [totalRows, pageRows, statusRows, superAdminRows] = await Promise.all([
        db.select({ value: count() }).from(users).where(where),
        db
          .select()
          .from(users)
          .where(where)
          .orderBy(userOrder(query.sort, query.direction))
          .limit(query.perPage)
          .offset((query.page - 1) * query.perPage),
        db.select({ isActive: users.isActive, value: count() }).from(users).where(baseWhere).groupBy(users.isActive),
        db
          .select({ value: count() })
          .from(users)
          .where(and(eq(users.isActive, true), eq(users.isSuperAdmin, true))),
      ])
      const statusCounts = { active: 0, inactive: 0 }
      for (const row of statusRows) statusCounts[row.isActive ? 'active' : 'inactive'] = row.value
      return {
        rows: await enrich(pageRows),
        total: totalRows[0]?.value ?? 0,
        statusCounts,
        superAdmins: superAdminRows[0]?.value ?? 0,
      }
    },

    async getUser(userId) {
      return userById(userId)
    },

    async findUserIdByEmail(email) {
      const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
      return row?.id ?? null
    },

    async insertUser(input) {
      const [inserted] = await db.insert(users).values(input).returning({ id: users.id })
      const user = await userById(inserted!.id)
      if (!user) throw new Error('The created user could not be reloaded.')
      return user
    },

    async updateUser(userId, patch) {
      await db
        .update(users)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(users.id, userId))
      const user = await userById(userId)
      if (!user) throw new Error('The updated user could not be reloaded.')
      return user
    },

    async countOtherActiveSuperAdmins(excludeUserId) {
      const [row] = await db
        .select({ value: count() })
        .from(users)
        .where(and(ne(users.id, excludeUserId), eq(users.isActive, true), eq(users.isSuperAdmin, true)))
      return row?.value ?? 0
    },

    async setCredential(userId, passwordHash) {
      const [existing] = await db
        .select({ id: authAccounts.id })
        .from(authAccounts)
        .where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, CREDENTIAL_PROVIDER)))
        .limit(1)
      if (existing) {
        await db
          .update(authAccounts)
          .set({ password: passwordHash, updatedAt: new Date() })
          .where(eq(authAccounts.id, existing.id))
      } else {
        await db.insert(authAccounts).values({
          userId,
          providerId: CREDENTIAL_PROVIDER,
          accountId: userId,
          password: passwordHash,
        })
      }
    },

    async listSessions(query) {
      const filters: SQL[] = [gt(authSessions.expiresAt, sql`now()`)]
      if (query.q) {
        filters.push(or(ilike(users.name, escapedPattern(query.q)), ilike(users.email, escapedPattern(query.q)))!)
      }
      const where = and(...filters)
      const selection = {
        id: authSessions.id,
        userId: authSessions.userId,
        userName: users.name,
        userEmail: users.email,
        createdAt: authSessions.createdAt,
        expiresAt: authSessions.expiresAt,
        ipAddress: authSessions.ipAddress,
        userAgent: authSessions.userAgent,
      }
      const [totalRows, rows] = await Promise.all([
        db
          .select({ value: count() })
          .from(authSessions)
          .innerJoin(users, eq(users.id, authSessions.userId))
          .where(where),
        db
          .select(selection)
          .from(authSessions)
          .innerJoin(users, eq(users.id, authSessions.userId))
          .where(where)
          .orderBy(sessionOrder(query.sort, query.direction))
          .limit(query.perPage)
          .offset((query.page - 1) * query.perPage),
      ])
      return { rows, total: totalRows[0]?.value ?? 0 }
    },

    async deleteSessionsForUser(userId) {
      const removed = await db
        .delete(authSessions)
        .where(eq(authSessions.userId, userId))
        .returning({ id: authSessions.id })
      return removed.map((row) => row.id)
    },

    async deleteSession(sessionId) {
      const [row] = await db
        .select({
          id: authSessions.id,
          userId: authSessions.userId,
          userName: users.name,
          userEmail: users.email,
          createdAt: authSessions.createdAt,
          expiresAt: authSessions.expiresAt,
          ipAddress: authSessions.ipAddress,
          userAgent: authSessions.userAgent,
        })
        .from(authSessions)
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(eq(authSessions.id, sessionId))
        .limit(1)
      if (!row) return null
      await db.delete(authSessions).where(eq(authSessions.id, sessionId))
      return row satisfies StoredSessionRecord
    },
  }
}

export type DrizzleSuperadminServiceOptions<
  TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
  TSchema extends Record<string, unknown> = Record<string, never>,
> = DrizzleSuperadminOptions<TQueryResult, TSchema> & Omit<SuperadminServiceOptions, 'persistence'>

/** Convenience: guard-railed service directly over a Postgres identity schema. */
export function createDrizzleSuperadminService<
  TQueryResult extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(options: DrizzleSuperadminServiceOptions<TQueryResult, TSchema>): SuperadminService {
  const { db, ...serviceOptions } = options
  return createSuperadminService({
    ...serviceOptions,
    persistence: createDrizzleSuperadminPersistence({ db }),
  })
}

function escapedPattern(value: string): string {
  return `%${value.trim().replace(/[\\%_]/g, '\\$&')}%`
}

function userOrder(sort: UserSort, direction: 'asc' | 'desc') {
  const order = direction === 'desc' ? desc : asc
  if (sort === 'email') return order(users.email)
  if (sort === 'created') return order(users.createdAt)
  return order(users.name)
}

function sessionOrder(sort: 'created' | 'expires' | 'user', direction: 'asc' | 'desc') {
  const order = direction === 'desc' ? desc : asc
  if (sort === 'expires') return order(authSessions.expiresAt)
  if (sort === 'user') return order(users.name)
  return order(authSessions.createdAt)
}
