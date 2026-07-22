import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, id, tenantRef } from '@appkit/db'
import type { AppFileKind, AppRunStatus, AppStatus, AppVersionStatus } from './index'
import type { AppBundleFile } from './bundle'
import type { AppManifest } from './manifest'

export const apps = pgTable('apps', {
  id: id(),
  tenantId: tenantRef(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  iconKey: text('icon_key').notNull().default('box'),
  status: text('status').$type<AppStatus>().notNull().default('installed'),
  activeVersionId: uuid('active_version_id'),
  grantedPermissions: jsonb('granted_permissions').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  showInNav: boolean('show_in_nav').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  provisionedObjects: jsonb('provisioned_objects').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  ...auditColumns,
}, (table) => [uniqueIndex('apps_tenant_key_ux').on(table.tenantId, table.key), index('apps_tenant_status_idx').on(table.tenantId, table.status)])

export const appVersions = pgTable('app_versions', {
  id: id(),
  tenantId: tenantRef(),
  appId: uuid('app_id').notNull(),
  version: text('version').notNull(),
  manifest: jsonb('manifest').$type<AppManifest>().notNull(),
  status: text('status').$type<AppVersionStatus>().notNull().default('draft'),
  ...auditColumns,
}, (table) => [uniqueIndex('app_versions_app_version_ux').on(table.appId, table.version), index('app_versions_tenant_app_idx').on(table.tenantId, table.appId)])

export const appFiles = pgTable('app_files', {
  id: id(),
  tenantId: tenantRef(),
  appId: uuid('app_id').notNull(),
  versionId: uuid('version_id').notNull(),
  path: text('path').notNull(),
  kind: text('kind').$type<AppFileKind>().notNull(),
  contentType: text('content_type').notNull().default('text/plain'),
  content: text('content').notNull().default(''),
  isBinary: boolean('is_binary').notNull().default(false),
  size: integer('size').notNull().default(0),
  ...auditColumns,
}, (table) => [uniqueIndex('app_files_version_path_ux').on(table.versionId, table.path), index('app_files_version_kind_idx').on(table.versionId, table.kind)])

export const appStorage = pgTable('app_storage', {
  id: id(),
  tenantId: tenantRef(),
  appId: uuid('app_id').notNull(),
  namespace: text('namespace').notNull().default('default'),
  key: text('key').notNull(),
  value: jsonb('value').$type<unknown>(),
  ...auditColumns,
}, (table) => [uniqueIndex('app_storage_app_namespace_key_ux').on(table.appId, table.namespace, table.key), index('app_storage_tenant_app_idx').on(table.tenantId, table.appId)])

export const appRuns = pgTable('app_runs', {
  id: id(),
  tenantId: tenantRef(),
  appId: uuid('app_id').notNull(),
  versionId: uuid('version_id'),
  endpoint: text('endpoint').notNull(),
  status: text('status').$type<AppRunStatus>().notNull(),
  units: integer('units').notNull().default(0),
  logs: jsonb('logs').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms').notNull().default(0),
  actorId: uuid('actor_id'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('app_runs_tenant_app_at_idx').on(table.tenantId, table.appId, table.at)])

/** Cross-tenant catalogue snapshots. Access policy is intentionally deployment-owned. */
export const appListings = pgTable('app_listings', {
  id: id(),
  publisherTenantId: uuid('publisher_tenant_id').notNull(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  iconKey: text('icon_key').notNull().default('box'),
  version: text('version').notNull(),
  manifest: jsonb('manifest').$type<AppManifest>().notNull(),
  files: jsonb('files').$type<AppBundleFile[]>().notNull().default(sql`'[]'::jsonb`),
  isActive: boolean('is_active').notNull().default(true),
  ...auditColumns,
}, (table) => [uniqueIndex('app_listings_key_ux').on(table.key), index('app_listings_active_name_idx').on(table.isActive, table.name)])

export const APP_TENANT_TABLES = ['apps', 'app_versions', 'app_files', 'app_storage', 'app_runs'] as const
