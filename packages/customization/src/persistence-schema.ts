import { boolean, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, id, tenantRef } from '@appkit/db'
import type { FormLayoutConfig, ListViewConfig } from './types'

/** Tenant-owned form layouts copied from the production customization model. */
export const formLayouts = pgTable('form_layouts', {
  id: id(),
  tenantId: tenantRef(),
  recordType: text('record_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  allowedRoles: jsonb('allowed_roles').$type<string[]>(),
  layout: jsonb('layout').$type<FormLayoutConfig>().notNull(),
  ...auditColumns,
}, (table) => [
  uniqueIndex('form_layouts_tenant_type_name_ux').on(table.tenantId, table.recordType, table.name),
  index('form_layouts_tenant_type_idx').on(table.tenantId, table.recordType, table.isDefault),
])

/** A user's preferred form per record type; null selects the tenant default. */
export const userFormPreferences = pgTable('user_form_preferences', {
  id: id(),
  tenantId: tenantRef(),
  userId: uuid('user_id').notNull(),
  recordType: text('record_type').notNull(),
  layoutId: uuid('layout_id'),
  ...auditColumns,
}, (table) => [
  uniqueIndex('user_form_preferences_tenant_user_type_ux').on(table.tenantId, table.userId, table.recordType),
])

export const LIST_VIEW_SCOPES = ['organization', 'user'] as const
export type PersistedListViewScope = typeof LIST_VIEW_SCOPES[number]

/** Shared and personal saved searches with their complete list configuration. */
export const listViews = pgTable('list_views', {
  id: id(),
  tenantId: tenantRef(),
  recordType: text('record_type').notNull(),
  name: text('name').notNull(),
  scope: text('scope', { enum: LIST_VIEW_SCOPES }).notNull(),
  ownerId: uuid('owner_id'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  config: jsonb('config').$type<ListViewConfig>().notNull(),
  ...auditColumns,
}, (table) => [
  uniqueIndex('list_views_tenant_scope_type_name_ux').on(table.tenantId, table.scope, table.recordType, table.name),
  index('list_views_tenant_type_idx').on(table.tenantId, table.recordType, table.scope),
])

/** A user's preferred list view per record type; null selects the shared default. */
export const userListPreferences = pgTable('user_list_preferences', {
  id: id(),
  tenantId: tenantRef(),
  userId: uuid('user_id').notNull(),
  recordType: text('record_type').notNull(),
  viewId: uuid('view_id'),
  ...auditColumns,
}, (table) => [
  uniqueIndex('user_list_preferences_tenant_user_type_ux').on(table.tenantId, table.userId, table.recordType),
])

export const CUSTOMIZATION_TENANT_TABLES = [
  'form_layouts',
  'user_form_preferences',
  'list_views',
  'user_list_preferences',
] as const
