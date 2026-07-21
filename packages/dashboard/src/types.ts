import type {
  InsightQuery,
  QueryResult,
  VisualizationKey,
  VisualizationSettings,
} from '@appkit/analytics'

export type DashboardWidget = { id: string; x: number; y: number; w: number; h: number }
export type DashboardQuickAction = { id: string; label: string; href: string; iconKey: string; tone: string }
export type DashboardLayout = { widgets: DashboardWidget[]; quickActions?: DashboardQuickAction[] }

export type DashboardLibraryItem = {
  id: string
  label: string
  description: string
  category: string
  defaultSize: { w: number; h: number }
  minSize: { w: number; h: number }
  maxSize?: { w?: number; h?: number }
  kind?: 'widget' | 'card'
}

export type DashboardActionResult = { ok: true } | { ok: false; error: string }
export type DashboardStatus = 'draft' | 'published'
export type DashboardDraft = {
  id?: string
  name: string
  description?: string | null
  status: DashboardStatus
  pinned?: boolean
  layout: DashboardLayout
}
export type DashboardStudioAdapter = {
  save(draft: DashboardDraft): Promise<DashboardActionResult>
  publish?(published: boolean, draft: DashboardDraft): Promise<DashboardActionResult>
  pin?(pinned: boolean, draft: DashboardDraft): Promise<DashboardActionResult>
  remove?(draft: DashboardDraft): Promise<DashboardActionResult>
}
export type InsightCardStatus = 'draft' | 'published'
export type InsightCardDraft = {
  id?: string
  name: string
  description?: string | null
  query: InsightQuery
  visualization: VisualizationKey
  visualizationSettings: VisualizationSettings
  status: InsightCardStatus
}
export type CardStudioResult = { ok: true; id?: string } | { ok: false; error: string }
export type CardPreviewResult = { ok: true; result: QueryResult } | { ok: false; error: string }
