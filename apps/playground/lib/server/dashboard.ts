import 'server-only'

import { and, asc, eq } from 'drizzle-orm'
import { insightCards, userDashboardLayouts, type DashboardLayout } from '@appkit/db'
import type { InsightCardDraft } from '@appkit/ui'
import { getDemoEnvironment } from './demo-context'

export const BUILTIN_DASHBOARD_LAYOUT: DashboardLayout = {
  widgets: [
    { id: 'metric:members', x: 0, y: 0, w: 3, h: 2 },
    { id: 'metric:roles', x: 3, y: 0, w: 3, h: 2 },
    { id: 'metric:auth', x: 6, y: 0, w: 3, h: 2 },
    { id: 'metric:audit', x: 9, y: 0, w: 3, h: 2 },
    { id: 'panel:quick-actions', x: 0, y: 2, w: 4, h: 5 },
    { id: 'panel:platform', x: 4, y: 2, w: 8, h: 5 },
  ],
}

export async function loadDashboardData() {
  const { ctx, tenant, user } = await getDemoEnvironment()
  return ctx.db(async (db) => {
    const [personal] = await db.select({ layout: userDashboardLayouts.layout }).from(userDashboardLayouts)
      .where(and(eq(userDashboardLayouts.tenantId, tenant.id), eq(userDashboardLayouts.userId, user.id))).limit(1)
    const cards = await db.select().from(insightCards).where(eq(insightCards.tenantId, tenant.id)).orderBy(asc(insightCards.name))
    return { layout: personal?.layout ?? BUILTIN_DASHBOARD_LAYOUT, cards }
  })
}

export async function loadInsightCards(): Promise<InsightCardDraft[]> {
  const { ctx, tenant } = await getDemoEnvironment()
  return ctx.db(async (db) => (await db.select().from(insightCards).where(eq(insightCards.tenantId, tenant.id)).orderBy(asc(insightCards.name))).map((card) => ({
    id: card.id,
    name: card.name,
    description: card.description,
    query: card.query,
    visualization: card.visualization,
    visualizationSettings: card.visualizationSettings,
    status: card.status,
  })))
}
