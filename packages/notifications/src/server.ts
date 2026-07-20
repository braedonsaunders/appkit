import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { notificationPreferences, notifications } from '@appkit/db/schema'
import type { NotificationChannel, NotificationEvent, NotificationRecord, NotificationRecipient, NotificationStore } from './index'

type Db = NodePgDatabase<Record<string, never>>

export function createDrizzleNotificationStore(db: Db): NotificationStore {
  return {
    async preferences(tenantId, userIds, category) {
      const map = new Map<string, Map<NotificationChannel, boolean>>()
      if (!userIds.length) return map
      const rows = await db.select({ userId: notificationPreferences.userId, channel: notificationPreferences.channel, enabled: notificationPreferences.enabled }).from(notificationPreferences).where(and(eq(notificationPreferences.tenantId, tenantId), eq(notificationPreferences.category, category), inArray(notificationPreferences.userId, userIds)))
      for (const row of rows) { const user = map.get(row.userId) ?? new Map<NotificationChannel, boolean>(); user.set(row.channel, row.enabled); map.set(row.userId, user) }
      return map
    },
    async insert(event: NotificationEvent, recipient: NotificationRecipient) {
      const occurredAt = event.occurredAt ?? new Date()
      const [inserted] = await db.insert(notifications).values({ tenantId: event.tenantId, userId: recipient.userId, category: event.category, type: event.type, title: event.title, body: event.body, linkPath: event.linkPath, data: event.data ?? {}, isCritical: event.critical ?? false, sourceJobId: event.sourceId, occurredAt }).onConflictDoNothing({ target: [notifications.tenantId, notifications.sourceJobId, notifications.userId] }).returning()
      if (inserted) return { record: toRecord(inserted, event), created: true }
      const [existing] = await db.select().from(notifications).where(and(eq(notifications.tenantId, event.tenantId), eq(notifications.sourceJobId, event.sourceId), eq(notifications.userId, recipient.userId))).limit(1)
      if (!existing) throw new Error('Notification conflict was not visible after insertion')
      return { record: toRecord(existing, event), created: false }
    },
  }
}

function toRecord(row: typeof notifications.$inferSelect, event: NotificationEvent): NotificationRecord { return { ...event, id: row.id, userId: row.userId, body: row.body ?? undefined, linkPath: row.linkPath ?? undefined, data: row.data, critical: row.isCritical, occurredAt: row.occurredAt, readAt: row.readAt, snoozedUntil: row.snoozedUntil } }
