import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { users } from '@appkit/db'

/**
 * Passwords: scrypt, stored `salt:hash` hex.
 * Sessions: HMAC-signed stateless cookie `uid.expiresEpoch.sig` — no session
 * table; revocation is `users.is_active = false`. The secret is injected and
 * cookie policy is left to the application.
 */

// --- Passwords (no config needed) ------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const hash = scryptSync(password, Buffer.from(saltHex, 'hex'), 64)
  const expected = Buffer.from(hashHex, 'hex')
  return hash.length === expected.length && timingSafeEqual(hash, expected)
}

// --- Auth factory ----------------------------------------------------------

const DEFAULT_TTL_S = 14 * 24 * 3600
const DEFAULT_COOKIE = 'appkit_session'

export type AuthConfig = {
  /** HMAC secret for session tokens. Keep it in the environment, never in code. */
  sessionSecret: string
  ttlSeconds?: number
  cookieName?: string
}

export type AuthUser = { id: string; email: string; name: string; isSuperAdmin: boolean }

export type SessionCookieOptions = {
  name: string
  maxAge: number
  httpOnly: true
  sameSite: 'lax'
  path: '/'
  secure: boolean
}

export type Auth = {
  cookieName: string
  ttlSeconds: number
  hashPassword: typeof hashPassword
  verifyPassword: typeof verifyPassword
  /** Sign a stateless session token for a user id. */
  makeSessionToken: (userId: string) => string
  /** Verify a token → the user id, or null if missing/tampered/expired. */
  verifySessionToken: (token: string | undefined | null) => string | null
  /** Cookie attributes for the session (spread into your framework's cookie API). */
  sessionCookieOptions: (opts?: { secure?: boolean }) => SessionCookieOptions
  /** Attributes to clear the session cookie. */
  clearSessionCookie: (opts?: { secure?: boolean }) => SessionCookieOptions & { value: '' }
  /** Look up + verify a login by email/password. Returns the user or null.
   *  `users` is a global (non-tenant) table, so any db handle works. */
  authenticate: (db: NodePgDatabase<Record<string, never>>, email: string, password: string) => Promise<AuthUser | null>
}

export function createAuth(config: AuthConfig): Auth {
  const ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_S
  const cookieName = config.cookieName ?? DEFAULT_COOKIE

  const sign = (payload: string): string =>
    createHmac('sha256', config.sessionSecret).update(payload).digest('base64url')

  const makeSessionToken = (userId: string): string => {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds
    const payload = `${userId}.${exp}`
    return `${payload}.${sign(payload)}`
  }

  const verifySessionToken = (token: string | undefined | null): string | null => {
    if (!token) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [uid, exp, sig] = parts
    if (!uid || !exp || !sig) return null
    const payload = `${uid}.${exp}`
    const expected = sign(payload)
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null
    }
    if (Number(exp) < Date.now() / 1000) return null
    return uid
  }

  const sessionCookieOptions = (opts?: { secure?: boolean }): SessionCookieOptions => ({
    name: cookieName,
    maxAge: ttlSeconds,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: opts?.secure ?? true,
  })

  const clearSessionCookie = (opts?: { secure?: boolean }) => ({
    ...sessionCookieOptions(opts),
    maxAge: 0,
    value: '' as const,
  })

  async function authenticate(
    db: NodePgDatabase<Record<string, never>>,
    email: string,
    password: string,
  ): Promise<AuthUser | null> {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
        isSuperAdmin: users.isSuperAdmin,
      })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email.toLowerCase()}`, eq(users.isActive, true)))
      .limit(1)
    const row = rows[0]
    if (!row || !row.passwordHash || !verifyPassword(password, row.passwordHash)) return null
    return { id: row.id, email: row.email, name: row.name, isSuperAdmin: row.isSuperAdmin }
  }

  return {
    cookieName,
    ttlSeconds,
    hashPassword,
    verifyPassword,
    makeSessionToken,
    verifySessionToken,
    sessionCookieOptions,
    clearSessionCookie,
    authenticate,
  }
}
