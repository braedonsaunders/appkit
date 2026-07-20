import 'server-only'
import { cache } from 'react'
import { and, eq } from 'drizzle-orm'
import { memberships, tenants, users } from '@appkit/db'
import { makeTenantContext, resolveMembershipAccess, type RequestContext } from '@appkit/tenant'
import { PERMISSION_CATALOGUE } from '../permissions'
import { DEMO_TENANT, DEMO_USER } from './demo-data'
import { isDatabaseConfigured, platform } from './platform'

export type DemoEnvironment = {
  ctx: RequestContext
  user: { id: string; name: string; email: string; isSuperAdmin: boolean }
  tenant: { id: string; name: string; slug: string }
}

/**
 * Resolve the playground's fixed demo identity. This is deliberately not an
 * authentication path: it never reads a cookie, credential, header, or request
 * state. Without database configuration it builds the same RequestContext from
 * deterministic data; with both database URLs it resolves the seeded identity
 * through the real RLS-backed platform.
 */
export const getDemoEnvironment = cache(async (): Promise<DemoEnvironment> => {
  if (!isDatabaseConfigured()) {
    const ctx: RequestContext = {
      userId: DEMO_USER.id,
      tenantId: DEMO_TENANT.id,
      isSuperAdmin: true,
      membership: { id: DEMO_USER.membershipId, displayName: DEMO_USER.name },
      permissions: new Set(PERMISSION_CATALOGUE),
      scopes: [{ type: 'tenant' }],
      db: async () => {
        throw new Error('The database-free demo attempted to use its optional Postgres adapter.')
      },
    }
    return { ctx, user: DEMO_USER, tenant: DEMO_TENANT }
  }

  const { appkit } = platform()
  return appkit.withSuperAdmin(async (sdb) => {
    const [row] = await sdb
      .select({
        membershipId: memberships.id,
        tenantId: tenants.id,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userActive: users.isActive,
        isSuperAdmin: users.isSuperAdmin,
        displayName: memberships.displayName,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(tenants.slug, 'acme'), eq(users.email, 'admin@appkit.dev')))
      .limit(1)

    if (!row || !row.userActive) {
      throw new Error('The appkit demo identity is missing. Run `pnpm --filter @appkit/playground seed`.')
    }

    const access = await resolveMembershipAccess(sdb as never, row.membershipId, PERMISSION_CATALOGUE)
    const ctx = makeTenantContext(appkit as never, {
      userId: row.userId,
      tenantId: row.tenantId,
      isSuperAdmin: row.isSuperAdmin,
      membership: { id: row.membershipId, displayName: row.displayName },
      permissions: access.permissions,
      scopes: access.scopes,
    })

    return {
      ctx,
      user: {
        id: row.userId,
        name: row.userName,
        email: row.userEmail,
        isSuperAdmin: row.isSuperAdmin,
      },
      tenant: { id: row.tenantId, name: row.tenantName, slug: row.tenantSlug },
    }
  })
})
