import { redirect } from 'next/navigation'
import Link from 'next/link'
import { KeyRound, ScrollText, Shield, Users } from 'lucide-react'
import { count } from 'drizzle-orm'
import { apiKeys, auditLog, memberships, roles } from '@appkit/db'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageContainer } from '@appkit/ui'
import { getSession } from '../../../lib/server/session'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard — appkit' }

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const { ctx, tenant, user } = session

  // Every count below runs RLS-scoped to this tenant via ctx.db. Sequential on
  // purpose: ctx.db pins ONE transaction client, and a single pg client can't
  // execute parallel queries.
  const [members, roleCount, keys, auditRows] = await ctx.db(async (db) => {
    const [m] = await db.select({ n: count() }).from(memberships)
    const [r] = await db.select({ n: count() }).from(roles)
    const [k] = await db.select({ n: count() }).from(apiKeys)
    const [a] = await db.select({ n: count() }).from(auditLog)
    return [m!.n, r!.n, k!.n, a!.n] as const
  })

  const stats = [
    { label: 'Team members', value: members, icon: <Users className="size-4" /> },
    { label: 'Roles', value: roleCount, icon: <Shield className="size-4" /> },
    { label: 'API keys', value: keys, icon: <KeyRound className="size-4" /> },
    { label: 'Audit events', value: auditRows, icon: <ScrollText className="size-4" /> },
  ]

  return (
    <PageContainer>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-fg-muted">
            {tenant.name} — live data, scoped to this tenant by Postgres row-level security.
          </p>
        </div>
        {user.isSuperAdmin ? <Badge>Super admin</Badge> : null}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm text-fg-muted">
                <span className="text-fg-subtle">{s.icon}</span>
                {s.label}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>This is the real stack</CardTitle>
            <CardDescription>
              Session cookie → RequestContext → RLS-scoped queries → RBAC-gated actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-fg-muted">
            You signed in through @appkit/auth, this page resolved your tenant through
            @appkit/tenant, and every number above came from a query the database itself
            restricted to {tenant.name}. Other tenants exist in this database — you can&apos;t see them.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Try it</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/dashboard/team">Manage the team</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/api-docs">Call the API</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
