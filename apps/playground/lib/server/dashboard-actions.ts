'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { audit } from '@appkit/events'
import { insightCards, userDashboardLayouts, type DashboardLayout } from '@appkit/db'
import type { InsightCardDraft, CardPreviewResult, CardStudioResult, DashboardActionResult } from '@appkit/ui'
import { compileQuery, VISUALIZATIONS } from '@appkit/analytics/server'
import { DEMO_ANALYTICS_CATALOG, executeDemoQuery } from './analytics'
import { BUILTIN_DASHBOARD_LAYOUT } from './dashboard'
import { getDemoEnvironment } from './demo-context'

const BUILTIN_WIDGETS = new Set(BUILTIN_DASHBOARD_LAYOUT.widgets.map((widget) => widget.id))

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function validateLayout(layout: DashboardLayout): DashboardLayout {
  if (!layout || !Array.isArray(layout.widgets) || layout.widgets.length > 50) throw new Error('The dashboard layout is invalid.')
  const seen = new Set<string>()
  const widgets = layout.widgets.map((widget) => {
    if (!widget || typeof widget.id !== 'string' || seen.has(widget.id)) throw new Error('Every dashboard card must have a unique ID.')
    if (!BUILTIN_WIDGETS.has(widget.id) && !/^card:[0-9a-f-]{36}$/i.test(widget.id)) throw new Error('The dashboard contains an unknown card.')
    const values = [widget.x, widget.y, widget.w, widget.h]
    if (values.some((value) => !Number.isInteger(value)) || widget.x < 0 || widget.y < 0 || widget.w < 1 || widget.w > 12 || widget.h < 1 || widget.h > 20) throw new Error('A dashboard card has invalid dimensions.')
    seen.add(widget.id)
    return { id: widget.id, x: widget.x, y: widget.y, w: widget.w, h: widget.h }
  })
  return { widgets }
}

export async function saveDashboardLayoutAction(layout: DashboardLayout): Promise<DashboardActionResult> {
  try {
    const safe = validateLayout(layout)
    const { ctx, tenant, user } = await getDemoEnvironment()
    await ctx.db(async (db) => {
      const cardIds = safe.widgets.filter((widget) => widget.id.startsWith('card:')).map((widget) => widget.id.slice(5))
      if (cardIds.length) {
        const existing = await db.select({ id: insightCards.id }).from(insightCards).where(eq(insightCards.tenantId, tenant.id))
        const allowed = new Set(existing.map((card) => card.id))
        if (cardIds.some((id) => !allowed.has(id))) throw new Error('A dashboard card no longer exists.')
      }
      await db.insert(userDashboardLayouts).values({ tenantId: tenant.id, userId: user.id, layout: safe, isCustomized: true })
        .onConflictDoUpdate({ target: [userDashboardLayouts.tenantId, userDashboardLayouts.userId], set: { layout: safe, isCustomized: true, updatedAt: new Date() } })
      await audit(db as never, { tenantId: tenant.id, actorUserId: user.id, entityType: 'dashboard_layout', entityId: user.id, action: 'update', summary: 'Customized personal dashboard', after: safe })
    })
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/customize')
    return { ok: true }
  } catch (error) { return { ok: false, error: errorMessage(error, 'Could not save the dashboard.') } }
}

export async function resetDashboardLayoutAction(): Promise<DashboardActionResult> {
  try {
    const { ctx, tenant, user } = await getDemoEnvironment()
    await ctx.db(async (db) => {
      await db.delete(userDashboardLayouts).where(and(eq(userDashboardLayouts.tenantId, tenant.id), eq(userDashboardLayouts.userId, user.id)))
      await audit(db as never, { tenantId: tenant.id, actorUserId: user.id, entityType: 'dashboard_layout', entityId: user.id, action: 'update', summary: 'Reset personal dashboard' })
    })
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/customize')
    return { ok: true }
  } catch (error) { return { ok: false, error: errorMessage(error, 'Could not reset the dashboard.') } }
}

