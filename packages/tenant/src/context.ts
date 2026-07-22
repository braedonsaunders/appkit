import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { AppkitDb, RoleScope } from '@appkit/db'
import type { AppLocale } from '@appkit/i18n'

export type TenantDatabase<TSchema extends Record<string, unknown> = Record<string, never>> =
  NodePgDatabase<TSchema>

export type ImpersonationInfo = {
  actor: { userId: string; name: string; email: string }
  tenantId: string
  expiresAt: Date
}

export type RequestContextCore<TDatabase = TenantDatabase> = {
  userId: string
  tenantId: string
  isSuperAdmin: boolean
  /** IANA timezone for the active identity. */
  timezone: string
  /** Effective locale plus the tenant policy that produced it. */
  locale: AppLocale
  defaultLocale: AppLocale
  enabledLocales: readonly AppLocale[]
  localeOverride: AppLocale | null
  membership: { id: string; displayName: string } | null
  permissions: Set<string>
  scopes: RoleScope[]
  /** The single role a multi-role user switched into (narrows permissions/scopes). */
  activeRoleId?: string | null
  /** Present only while a privileged actor is viewing the app as another user. */
  impersonation?: ImpersonationInfo | null
  /** Present for public requests authenticated by an application API key. */
  apiKey?: { id: string; name: string } | null
  /** Tenant-bound DB helper. Every callback runs inside the selected tenant's RLS scope. */
  db: <T>(fn: (db: TDatabase) => Promise<T>) => Promise<T>
}

/**
 * Resolved auth + tenant context for a request. Applications add domain-owned
 * identity data through `TExtension` instead of changing or forking the shared
 * context (for example, a linked employee id or jurisdiction terminology).
 */
export type RequestContext<
  TExtension extends object = object,
  TDatabase = TenantDatabase,
> = RequestContextCore<TDatabase> & TExtension

export type SuperAdminContext<TDatabase = TenantDatabase> = {
  userId: string
  isSuperAdmin: true
  /** Cross-tenant DB helper. Use intentionally. */
  db: <T>(fn: (db: TDatabase) => Promise<T>) => Promise<T>
}

export type RequestContextArgs<TExtension extends object = object> = Omit<
  RequestContextCore<never>,
  'db'
> &
  TExtension

export type TenantContextRuntime<TDatabase> = {
  withTenant: <T>(
    baseDb: TDatabase,
    tenantId: string,
    fn: (db: TDatabase) => Promise<T>,
  ) => Promise<T>
  withSuperAdmin: <T>(baseDb: TDatabase, fn: (db: TDatabase) => Promise<T>) => Promise<T>
}

/**
 * Bind AppKit's portable request-context contract to any tenant-aware database
 * runtime. A consuming application can keep its existing `makeTenantContext`
 * call shape while its database package owns the RLS implementation.
 */
export function createTenantContextFactory<TDatabase>(runtime: TenantContextRuntime<TDatabase>) {
  function makeContext<TExtension extends object = object>(
    baseDb: TDatabase,
    args: RequestContextArgs<TExtension>,
  ): RequestContext<TExtension, TDatabase> {
    return {
      ...args,
      db: (fn) => runtime.withTenant(baseDb, args.tenantId, fn),
    }
  }

  function makeAdminContext(baseDb: TDatabase, userId: string): SuperAdminContext<TDatabase> {
    return {
      userId,
      isSuperAdmin: true,
      db: (fn) => runtime.withSuperAdmin(baseDb, fn),
    }
  }

  return { makeTenantContext: makeContext, makeSuperAdminContext: makeAdminContext }
}

/** Build a request context over `@appkit/db`. */
export function makeTenantContext<
  TSchema extends Record<string, unknown>,
  TExtension extends object = object,
>(
  appkit: AppkitDb<TSchema>,
  args: RequestContextArgs<TExtension>,
): RequestContext<TExtension, TenantDatabase<TSchema>> {
  return {
    ...args,
    db: (fn) => appkit.withTenant(args.tenantId, () => fn(appkit.db)),
  }
}

export function makeSuperAdminContext<TSchema extends Record<string, unknown>>(
  appkit: AppkitDb<TSchema>,
  userId: string,
): SuperAdminContext<TenantDatabase<TSchema>> {
  return {
    userId,
    isSuperAdmin: true,
    db: (fn) => appkit.withSuperAdmin(fn),
  }
}
