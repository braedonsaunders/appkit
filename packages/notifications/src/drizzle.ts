import { and, desc, eq, ilike, inArray, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { notificationPreferences, notifications, webPushSubscriptions } from './schema'
import type {
  NotificationChannel,
  NotificationEvent,
  NotificationInboxAdapter,
  NotificationInboxFilter,
  NotificationInboxItem,
  NotificationRecord,
  NotificationRecipient,
  NotificationStore,
  NotificationTodoItem,
} from './index'

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

export type DrizzleNotificationInboxOptions = {
  tenantId: string
  userId: string
  pageSize?: number
  fetchTodos?: () => Promise<NotificationTodoItem[]>
  now?: () => Date
}

/**
 * Bind the production inbox to an already RLS-scoped database handle. Tenant
 * and user predicates remain explicit as defense in depth; domain to-dos stay
 * behind an application callback because their source tables are not owned by
 * the notification package.
 */
export function createDrizzleNotificationInboxAdapter(
  db: Db,
  options: DrizzleNotificationInboxOptions,
): NotificationInboxAdapter {
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 30))
  const now = options.now ?? (() => new Date())

  const filterConditions = (filter?: NotificationInboxFilter): SQL[] => {
    const conditions: SQL[] = [
      eq(notifications.tenantId, options.tenantId),
      eq(notifications.userId, options.userId),
      or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, now())) as SQL,
    ]
    if (filter?.kind === 'unread') conditions.push(isNull(notifications.readAt))
    if (filter?.kind === 'critical') conditions.push(eq(notifications.isCritical, true))
    if (filter?.kind === 'category' && filter.category) {
      conditions.push(eq(notifications.category, filter.category))
    }
    const query = filter?.q?.trim()
    if (query) {
      const like = `%${query}%`
      conditions.push(or(ilike(notifications.title, like), ilike(notifications.body, like)) as SQL)
    }
    return conditions
  }

  return {
    async fetchPage(request) {
      if (request?.filter?.kind === 'todos') return { items: [], hasMore: false }
      const conditions = filterConditions(request?.filter)
      if (request?.cursor) {
        conditions.push(
          or(
            lt(notifications.occurredAt, new Date(request.cursor.occurredAt)),
            and(
              eq(notifications.occurredAt, new Date(request.cursor.occurredAt)),
              lt(notifications.id, request.cursor.id),
            ),
          ) as SQL,
        )
      }
      const rows = await db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.occurredAt), desc(notifications.id))
        .limit(pageSize + 1)
      return {
        items: rows.slice(0, pageSize).map(toInboxItem),
        hasMore: rows.length > pageSize,
      }
    },
    async fetchFolders() {
      const rows = await db
        .select({
          category: notifications.category,
          total: sql<number>`count(*)::int`,
          unread: sql<number>`(count(*) filter (where ${notifications.readAt} is null))::int`,
          criticalTotal: sql<number>`(count(*) filter (where ${notifications.isCritical}))::int`,
          criticalUnread: sql<number>`(count(*) filter (where ${notifications.isCritical} and ${notifications.readAt} is null))::int`,
        })
        .from(notifications)
        .where(and(...filterConditions()))
        .groupBy(notifications.category)
      const folders = rows.reduce(
        (acc, row) => {
          acc.total += row.total
          acc.unread += row.unread
          acc.criticalTotal += row.criticalTotal
          acc.criticalUnread += row.criticalUnread
          acc.categories.push({ category: row.category, total: row.total, unread: row.unread })
          return acc
        },
        {
          total: 0,
          unread: 0,
          criticalTotal: 0,
          criticalUnread: 0,
          todos: 0,
          categories: [] as { category: string; total: number; unread: number }[],
        },
      )
      folders.todos = options.fetchTodos ? (await options.fetchTodos()).length : 0
      return folders
    },
    async fetchTodos() {
      return options.fetchTodos?.() ?? []
    },
    async markRead(id) {
      await db.update(notifications).set({ readAt: now() }).where(and(
        eq(notifications.id, id),
        eq(notifications.tenantId, options.tenantId),
        eq(notifications.userId, options.userId),
      ))
    },
    async markUnread(id) {
      await db.update(notifications).set({ readAt: null }).where(and(
        eq(notifications.id, id),
        eq(notifications.tenantId, options.tenantId),
        eq(notifications.userId, options.userId),
      ))
    },
    async delete(id) {
      await db.delete(notifications).where(and(
        eq(notifications.id, id),
        eq(notifications.tenantId, options.tenantId),
        eq(notifications.userId, options.userId),
      ))
    },
    async snooze(id, hours) {
      const boundedHours = Math.min(720, Math.max(1, Math.round(hours)))
      await db.update(notifications).set({
        snoozedUntil: new Date(now().getTime() + boundedHours * 60 * 60 * 1_000),
      }).where(and(
        eq(notifications.id, id),
        eq(notifications.tenantId, options.tenantId),
        eq(notifications.userId, options.userId),
      ))
    },
    async markAllRead(filter) {
      await db.update(notifications).set({ readAt: now() }).where(and(
        ...filterConditions(filter),
        isNull(notifications.readAt),
      ))
    },
  }
}

export function createDrizzlePushSubscriptionStore(db: Db) {
  return {
    async upsert(input: { tenantId: string; userId: string; endpoint: string; p256dh: string; auth: string; userAgent?: string | null }) {
      const [row] = await db.insert(webPushSubscriptions).values(input).onConflictDoUpdate({
        target: webPushSubscriptions.endpoint,
        set: { tenantId: input.tenantId, userId: input.userId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent ?? null, updatedAt: new Date() },
      }).returning()
      if (!row) throw new Error('Push subscription was not visible after upsert')
      return row
    },
    async find(input: { tenantId: string; userId: string; subscriptionId: string }) {
      const [row] = await db.select().from(webPushSubscriptions).where(and(eq(webPushSubscriptions.id, input.subscriptionId), eq(webPushSubscriptions.tenantId, input.tenantId), eq(webPushSubscriptions.userId, input.userId))).limit(1)
      return row ?? null
    },
    async remove(input: { tenantId: string; userId: string; subscriptionId?: string; endpoint?: string }) {
      if (!input.subscriptionId && !input.endpoint) throw new Error('A subscription id or endpoint is required')
      await db.delete(webPushSubscriptions).where(and(eq(webPushSubscriptions.tenantId, input.tenantId), eq(webPushSubscriptions.userId, input.userId), input.subscriptionId ? eq(webPushSubscriptions.id, input.subscriptionId) : eq(webPushSubscriptions.endpoint, input.endpoint!)))
    },
  }
}

function toRecord(row: typeof notifications.$inferSelect, event: NotificationEvent): NotificationRecord { return { ...event, id: row.id, userId: row.userId, body: row.body ?? undefined, linkPath: row.linkPath ?? undefined, data: row.data, critical: row.isCritical, occurredAt: row.occurredAt, readAt: row.readAt, snoozedUntil: row.snoozedUntil } }

function toInboxItem(row: typeof notifications.$inferSelect): NotificationInboxItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    linkPath: row.linkPath,
    isCritical: row.isCritical,
    occurredAt: row.occurredAt.toISOString(),
    read: Boolean(row.readAt),
  }
}

export {
  notifications,
  notificationPreferences,
  webPushSubscriptions,
  tenantNotificationPolicies,
  tenantNotificationSettings,
  NOTIFICATION_TENANT_TABLES,
} from './schema'
