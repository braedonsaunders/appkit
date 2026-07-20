import Link from 'next/link'
import { count, desc } from 'drizzle-orm'
import {
  Activity, BookOpen, Boxes, Code2, CreditCard, Library, LockKeyhole,
  ScrollText, Shield, Sparkles, Users,
} from 'lucide-react'
import { apiKeys, auditLog, memberships, roles } from '@appkit/db'
import {
  AnimatedNumber, Badge, Button, Sparkline,
} from '@appkit/ui'
import type { DashboardLibraryItem } from '@appkit/dashboard'
import { DashboardMetricCard, DashboardPanel, InsightCard } from '@appkit/dashboard/react'
import { getDemoEnvironment } from '../../../lib/server/demo-context'
import { executeDemoQuery } from '../../../lib/server/analytics'
import { loadDashboardData } from '../../../lib/server/dashboard'
import { resetDashboardLayoutAction, saveDashboardLayoutAction } from '../../../lib/server/dashboard-actions'
import { DEMO_AUDIT_EVENTS, DEMO_MEMBERS, DEMO_ROLES } from '../../../lib/server/demo-data'
import { isDatabaseConfigured } from '../../../lib/server/platform'
import { DashboardGridController } from './_dashboard-grid-controller'

const BUILTINS: DashboardLibraryItem[] = [
  { id: 'metric:members', label: 'Team members', description: 'Active workspace memberships', category: 'headlines', defaultSize: { w: 3, h: 2 }, minSize: { w: 2, h: 2 }, maxSize: { h: 2 } },
  { id: 'metric:roles', label: 'Roles', description: 'Configured access roles', category: 'headlines', defaultSize: { w: 3, h: 2 }, minSize: { w: 2, h: 2 }, maxSize: { h: 2 } },
  { id: 'metric:auth', label: 'Authentication', description: 'Current access configuration', category: 'headlines', defaultSize: { w: 3, h: 2 }, minSize: { w: 2, h: 2 }, maxSize: { h: 2 } },
  { id: 'metric:audit', label: 'Audit events', description: 'Append-only platform activity', category: 'headlines', defaultSize: { w: 3, h: 2 }, minSize: { w: 2, h: 2 }, maxSize: { h: 2 } },
  { id: 'panel:quick-actions', label: 'Quick actions', description: 'Common workspace actions', category: 'workspace', defaultSize: { w: 4, h: 5 }, minSize: { w: 3, h: 4 } },
  { id: 'panel:platform', label: 'Dashboard capabilities', description: 'Cards, queries, layouts, and visualizations', category: 'workspace', defaultSize: { w: 8, h: 5 }, minSize: { w: 5, h: 4 } },
]

