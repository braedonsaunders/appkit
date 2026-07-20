import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { memberships, tenants, users } from '@appkit/db'
import { makeTenantContext, resolveMembershipAccess, type RequestContext } from '@appkit/tenant'
import { PERMISSION_CATALOGUE } from '../permissions'
import { platform } from './platform'

export type Session = {
  ctx: RequestContext
  user: { id: string; name: string; email: string; isSuperAdmin: boolean }
  tenant: { id: string; name: string; slug: string }
}

/**
 * Resolve the session cookie into a tenant-scoped RequestContext. The identity
 * bootstrap reads under the BYPASSRLS handle (the membership's tenant isn't
 * known until this lookup); everything after runs RLS-scoped via ctx.db.
 * `cache()` dedupes the lookup across layout + page within one request.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const { appkit, auth } = platform()
  const jar = await cookies()
  const userId = auth.verifySessionToken(jar.get(auth.cookieName)?.value)
  if (!userId) return null

  return appkit.withSuperAdmin(async (sdb) => {
    const [user] = await sdb
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        isActive: users.isActive,
        isSuperAdmin: users.isSuperAdmin,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user || !user.isActive) return null

    const [m] = await sdb
      .select({
        id: memberships.id,
        tenantId: memberships.tenantId,
        displayName: memberships.displayName,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.userId, user.id))
      .limit(1)
    if (!m) return null

    const access = await resolveMembershipAccess(sdb as never, m.id, PERMISSION_CATALOGUE)
    const ctx = makeTenantContext(appkit as never, {
      userId: user.id,
      tenantId: m.tenantId,
      isSuperAdmin: user.isSuperAdmin,
      membership: { id: m.id, displayName: m.displayName },
      permissions: access.permissions,
      scopes: access.scopes,
    })

    return {
      ctx,
      user: { id: user.id, name: user.name, email: user.email, isSuperAdmin: user.isSuperAdmin },
      tenant: { id: m.tenantId, name: m.tenantName, slug: m.tenantSlug },
    }
  })
})
