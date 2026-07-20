import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { memberships, roleAssignments, roles, users } from '@appkit/db'
import { can } from '@appkit/tenant'
import { ListPageLayout, PageHeader } from '@appkit/ui'
import { getSession } from '../../../../lib/server/session'
import { TeamView, type TeamRow } from './team-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Team — appkit' }

export default async function TeamPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const { ctx } = session

  // RLS-scoped reads: memberships/role rows are tenant tables; users is global.
  const rows = await ctx.db(async (db) => {
    const members = await db
      .select({
        id: memberships.id,
        name: memberships.displayName,
        email: users.email,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .orderBy(memberships.createdAt)
    const assignments = await db
      .select({ membershipId: roleAssignments.membershipId, roleName: roles.name })
      .from(roleAssignments)
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    const byMembership = new Map<string, string[]>()
    for (const a of assignments) {
      const list = byMembership.get(a.membershipId) ?? []
      list.push(a.roleName)
      byMembership.set(a.membershipId, list)
    }
    return members.map<TeamRow>((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      roles: byMembership.get(m.id) ?? [],
      since: m.createdAt.toISOString().slice(0, 10),
    }))
  })

  return (
    <ListPageLayout
      header={
        <PageHeader
          title="Team"
          description="Live from the database, scoped to your tenant. Invites are RBAC-gated and audited."
        />
      }
    >
      <TeamView rows={rows} canManage={can(ctx, 'team.manage')} />
    </ListPageLayout>
  )
}
