import type { NotificationRecord } from './index'

export type NotificationInboxItem = {
  id: string
  title: string
  body: string | null
  category: string
  linkPath: string | null
  isCritical: boolean
  occurredAt: string
  read: boolean
}

export type NotificationInboxFilter = {
  kind: 'all' | 'unread' | 'critical' | 'todos' | 'category'
  category?: string
  q?: string
}

export type NotificationInboxFolders = {
  total: number
  unread: number
  criticalTotal: number
  criticalUnread: number
  todos: number
  categories: { category: string; total: number; unread: number }[]
}

export type NotificationTodoItem = {
  id: string
  kind: string
  title: string
  subtitle: string | null
  status: string
  dueOn: string | null
  linkPath: string
}

export type NotificationInboxPage = {
  items: NotificationInboxItem[]
  hasMore: boolean
}

export type NotificationInboxAdapter = {
  fetchPage(options?: {
    cursor?: { occurredAt: string; id: string }
    filter?: NotificationInboxFilter
  }): Promise<NotificationInboxPage>
  fetchFolders(): Promise<NotificationInboxFolders>
  fetchTodos(): Promise<NotificationTodoItem[]>
  markRead(id: string): Promise<void>
  markUnread(id: string): Promise<void>
  delete(id: string): Promise<void>
  snooze(id: string, hours: number): Promise<void>
  markAllRead(filter?: NotificationInboxFilter): Promise<void>
}

export function notificationRecordToInboxItem(record: NotificationRecord): NotificationInboxItem {
  return {
    id: record.id,
    title: record.title,
    body: record.body ?? null,
    category: record.category,
    linkPath: record.linkPath ?? null,
    isCritical: record.critical ?? false,
    occurredAt: (record.occurredAt ?? new Date(0)).toISOString(),
    read: Boolean(record.readAt),
  }
}

export function buildNotificationInboxFolders(
  items: readonly NotificationInboxItem[],
  todos = 0,
): NotificationInboxFolders {
  const folders: NotificationInboxFolders = {
    total: 0,
    unread: 0,
    criticalTotal: 0,
    criticalUnread: 0,
    todos,
    categories: [],
  }
  const categories = new Map<string, { category: string; total: number; unread: number }>()
  for (const item of items) {
    folders.total += 1
    if (!item.read) folders.unread += 1
    if (item.isCritical) {
      folders.criticalTotal += 1
      if (!item.read) folders.criticalUnread += 1
    }
    const category = categories.get(item.category) ?? {
      category: item.category,
      total: 0,
      unread: 0,
    }
    category.total += 1
    if (!item.read) category.unread += 1
    categories.set(item.category, category)
  }
  folders.categories = [...categories.values()]
  return folders
}

export function filterNotificationInboxItems(
  items: readonly NotificationInboxItem[],
  filter: NotificationInboxFilter = { kind: 'all' },
): NotificationInboxItem[] {
  const query = filter.q?.trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (filter.kind === 'unread' && item.read) return false
    if (filter.kind === 'critical' && !item.isCritical) return false
    if (filter.kind === 'category' && filter.category !== item.category) return false
    if (query && !`${item.title}\n${item.body ?? ''}`.toLocaleLowerCase().includes(query)) return false
    return filter.kind !== 'todos'
  })
}

/** Exact local count deltas keep the folder rail aligned with optimistic mutations. */
export function applyNotificationInboxDelta(
  folders: NotificationInboxFolders,
  item: NotificationInboxItem,
  action: 'read' | 'unread' | 'delete',
): NotificationInboxFolders {
  const next: NotificationInboxFolders = {
    ...folders,
    categories: folders.categories.map((category) => ({ ...category })),
  }
  const categoryIndex = next.categories.findIndex((entry) => entry.category === item.category)
  const bumpUnread = (delta: number) => {
    next.unread += delta
    if (item.isCritical) next.criticalUnread += delta
    if (categoryIndex >= 0) next.categories[categoryIndex]!.unread += delta
  }

  if (action === 'read' && !item.read) bumpUnread(-1)
  if (action === 'unread' && item.read) bumpUnread(1)
  if (action === 'delete') {
    next.total -= 1
    if (item.isCritical) next.criticalTotal -= 1
    if (!item.read) bumpUnread(-1)
    if (categoryIndex >= 0) {
      next.categories[categoryIndex]!.total -= 1
      if (next.categories[categoryIndex]!.total <= 0) {
        next.categories.splice(categoryIndex, 1)
      }
    }
  }
  return next
}
