import 'server-only'
import { cache } from 'react'
import { and, eq } from 'drizzle-orm'
import { memberships, schema, tenants, users } from '@appkit/db'
import { resolveLocalePreferences } from '@appkit/i18n'
import {
  makeTenantContext,
  resolveMembershipAccess,
  type RequestContext,
  type TenantDatabase,
} from '@appkit/tenant'
import { PERMISSION_CATALOGUE } from '../permissions'
import { DEMO_TENANT, DEMO_USER } from './demo-data'
import { isDatabaseConfigured, platform } from './platform'

type DemoRequestContext = RequestContext<object, TenantDatabase<typeof schema>>

export type DemoEnvironment = {
  ctx: DemoRequestContext
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
    const ctx: DemoRequestContext = {
      userId: DEMO_USER.id,
      tenantId: DEMO_TENANT.id,
      isSuperAdmin: true,
      timezone: 'America/Toronto',
      locale: 'en',
      defaultLocale: 'en',
      enabledLocales: ['en'],
      localeOverride: null,
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
        userTimezone: users.timezone,
        userActive: users.isActive,
        isSuperAdmin: users.isSuperAdmin,
        displayName: memberships.displayName,
        localeOverride: memberships.localeOverride,
        defaultLocale: tenants.defaultLocale,
        enabledLocales: tenants.enabledLocales,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(tenants.slug, 'acme'), eq(users.email, 'admin@appkit.dev')))
      .limit(1)

    if (!row || !row.userActive) {
      throw new Error('The appkit demo identity is missing. Run `pnpm --filter @appkit/playground seed`.')
    }

    const access = await resolveMembershipAccess(sdb, row.membershipId, null, {
      permissionCatalogue: PERMISSION_CATALOGUE,
    })
    const locale = resolveLocalePreferences({
      defaultLocale: row.defaultLocale,
      enabledLocales: row.enabledLocales,
      userLocale: row.localeOverride,
    })
    const ctx = makeTenantContext(appkit, {
      userId: row.userId,
      tenantId: row.tenantId,
      isSuperAdmin: row.isSuperAdmin,
      timezone: row.userTimezone,
      ...locale,
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
