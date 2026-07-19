import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { AppkitDb, RoleScope } from '@appkit/db'

/**
 * The resolved auth + tenant context for a request. Build it once per request
 * (resolve the user, active tenant, membership, permissions, scopes) and thread
 * it through server actions / route handlers. Every consumer already operates
 * inside a chosen tenant; cross-tenant admin uses `SuperAdminContext`.
 */
export type RequestContext = {
  userId: string
  tenantId: string
  isSuperAdmin: boolean
  membership: { id: string; displayName: string } | null
  permissions: Set<string>
  scopes: RoleScope[]
  /** The single role a multi-role user switched into (narrows perms/scopes). */
  activeRoleId?: string | null
  /** Tenant-bound DB helper — runs `fn` inside this tenant's RLS scope. */
  db: <T>(fn: (db: NodePgDatabase<Record<string, never>>) => Promise<T>) => Promise<T>
}

export type SuperAdminContext = {
  userId: string
  isSuperAdmin: true
  /** BYPASSRLS DB helper — spans tenants. Use intentionally. */
  db: <T>(fn: (db: NodePgDatabase<Record<string, never>>) => Promise<T>) => Promise<T>
}

export function makeTenantContext<S extends Record<string, unknown>>(
  appkit: AppkitDb<S>,
  args: Omit<RequestContext, 'db'>,
): RequestContext {
  return {
    ...args,
    db: (fn) => appkit.withTenant(args.tenantId, () => fn(appkit.db as never)),
  }
}

export function makeSuperAdminContext<S extends Record<string, unknown>>(
  appkit: AppkitDb<S>,
  userId: string,
): SuperAdminContext {
  return {
    userId,
    isSuperAdmin: true,
    db: (fn) => appkit.withSuperAdmin((sdb) => fn(sdb as never)),
  }
}
