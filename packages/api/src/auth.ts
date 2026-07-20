// API-key authentication for the public REST API.
//
// A request authenticates with `Authorization: Bearer <prefix>_live_…`. We hash
// the presented secret and look it up across tenants (BYPASSRLS — we don't know
// the tenant yet), reject revoked/expired keys, optionally rate-limit, stamp
// last_used_at, then build a tenant-scoped RequestContext so every downstream
// query is RLS-bound to the key's tenant exactly like a UI session.
// Rate limiting and the permission catalogue are injected by the application.

import { and, eq, isNull, lt, or } from 'drizzle-orm'
import type { AppkitDb } from '@appkit/db'
import { apiKeys, tenants } from '@appkit/db'
import { makeTenantContext, type RequestContext } from '@appkit/tenant'
import { ApiError } from './errors'
import { sanitizeApiPermissions } from './permissions'
import { hashToken, parseBearerToken } from './token'

export type ApiKeyInfo = {
  id: string
  name: string
  tenantId: string
  permissions: string[]
  rateLimitHeaders: Record<string, string>
}

export type ApiAuth = {
  ctx: RequestContext
  key: ApiKeyInfo
}

/** Pluggable rate limiter (e.g. Redis-backed via @appkit/jobs). */
export type RateLimiter = (
  key: string,
  opts: { limit: number; windowSeconds: number },
) => Promise<{ allowed: boolean; remaining: number; resetAt: Date }>

export type ApiAuthConfig = {
  appkit: AppkitDb<Record<string, never>>
  tokenPrefix?: string
  /** Restrict a key's permissions to this catalogue at auth time. */
  permissionCatalogue?: readonly string[]
  rateLimit?: RateLimiter
  /** Per-minute limit when a rate limiter is supplied. Default 600. */
  rateLimitPerMinute?: number
}

export function createApiAuth(config: ApiAuthConfig) {
  const { appkit } = config

  async function authenticateApiKey(req: Request): Promise<ApiAuth> {
    const token = parseBearerToken(req, { prefix: config.tokenPrefix })
    if (!token) throw ApiError.unauthorized()
    const keyHash = hashToken(token)

    const match = await appkit.withSuperAdmin(async (tx) => {
      const [row] = await tx
        .select({ key: apiKeys })
        .from(apiKeys)
        .innerJoin(tenants, eq(tenants.id, apiKeys.tenantId))
        .where(eq(apiKeys.keyHash, keyHash))
        .limit(1)
      return row?.key ?? null
    })
    if (!match) throw ApiError.unauthorized()
    if (match.revokedAt) throw ApiError.unauthorized('API key has been revoked')
    if (match.expiresAt && match.expiresAt.getTime() <= Date.now()) {
      throw ApiError.unauthorized('API key has expired')
    }

    let rateLimitHeaders: Record<string, string> = {}
    if (config.rateLimit) {
      const limit = config.rateLimitPerMinute ?? 600
      let rate
      try {
        rate = await config.rateLimit(`appkit-api:key:${match.id}`, { limit, windowSeconds: 60 })
      } catch (error) {
        console.error('[appkit/api] rate limiter unavailable', error)
        throw ApiError.unavailable('API rate limiter is unavailable')
      }
      rateLimitHeaders = {
        'RateLimit-Limit': String(limit),
        'RateLimit-Remaining': String(rate.remaining),
        'RateLimit-Reset': String(Math.ceil(rate.resetAt.getTime() / 1_000)),
      }
      if (!rate.allowed) {
        const retryAfter = Math.max(1, Math.ceil((rate.resetAt.getTime() - Date.now()) / 1_000))
        throw ApiError.rateLimited(retryAfter, rateLimitHeaders)
      }
    }

    // Telemetry only — throttled to at most once per 5 min; not part of authz.
    const cutoff = new Date(Date.now() - 5 * 60_000)
    await appkit
      .withSuperAdmin((tx) =>
        tx
          .update(apiKeys)
          .set({ lastUsedAt: new Date() })
          .where(
            and(
              eq(apiKeys.id, match.id),
              or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, cutoff)),
            ),
          ),
      )
      .catch((error) => console.error('[appkit/api] last-used telemetry update failed', error))

    const permissions = sanitizeApiPermissions(match.permissions ?? [], config.permissionCatalogue)
    const ctx = makeTenantContext(appkit, {
      userId: match.createdBy ?? `api_key:${match.id}`,
      tenantId: match.tenantId,
      isSuperAdmin: false,
      membership: null,
      // API keys are tenant-level credentials → full-tenant visibility.
      permissions: new Set(permissions),
      scopes: [{ type: 'tenant' }],
    })

    return { ctx, key: { id: match.id, name: match.name, tenantId: match.tenantId, permissions, rateLimitHeaders } }
  }

  return { authenticateApiKey }
}
