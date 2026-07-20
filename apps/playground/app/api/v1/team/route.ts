import { eq } from 'drizzle-orm'
import { memberships, users } from '@appkit/db'
import { assertCan } from '@appkit/tenant'
import { getDemoEnvironment } from '../../../../lib/server/demo-context'
import { DEMO_MEMBERS } from '../../../../lib/server/demo-data'
import { isDatabaseConfigured } from '../../../../lib/server/platform'

// A public demo endpoint. It uses the same fixed RequestContext as the UI. The
// optional database path remains RLS-scoped without requiring authentication.

export async function GET(): Promise<Response> {
  const { ctx } = await getDemoEnvironment()
  assertCan(ctx, 'team.read')
  const data = isDatabaseConfigured()
    ? await ctx.db((db) =>
        db
          .select({ id: memberships.id, name: memberships.displayName, email: users.email })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .orderBy(memberships.createdAt),
      )
    : DEMO_MEMBERS.map(({ id, name, email }) => ({ id, name, email }))
  return Response.json({ data, total: data.length, demo: { authentication: 'disabled' } })
}
