import { eq, ilike, or } from 'drizzle-orm'
import { memberships, users } from '@appkit/db'
import { assertCan } from '@appkit/tenant'
import { getDemoEnvironment } from '../../../../lib/server/demo-context'
import { DEMO_MEMBERS } from '../../../../lib/server/demo-data'
import { isDatabaseConfigured } from '../../../../lib/server/platform'

const ROUTES = [
  { id: 'dashboard', title: 'Dashboard', subtitle: 'Live tenant overview', href: '/dashboard', iconKey: 'gauge' },
  { id: 'insights', title: 'Insight cards', subtitle: 'Card library and studio', href: '/insights', iconKey: 'library' },
  { id: 'platform', title: 'Platform', subtitle: 'Everything shipped in appkit', href: '/dashboard/platform', iconKey: 'package' },
  { id: 'components', title: 'Components', subtitle: 'Interface component gallery', href: '/components', iconKey: 'sparkles' },
  { id: 'attachments', title: 'Attachments', subtitle: 'Record attachment workspace', href: '/attachments', iconKey: 'file' },
  { id: 'form-engine', title: 'Form engine', subtitle: 'Schemas, validation, and automation', href: '/forms/core', iconKey: 'code' },
  { id: 'admin', title: 'Administration', subtitle: 'Organization settings', href: '/admin', iconKey: 'settings' },
  { id: 'api', title: 'API Docs', subtitle: 'Interactive API reference', href: '/api-docs', iconKey: 'code' },
  { id: 'apps', title: 'Apps', subtitle: 'Installable app builder and sandbox runtime', href: '/admin/apps', iconKey: 'package' },
  { id: 'scripts', title: 'Scripts', subtitle: 'Governed automation code', href: '/admin/scripts', iconKey: 'code' },
] as const

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100) ?? ''
  if (query.length < 2) return Response.json({ groups: [], total: 0 })

  const { ctx } = await getDemoEnvironment()
  assertCan(ctx, 'team.read')
  const members = isDatabaseConfigured()
    ? await ctx.db((db) =>
        db
          .select({ id: memberships.id, name: memberships.displayName, email: users.email })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(or(ilike(memberships.displayName, `%${query}%`), ilike(users.email, `%${query}%`)))
          .limit(8),
      )
    : DEMO_MEMBERS.filter((member) =>
        `${member.name} ${member.email}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ).slice(0, 8)
  const normalized = query.toLocaleLowerCase()
  const routes = ROUTES.filter((route) => `${route.title} ${route.subtitle}`.toLocaleLowerCase().includes(normalized))
  const groups = [
    ...(members.length ? [{ id: 'people', label: 'People', hits: members.map((member) => ({ id: member.id, type: 'person', title: member.name, subtitle: member.email, href: `/admin/users?q=${encodeURIComponent(member.email)}`, iconKey: 'users', badge: 'Member' })) }] : []),
    ...(routes.length ? [{ id: 'pages', label: 'Pages', hits: routes.map((route) => ({ ...route, type: 'page' })) }] : []),
  ]
  return Response.json({ groups, total: members.length + routes.length })
}
