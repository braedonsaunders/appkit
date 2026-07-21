import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, id, tenantRef } from '@appkit/db'
import type { NotificationChannel } from './index'

export const notifications = pgTable('notifications', {
  id: id(),
  tenantId: tenantRef(),
  userId: uuid('user_id').notNull(),
  category: text('category').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  linkPath: text('link_path'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  isCritical: boolean('is_critical').notNull().default(false),
  sourceJobId: text('source_job_id'),
  readAt: timestamp('read_at', { withTimezone: true }),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('notifications_user_idx').on(table.tenantId, table.userId, table.occurredAt),
  index('notifications_unread_idx').on(table.tenantId, table.userId, table.readAt),
  uniqueIndex('notifications_source_job_user_ux').on(table.tenantId, table.sourceJobId, table.userId),
])

export const notificationPreferences = pgTable('notification_preferences', {
  id: id(),
  tenantId: tenantRef(),
  userId: uuid('user_id').notNull(),
  category: text('category').notNull(),
  channel: text('channel').$type<NotificationChannel>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  ...auditColumns,
}, (table) => [uniqueIndex('notification_preferences_uniq').on(table.tenantId, table.userId, table.category, table.channel)])

export const webPushSubscriptions = pgTable('webpush_subscriptions', {
  id: id(),
  tenantId: tenantRef(),
  userId: uuid('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  ...auditColumns,
}, (table) => [index('webpush_subscriptions_user_idx').on(table.tenantId, table.userId), uniqueIndex('webpush_subscriptions_endpoint_ux').on(table.endpoint)])

export const tenantNotificationPolicies = pgTable('tenant_notification_policies', {
  id: id(),
  tenantId: tenantRef(),
  digestMode: text('digest_mode').$type<'off' | 'daily' | 'weekly'>().notNull().default('off'),
  digestHourUtc: integer('digest_hour_utc').notNull().default(7),
  quietHours: jsonb('quiet_hours').$type<{ start: number; end: number } | null>().default(null),
  ...auditColumns,
}, (table) => [uniqueIndex('tenant_notification_policies_tenant_ux').on(table.tenantId)])

export const tenantNotificationSettings = pgTable('tenant_notification_settings', {
  id: id(),
  tenantId: tenantRef(),
  category: text('category').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  roleKeys: jsonb('role_keys').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  userIds: jsonb('user_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  groupIds: jsonb('group_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  channels: jsonb('channels').$type<NotificationChannel[]>().notNull().default(sql`'[]'::jsonb`),
  escalation: jsonb('escalation').$type<{ afterDays: number; roleKeys: string[] }[]>().notNull().default(sql`'[]'::jsonb`),
  ...auditColumns,
}, (table) => [uniqueIndex('tenant_notification_settings_category_ux').on(table.tenantId, table.category)])

export const NOTIFICATION_TENANT_TABLES = [
  'notifications',
  'notification_preferences',
  'webpush_subscriptions',
  'tenant_notification_policies',
  'tenant_notification_settings',
] as const
