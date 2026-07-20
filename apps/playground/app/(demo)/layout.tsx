import { desc } from 'drizzle-orm'
import { auditLog } from '@appkit/db'
import { cookies } from 'next/headers'
import { getDemoEnvironment } from '../../lib/server/demo-context'
import { DEMO_AUDIT_EVENTS } from '../../lib/server/demo-data'
import { isDatabaseConfigured } from '../../lib/server/platform'
import { AppFrame } from '../../components/app-frame'

export const dynamic = 'force-dynamic'

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const demo = await getDemoEnvironment()
  const storedNavigationMode = (await cookies()).get('appkit-navigation-mode')?.value
  const activity = isDatabaseConfigured()
    ? await demo.ctx.db((db) =>
        db
          .select({
            id: auditLog.id,
            action: auditLog.action,
            entityType: auditLog.entityType,
            summary: auditLog.summary,
            createdAt: auditLog.createdAt,
          })
          .from(auditLog)
          .orderBy(desc(auditLog.createdAt))
          .limit(8),
      )
    : DEMO_AUDIT_EVENTS.slice(0, 8)
  return (
    <AppFrame
      tenantName={demo.tenant.name}
      tenantSlug={demo.tenant.slug}
      userName={demo.user.name}
      userEmail={demo.user.email}
      isSuperAdmin={demo.user.isSuperAdmin}
      activity={activity.map((item) => ({
        id: item.id,
        title: item.summary ?? `${item.action} ${item.entityType}`,
        body: `${item.action} · ${item.entityType}`,
        href: '/admin/audit',
        readAt: item.createdAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
      }))}
      initialNavigationMode={storedNavigationMode === 'sidebar' ? 'sidebar' : 'topbar'}
    >
      {children}
    </AppFrame>
  )
}
