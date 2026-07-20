import { eq } from 'drizzle-orm'
import { memberships, users } from '@appkit/db'
import { authorize } from '@appkit/api'
import { platform } from '../../../../lib/server/platform'

// The real public API: authenticated by an @appkit/api key, RBAC-checked, and
// RLS-scoped to the key's tenant. Try it from /api-docs with the seeded key.

export async function GET(req: Request): Promise<Response> {
  const { api } = platform()
  return api.withApiKey(req, async (auth) => {
    authorize(auth, 'team.read')
    const data = await auth.ctx.db((db) =>
      db
        .select({ id: memberships.id, name: memberships.displayName, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .orderBy(memberships.createdAt),
    )
    return Response.json({ data, total: data.length })
  })
}