function validateDraft(draft: InsightCardDraft) {
  const name = draft.name.trim()
  if (!name || name.length > 120) throw new Error('Give the card a name of 120 characters or fewer.')
  if (draft.description && draft.description.length > 500) throw new Error('Descriptions can be at most 500 characters.')
  if (draft.status !== 'draft' && draft.status !== 'published') throw new Error('The card status is invalid.')
  if (!(draft.visualization in VISUALIZATIONS)) throw new Error('The visualization is invalid.')
  if (JSON.stringify({ query: draft.query, settings: draft.visualizationSettings }).length > 25_000) throw new Error('The card definition is too large.')
  if ((draft.query.measures?.length ?? 0) > 20 || (draft.query.dimensions?.length ?? 0) > 10 || (draft.query.filters?.length ?? 0) > 25) throw new Error('The card contains too many query fields.')
  compileQuery(draft.query, '00000000-0000-0000-0000-000000000000', DEMO_ANALYTICS_CATALOG)
  return { ...draft, name, description: draft.description?.trim() || null }
}

export async function saveInsightCardAction(draft: InsightCardDraft): Promise<CardStudioResult> {
  try {
    const safe = validateDraft(draft)
    const { ctx, tenant, user } = await getDemoEnvironment()
    const id = await ctx.db(async (db) => {
      if (safe.id) {
        const [updated] = await db.update(insightCards).set({ name: safe.name, description: safe.description, query: safe.query, visualization: safe.visualization, visualizationSettings: safe.visualizationSettings, status: safe.status, updatedAt: new Date() })
          .where(and(eq(insightCards.id, safe.id), eq(insightCards.tenantId, tenant.id))).returning({ id: insightCards.id })
        if (!updated) throw new Error('The card no longer exists.')
        await audit(db as never, { tenantId: tenant.id, actorUserId: user.id, entityType: 'insight_card', entityId: updated.id, action: 'update', summary: `Updated ${safe.name}` })
        return updated.id
      }
      const [created] = await db.insert(insightCards).values({ tenantId: tenant.id, ownerUserId: user.id, name: safe.name, description: safe.description, query: safe.query, visualization: safe.visualization, visualizationSettings: safe.visualizationSettings, status: safe.status }).returning({ id: insightCards.id })
      await audit(db as never, { tenantId: tenant.id, actorUserId: user.id, entityType: 'insight_card', entityId: created!.id, action: 'create', summary: `Created ${safe.name}` })
      return created!.id
    })
    revalidatePath('/insights')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/customize')
    return { ok: true, id }
  } catch (error) { return { ok: false, error: errorMessage(error, 'Could not save the card.') } }
}

export async function deleteInsightCardAction(draft: InsightCardDraft): Promise<CardStudioResult> {
  try {
    if (!draft.id) throw new Error('This card has not been saved yet.')
    const { ctx, tenant, user } = await getDemoEnvironment()
    await ctx.db(async (db) => {
      const [deleted] = await db.delete(insightCards).where(and(eq(insightCards.id, draft.id!), eq(insightCards.tenantId, tenant.id))).returning({ id: insightCards.id })
      if (!deleted) throw new Error('The card no longer exists.')
      const layouts = await db.select().from(userDashboardLayouts).where(eq(userDashboardLayouts.tenantId, tenant.id))
      for (const layout of layouts) {
        const next = { ...layout.layout, widgets: layout.layout.widgets.filter((widget) => widget.id !== `card:${draft.id}`) }
        await db.update(userDashboardLayouts).set({ layout: next, updatedAt: new Date() }).where(eq(userDashboardLayouts.id, layout.id))
      }
      await audit(db as never, { tenantId: tenant.id, actorUserId: user.id, entityType: 'insight_card', entityId: deleted.id, action: 'delete', summary: `Deleted ${draft.name}` })
    })
    revalidatePath('/insights')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/customize')
    return { ok: true }
  } catch (error) { return { ok: false, error: errorMessage(error, 'Could not delete the card.') } }
}

export async function publishInsightCardAction(published: boolean, draft: InsightCardDraft): Promise<CardStudioResult> {
  return saveInsightCardAction({ ...draft, status: published ? 'published' : 'draft' })
}

export async function runInsightQueryAction(query: InsightCardDraft['query']): Promise<CardPreviewResult> {
  try { return { ok: true, result: await executeDemoQuery(query) } }
  catch (error) { return { ok: false, error: errorMessage(error, 'The preview query failed.') } }
}
