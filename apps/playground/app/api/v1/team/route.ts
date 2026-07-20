import { eq } from 'drizzle-orm'
import { memberships, users } from '@appkit/db'
import { assertCan } from '@appkit/tenant'
import { getDemoEnvironment } from '../../../../lib/server/demo-context'

// A public demo endpoint. It uses the same fixed demo RequestContext as the UI,
// so the database query remains RLS-scoped without requiring any authentication.

export async function GET(): Promise<Response> {
  const { ctx } = await getDemoEnvironment()
  assertCan(ctx, 'team.read')
  const data = await ctx.db((db) =>
    db
      .select({ id: memberships.id, name: memberships.displayName, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .orderBy(memberships.createdAt),
  )
  return Response.json({ data, total: data.length, demo: { authentication: 'disabled' } })
}