export async function DashboardExperience({ mode }: { mode: 'view' | 'edit' }) {
  const databaseConfigured = isDatabaseConfigured()
  const [members, roleCount, keys, audits, recentAudits] = databaseConfigured
    ? await (await getDemoEnvironment()).ctx.db(async (db) => {
        const [memberRows] = await db.select({ n: count() }).from(memberships)
        const [roleRows] = await db.select({ n: count() }).from(roles)
        const [keyRows] = await db.select({ n: count() }).from(apiKeys)
        const [auditRows] = await db.select({ n: count() }).from(auditLog)
        const recentAuditRows = await db.select({ createdAt: auditLog.createdAt }).from(auditLog).orderBy(desc(auditLog.createdAt)).limit(30)
        return [memberRows!.n, roleRows!.n, keyRows!.n, auditRows!.n, recentAuditRows] as const
      })
    : [
        DEMO_MEMBERS.length,
        DEMO_ROLES.length,
        0,
        DEMO_AUDIT_EVENTS.length,
        DEMO_AUDIT_EVENTS.map(({ createdAt }) => ({ createdAt })),
      ] as const
  const auditByDay = new Map<string, number>()
  for (const row of recentAudits) {
    const day = row.createdAt.toISOString().slice(0, 10)
    auditByDay.set(day, (auditByDay.get(day) ?? 0) + 1)
  }
  const auditTrend = [...auditByDay.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value)
  if (auditTrend.length === 1) auditTrend.push(auditTrend[0]!)
  const { layout, cards } = await loadDashboardData()
  const nodes: Record<string, React.ReactNode> = {
    'metric:members': <DashboardMetricCard label="Team members" value={<AnimatedNumber value={members} />} detail="Workspace memberships" icon={<Users size={18} />} tone="primary" />,
    'metric:roles': <DashboardMetricCard label="Roles" value={<AnimatedNumber value={roleCount} />} detail="Permission groups" icon={<Shield size={18} />} tone="info" />,
    'metric:auth': <DashboardMetricCard label="Authentication" value={keys === 0 ? 'Disabled' : 'Enabled'} detail={`${keys} active API credentials`} icon={<LockKeyhole size={18} />} tone="success" />,
    'metric:audit': <DashboardMetricCard label="Audit events" value={<AnimatedNumber value={audits} />} detail="Append-only activity" icon={<ScrollText size={18} />} trend={auditTrend.length >= 2 ? <Sparkline points={auditTrend} stroke="var(--color-warning)" area className="size-full" ariaLabel="Recent audit activity trend" /> : undefined} tone="warning" />,
    'panel:quick-actions': <DashboardPanel title="Quick actions" icon={<Sparkles size={16} />}><div className="grid gap-2">
      <QuickAction href="/insights?new=1" icon={<CreditCard size={16} />} label="Build an insight card" />
      <QuickAction href="/admin/users" icon={<Users size={16} />} label="Manage users" />
      <QuickAction href="/api-docs" icon={<Code2 size={16} />} label="Explore the API" />
      <QuickAction href="/dashboard/platform" icon={<Boxes size={16} />} label="View platform capabilities" />
    </div></DashboardPanel>,
    'panel:platform': <DashboardPanel title="Dashboard capabilities" icon={<Activity size={16} />} actions={<Badge variant="success">Live</Badge>}><div className="grid h-full content-center gap-4 sm:grid-cols-2">
      <Feature icon={<Library />} title="Card library" text="Reusable tenant-owned cards can be drafted, published, and dropped onto any dashboard." />
      <Feature icon={<Code2 />} title="Safe query language" text="Approved fields, bound filters, and validated formulas keep reporting queries controlled." />
      <Feature icon={<Activity />} title="15 visualizations" text="Numbers, tables, pivots, heatmaps, comparison, trend, proportion, gauge, funnel, and scatter views share one result contract." />
      <Feature icon={<BookOpen />} title="Shared dashboard model" text="Layouts, saved cards, editing tools, and rendering stay consistent." />
    </div></DashboardPanel>,
  }

  for (const card of cards) {
    try {
      const result = await executeDemoQuery(card.query)
      nodes[`card:${card.id}`] = <InsightCard title={card.name} description={card.description} result={result} visualization={card.visualization} settings={card.visualizationSettings} />
    } catch (error) {
      nodes[`card:${card.id}`] = <DashboardPanel title={card.name}><div role="alert" className="grid h-full place-items-center px-6 text-center text-sm text-danger">{error instanceof Error ? error.message : 'This query could not run.'}</div></DashboardPanel>
    }
  }
  const items: DashboardLibraryItem[] = [...BUILTINS, ...cards.map((card) => ({ id: `card:${card.id}`, label: card.name, description: card.description || `${card.visualization} insight`, category: 'insights', kind: 'card' as const, defaultSize: { w: 6, h: 5 }, minSize: { w: 3, h: 3 } }))]
  return <DashboardGridController initialLayout={layout} nodes={nodes} items={items} mode={mode} onSave={saveDashboardLayoutAction} onReset={resetDashboardLayoutAction} browserPersistence={!databaseConfigured} />
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return <Button variant="outline" className="h-11 justify-start" asChild><Link href={href}><span className="text-primary">{icon}</span>{label}</Link></Button>
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex gap-3"><span className="mt-0.5 text-primary [&_svg]:size-4">{icon}</span><div><h4 className="text-sm font-semibold text-fg">{title}</h4><p className="mt-1 text-xs leading-relaxed text-fg-muted">{text}</p></div></div>
}
