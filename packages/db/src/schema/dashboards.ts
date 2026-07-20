import { sql } from 'drizzle-orm'
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { InsightQuery, VisualizationKey, VisualizationSettings } from '@appkit/analytics'
import { id, tenantRef } from '../helpers'

export type DashboardWidget = { id: string; x: number; y: number; w: number; h: number }
export type DashboardQuickAction = { id: string; label: string; href: string; iconKey: string; tone: string }
export type DashboardLayout = { widgets: DashboardWidget[]; quickActions?: DashboardQuickAction[] }

/** One personal dashboard per user and tenant, with the same role-default lineage contract as BeaconHS. */
export const userDashboardLayouts = pgTable('user_dashboard_layouts', {
  id: id(),
  tenantId: tenantRef(),
  userId: uuid('user_id').notNull(),
  layout: jsonb('layout').$type<DashboardLayout>().notNull().default(sql`'{"widgets":[]}'::jsonb`),
  sourceRole: text('source_role'),
  isCustomized: boolean('is_customized').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('user_dashboard_layouts_tenant_user_key').on(table.tenantId, table.userId),
  index('user_dashboard_layouts_tenant_idx').on(table.tenantId),
])

export type InsightCardStatus = 'draft' | 'published'

/** Saved semantic query + visualization. Cards are library items and dashboard widgets. */
export const insightCards = pgTable('insight_cards', {
  id: id(),
  tenantId: tenantRef(),
  ownerUserId: uuid('owner_user_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  query: jsonb('query').$type<InsightQuery>().notNull(),
  visualization: text('visualization').$type<VisualizationKey>().notNull().default('table'),
  visualizationSettings: jsonb('visualization_settings').$type<VisualizationSettings>().notNull().default(sql`'{}'::jsonb`),
  status: text('status').$type<InsightCardStatus>().notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('insight_cards_tenant_owner_idx').on(table.tenantId, table.ownerUserId),
  index('insight_cards_tenant_status_idx').on(table.tenantId, table.status),
])

export const DASHBOARD_TENANT_TABLES = ['user_dashboard_layouts', 'insight_cards'] as const
