'use client'

import * as React from 'react'
import {
  ArrowUpRight,
  Bell,
  CheckCheck,
  ChevronLeft,
  Clock,
  Flag,
  Inbox,
  ListChecks,
  Loader2,
  Mail,
  MailOpen,
  Menu,
  RotateCw,
  Search,
  Settings,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, Checkbox, Drawer, Skeleton, UiLink, cn } from '@appkit/ui'
import {
  NOTIFICATION_CHANNELS,
  type NotificationCatalog,
  type NotificationChannel,
  type NotificationPreference,
} from './index'
import {
  applyNotificationInboxDelta,
  type NotificationInboxAdapter,
  type NotificationInboxFilter,
  type NotificationInboxFolders,
  type NotificationInboxItem,
  type NotificationTodoItem,
} from './inbox'

type InboxTone = 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'neutral'

export type NotificationCategoryVisual = {
  Icon?: LucideIcon
  tone?: InboxTone
}

export type NotificationTodoVisual = NotificationCategoryVisual & {
  label?: string
}

export type NotificationInboxCopy = {
  inbox: string
  all: string
  unread: string
  critical: string
  todos: string
  categories: string
  preferences: string
  folders: string
  search: string
  clearSearch: string
  markAllRead: string
  markRead: string
  markUnread: string
  snooze: string
  delete: string
  openRecord: string
  closeDetails: string
  selectTitle: string
  selectDescription: string
  emptyTitle: string
  emptyDescription: string
  emptySearchTitle: string
  emptySearchDescription: string
  emptyTodosTitle: string
  emptyTodosDescription: string
  noBody: string
  endOfInbox: string
  due: string
  item: string
  items: string
  unreadSuffix: (count: number) => string
  loadError: string
  retry: string
}

const DEFAULT_COPY: NotificationInboxCopy = {
  inbox: 'Inbox',
  all: 'All',
  unread: 'Unread',
  critical: 'Critical',
  todos: 'To-dos',
  categories: 'Categories',
  preferences: 'Preferences',
  folders: 'Folders',
  search: 'Search notifications',
  clearSearch: 'Clear search',
  markAllRead: 'Mark all as read',
  markRead: 'Mark as read',
  markUnread: 'Mark as unread',
  snooze: 'Snooze for one day',
  delete: 'Delete',
  openRecord: 'Open record',
  closeDetails: 'Back to notifications',
  selectTitle: 'Select a notification',
  selectDescription: 'Choose a notification from the list to read it here.',
  emptyTitle: 'No notifications',
  emptyDescription: 'New notifications will appear here.',
  emptySearchTitle: 'No matching notifications',
  emptySearchDescription: 'Try a different search term.',
  emptyTodosTitle: 'No outstanding to-dos',
  emptyTodosDescription: 'Assigned work and overdue items will appear here.',
  noBody: 'This notification has no additional details.',
  endOfInbox: 'You’ve reached the end of the inbox.',
  due: 'Due',
  item: 'item',
  items: 'items',
  unreadSuffix: (count) => ` · ${count} unread`,
  loadError: 'The inbox could not be loaded.',
  retry: 'Try again',
}

const TONE_STYLES: Record<InboxTone, { bg: string; fg: string }> = {
  primary: { bg: 'bg-primary-subtle', fg: 'text-primary' },
  info: { bg: 'bg-info-subtle', fg: 'text-info' },
  success: { bg: 'bg-success-subtle', fg: 'text-success' },
  warning: { bg: 'bg-warning-subtle', fg: 'text-warning' },
  danger: { bg: 'bg-danger-subtle', fg: 'text-danger' },
  neutral: { bg: 'bg-bg-subtle', fg: 'text-fg-muted' },
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(true)
  React.useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsDesktop(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return isDesktop
}

function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function filterKey(filter: NotificationInboxFilter) {
  return filter.kind === 'category' ? `category:${filter.category}` : filter.kind
}

function CountPill({ value, active }: { value: number; active?: boolean }) {
  if (value <= 0) return null
  return (
    <span
      className={cn(
        'ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
        active ? 'bg-primary text-primary-fg' : 'bg-bg-subtle text-fg-muted',
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  )
}

function FolderButton({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
        active
          ? 'bg-primary-subtle font-medium text-fg'
          : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-primary' : 'text-fg-subtle')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <CountPill value={count} active={active} />
    </button>
  )
}

function CategoryIcon({
  category,
  visuals,
  size = 16,
}: {
  category: string
  visuals: Record<string, NotificationCategoryVisual> | undefined
  size?: number
}) {
  const visual = visuals?.[category]
  const Icon = visual?.Icon ?? Bell
  const tone = TONE_STYLES[visual?.tone ?? 'neutral']
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', tone.bg)}>
      <Icon size={size} className={tone.fg} />
    </span>
  )
}

function FolderRail({
  folders,
  filter,
  catalog,
  visuals,
  copy,
  preferencesHref,
  onSelect,
  variant,
  className,
}: {
  folders: NotificationInboxFolders
  filter: NotificationInboxFilter
  catalog: NotificationCatalog
  visuals?: Record<string, NotificationCategoryVisual>
  copy: NotificationInboxCopy
  preferencesHref: string
  onSelect: (filter: NotificationInboxFilter) => void
  variant: 'rail' | 'flyout'
  className?: string
}) {
  const active = filterKey(filter)
  const labels = React.useMemo(
    () => new Map(catalog.categories.map((category) => [category.key, category.label])),
    [catalog.categories],
  )
  const categories = React.useMemo(
    () => [...folders.categories].sort((a, b) => (labels.get(a.category) ?? a.category).localeCompare(labels.get(b.category) ?? b.category)),
    [folders.categories, labels],
  )
  const nav = (
    <>
      <div className="space-y-0.5">
        <FolderButton icon={<Inbox size={16} />} label={copy.all} count={folders.unread} active={active === 'all'} onClick={() => onSelect({ kind: 'all' })} />
        <FolderButton icon={<Mail size={16} />} label={copy.unread} count={folders.unread} active={active === 'unread'} onClick={() => onSelect({ kind: 'unread' })} />
        <FolderButton icon={<Flag size={16} />} label={copy.critical} count={folders.criticalUnread} active={active === 'critical'} onClick={() => onSelect({ kind: 'critical' })} />
        <FolderButton icon={<ListChecks size={16} />} label={copy.todos} count={folders.todos} active={active === 'todos'} onClick={() => onSelect({ kind: 'todos' })} />
      </div>
      {categories.length ? (
        <>
          <p className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{copy.categories}</p>
          <div className="space-y-0.5">
            {categories.map((category) => {
              const visual = visuals?.[category.category]
              const Icon = visual?.Icon ?? Bell
              return (
                <FolderButton
                  key={category.category}
                  icon={<Icon size={16} />}
                  label={labels.get(category.category) ?? category.category}
                  count={category.unread}
                  active={active === `category:${category.category}`}
                  onClick={() => onSelect({ kind: 'category', category: category.category })}
                />
              )
            })}
          </div>
        </>
      ) : null}
    </>
  )
  const preferences = (
    <UiLink href={preferencesHref} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg">
      <Settings size={16} className="shrink-0 text-fg-subtle" />
      {copy.preferences}
    </UiLink>
  )

  if (variant === 'flyout') {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
        <div className="mt-2 border-t border-border pt-2">{preferences}</div>
      </div>
    )
  }
  return (
    <aside className={cn('flex-col border-r border-border bg-surface', className)}>
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <Bell size={18} className="text-primary" />
        <span className="text-base font-semibold text-fg">{copy.inbox}</span>
      </div>
      <nav className="app-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">{nav}</nav>
      <div className="border-t border-border p-2">{preferences}</div>
    </aside>
  )
}

function MessageRow({
  item,
  label,
  visuals,
  copy,
  selected,
  onOpen,
  onToggleRead,
  onDelete,
}: {
  item: NotificationInboxItem
  label: string
  visuals?: Record<string, NotificationCategoryVisual>
  copy: NotificationInboxCopy
  selected: boolean
  onOpen: () => void
  onToggleRead: () => void
  onDelete: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group relative flex cursor-pointer gap-3 border-b border-border-subtle px-3 py-2.5 transition-colors sm:px-4',
        selected ? 'bg-primary-subtle/70' : 'hover:bg-surface-hover',
      )}
    >
      {!item.read ? <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" aria-hidden /> : null}
      <CategoryIcon category={item.category} visuals={visuals} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('min-w-0 truncate text-xs', item.read ? 'text-fg-muted' : 'font-semibold text-fg')}>{label}</span>
          <time suppressHydrationWarning className="ml-auto shrink-0 text-[11px] whitespace-nowrap text-fg-subtle group-hover:opacity-0">{relativeTime(item.occurredAt)}</time>
        </div>
        <p className={cn('truncate text-sm', item.read ? 'text-fg-muted' : 'font-semibold text-fg')}>{item.title}</p>
        {item.body ? <p className="truncate text-xs text-fg-subtle">{item.body}</p> : null}
        {item.isCritical ? <Badge variant="destructive" className="mt-1 h-4 px-1.5 text-[10px]">{copy.critical}</Badge> : null}
      </div>
      <div className="absolute right-2 top-1.5 hidden items-center gap-0.5 rounded-md bg-surface/95 p-0.5 shadow-sm group-hover:flex group-focus-within:flex">
        <button type="button" onClick={(event) => { event.stopPropagation(); onToggleRead() }} title={item.read ? copy.markUnread : copy.markRead} aria-label={item.read ? copy.markUnread : copy.markRead} className="rounded p-1 text-fg-muted hover:bg-surface-hover hover:text-fg">
          {item.read ? <Mail size={14} /> : <MailOpen size={14} />}
        </button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onDelete() }} title={copy.delete} aria-label={copy.delete} className="rounded p-1 text-fg-muted hover:bg-danger-subtle hover:text-danger">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function TodoRow({ todo, visual, copy }: { todo: NotificationTodoItem; visual?: NotificationTodoVisual; copy: NotificationInboxCopy }) {
  const Icon = visual?.Icon ?? ListChecks
  const tone = TONE_STYLES[visual?.tone ?? 'neutral']
  return (
    <UiLink href={todo.linkPath} className="group flex w-full items-center gap-3 border-b border-border-subtle px-3 py-2.5 text-left transition-colors hover:bg-surface-hover sm:px-4">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', tone.bg)}><Icon size={16} className={tone.fg} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-xs text-fg-muted">{visual?.label ?? todo.kind}</span>
          {todo.dueOn ? <span className={cn('ml-auto shrink-0 text-[11px] whitespace-nowrap', todo.status === 'overdue' ? 'font-medium text-danger' : 'text-fg-subtle')}>{copy.due} {todo.dueOn}</span> : null}
        </div>
        <p className="truncate text-sm font-medium text-fg">{todo.title}</p>
        {todo.subtitle ? <p className="truncate text-xs capitalize text-fg-subtle">{todo.subtitle}</p> : null}
      </div>
      <ArrowUpRight size={15} className="shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </UiLink>
  )
}

function ReadingPane({
  item,
  label,
  visuals,
  copy,
  onToggleRead,
  onDelete,
  onSnooze,
  onClose,
}: {
  item: NotificationInboxItem | null
  label?: string
  visuals?: Record<string, NotificationCategoryVisual>
  copy: NotificationInboxCopy
  onToggleRead: (item: NotificationInboxItem) => void
  onDelete: (item: NotificationInboxItem) => void
  onSnooze: (item: NotificationInboxItem) => void
  onClose?: () => void
}) {
  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-bg-subtle"><Mail size={28} className="text-fg-subtle" /></div>
        <p className="text-sm font-medium text-fg-muted">{copy.selectTitle}</p>
        <p className="max-w-xs text-xs text-fg-subtle">{copy.selectDescription}</p>
      </div>
    )
  }
  const toolbar = (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {onClose ? <button type="button" onClick={onClose} aria-label={copy.closeDetails} className="-ml-1 mr-1 rounded-md p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg lg:hidden"><ChevronLeft size={20} /></button> : null}
      <Button variant="outline" size="sm" onClick={() => onToggleRead(item)}>{item.read ? <Mail size={14} /> : <MailOpen size={14} />}{item.read ? copy.markUnread : copy.markRead}</Button>
      <Button variant="outline" size="sm" onClick={() => onSnooze(item)} title={copy.snooze}><Clock size={14} />{copy.snooze}</Button>
      <Button variant="outline" size="sm" onClick={() => onDelete(item)} className="text-danger hover:bg-danger-subtle"><Trash2 size={14} />{copy.delete}</Button>
      {item.linkPath ? <Button asChild size="sm" className="ml-auto"><UiLink href={item.linkPath}>{copy.openRecord}<ArrowUpRight size={14} /></UiLink></Button> : null}
    </div>
  )
  const header = (
    <div className="flex items-start gap-3">
      <CategoryIcon category={item.category} visuals={visuals} size={18} />
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold leading-snug text-fg">{item.title}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <Badge variant="secondary" className="font-normal">{label ?? item.category}</Badge>
          {item.isCritical ? <Badge variant="destructive">{copy.critical}</Badge> : null}
          <span suppressHydrationWarning>{fullDate(item.occurredAt)}</span>
        </div>
      </div>
    </div>
  )
  const body = (
    <div className="space-y-5">
      {item.body ? <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg-muted">{item.body}</p> : <p className="text-sm text-fg-subtle">{copy.noBody}</p>}
      {item.linkPath ? <Button asChild><UiLink href={item.linkPath}>{copy.openRecord}<ArrowUpRight size={16} /></UiLink></Button> : null}
    </div>
  )
  if (onClose) return <div className="space-y-4">{toolbar}<div className="border-b border-border pb-4">{header}</div>{body}</div>
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-4 border-b border-border px-6 py-4">{toolbar}{header}</div>
      <div className="app-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">{body}</div>
    </div>
  )
}

export type NotificationInboxProps = {
  initialItems: NotificationInboxItem[]
  initialHasMore: boolean
  initialFolders: NotificationInboxFolders
  catalog: NotificationCatalog
  adapter: NotificationInboxAdapter
  categoryVisuals?: Record<string, NotificationCategoryVisual>
  todoVisuals?: Record<string, NotificationTodoVisual>
  preferencesHref?: string
  copy?: Partial<NotificationInboxCopy>
  onError?: (error: unknown) => void
  className?: string
}

export function NotificationInbox({
  initialItems,
  initialHasMore,
  initialFolders,
  catalog,
  adapter,
  categoryVisuals,
  todoVisuals,
  preferencesHref = '/notifications/preferences',
  copy: copyOverrides,
  onError,
  className,
}: NotificationInboxProps) {
  const copy = React.useMemo(() => ({ ...DEFAULT_COPY, ...copyOverrides }), [copyOverrides])
  const labels = React.useMemo(() => new Map(catalog.categories.map((category) => [category.key, category.label])), [catalog.categories])
  const isDesktop = useIsDesktop()
  const [folders, setFolders] = React.useState(initialFolders)
  const [filter, setFilter] = React.useState<NotificationInboxFilter>({ kind: 'all' })
  const [search, setSearch] = React.useState('')
  const [items, setItems] = React.useState(initialItems)
  const [todos, setTodos] = React.useState<NotificationTodoItem[]>([])
  const [hasMore, setHasMore] = React.useState(initialHasMore)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<unknown>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [foldersOpen, setFoldersOpen] = React.useState(false)
  const [, startTransition] = React.useTransition()
  const selected = React.useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId])
  const requestRef = React.useRef(0)
  const firstRun = React.useRef(true)

  const reportError = React.useCallback((nextError: unknown) => {
    setError(nextError)
    onError?.(nextError)
  }, [onError])

  const load = React.useCallback(async (nextFilter: NotificationInboxFilter) => {
    const request = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      if (nextFilter.kind === 'todos') {
        const nextTodos = await adapter.fetchTodos()
        if (request !== requestRef.current) return
        setTodos(nextTodos)
        setItems([])
        setHasMore(false)
      } else {
        const page = await adapter.fetchPage({ filter: nextFilter })
        if (request !== requestRef.current) return
        setItems(page.items)
        setHasMore(page.hasMore)
      }
    } catch (nextError) {
      if (request === requestRef.current) reportError(nextError)
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [adapter, reportError])

  React.useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    void load(filter)
  }, [filter, load])

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      const q = search.trim() || undefined
      setFilter((current) => current.q === q ? current : { ...current, q })
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [search])

  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const loadingMoreRef = React.useRef(false)
  React.useEffect(() => {
    const element = sentinelRef.current
    if (!element || !hasMore) return
    const observer = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting || loadingMoreRef.current) return
      loadingMoreRef.current = true
      try {
        const last = items.at(-1)
        if (!last) return
        const page = await adapter.fetchPage({ cursor: { occurredAt: last.occurredAt, id: last.id }, filter })
        setItems((current) => {
          const seen = new Set(current.map((item) => item.id))
          return [...current, ...page.items.filter((item) => !seen.has(item.id))]
        })
        setHasMore(page.hasMore)
      } catch (nextError) {
        reportError(nextError)
      } finally {
        loadingMoreRef.current = false
      }
    }, { rootMargin: '600px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [adapter, filter, hasMore, items, reportError])

  const recover = React.useCallback(async (nextError: unknown) => {
    reportError(nextError)
    await Promise.all([load(filter), adapter.fetchFolders().then(setFolders).catch(reportError)])
  }, [adapter, filter, load, reportError])

  const setRead = (item: NotificationInboxItem, read: boolean) => {
    if (item.read === read) return
    setFolders((current) => applyNotificationInboxDelta(current, item, read ? 'read' : 'unread'))
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read } : entry))
    startTransition(() => { void (read ? adapter.markRead(item.id) : adapter.markUnread(item.id)).catch(recover) })
  }
  const remove = (item: NotificationInboxItem) => {
    setSelectedId((current) => current === item.id ? null : current)
    setFolders((current) => applyNotificationInboxDelta(current, item, 'delete'))
    setItems((current) => current.filter((entry) => entry.id !== item.id))
    startTransition(() => { void adapter.delete(item.id).catch(recover) })
  }
  const snooze = (item: NotificationInboxItem) => {
    setSelectedId((current) => current === item.id ? null : current)
    setFolders((current) => applyNotificationInboxDelta(current, item, 'delete'))
    setItems((current) => current.filter((entry) => entry.id !== item.id))
    startTransition(() => { void adapter.snooze(item.id, 24).catch(recover) })
  }
  const open = (item: NotificationInboxItem) => {
    setSelectedId(item.id)
    if (!item.read) setRead(item, true)
  }
  const selectFolder = (nextFilter: NotificationInboxFilter) => {
    setFoldersOpen(false)
    setSelectedId(null)
    setSearch('')
    setFilter({ kind: nextFilter.kind, category: nextFilter.category })
  }
  const markAll = async () => {
    setItems((current) => current.map((item) => item.read ? item : { ...item, read: true }))
    try {
      await adapter.markAllRead(filter)
      setFolders(await adapter.fetchFolders())
    } catch (nextError) {
      await recover(nextError)
    }
  }

  const active = React.useMemo(() => {
    if (filter.kind === 'category' && filter.category) {
      const category = folders.categories.find((entry) => entry.category === filter.category)
      return { label: labels.get(filter.category) ?? filter.category, total: category?.total ?? 0, unread: category?.unread ?? 0 }
    }
    if (filter.kind === 'todos') return { label: copy.todos, total: todos.length || folders.todos, unread: 0 }
    if (filter.kind === 'unread') return { label: copy.unread, total: folders.unread, unread: folders.unread }
    if (filter.kind === 'critical') return { label: copy.critical, total: folders.criticalTotal, unread: folders.criticalUnread }
    return { label: copy.all, total: folders.total, unread: folders.unread }
  }, [copy, filter, folders, labels, todos.length])

  const empty = (icon: React.ReactNode, title: string, description: string) => (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-bg-subtle text-fg-subtle">{icon}</div>
      <p className="mt-3 text-sm font-medium text-fg-muted">{title}</p>
      <p className="mt-1 text-xs text-fg-subtle">{description}</p>
    </div>
  )

  const listBody = filter.kind === 'todos'
    ? todos.length
      ? todos.map((todo) => <TodoRow key={todo.id} todo={todo} visual={todoVisuals?.[todo.kind]} copy={copy} />)
      : empty(<ListChecks size={26} />, copy.emptyTodosTitle, copy.emptyTodosDescription)
    : items.length
      ? <>{items.map((item) => <MessageRow key={item.id} item={item} label={labels.get(item.category) ?? item.category} visuals={categoryVisuals} copy={copy} selected={item.id === selectedId} onOpen={() => open(item)} onToggleRead={() => setRead(item, !item.read)} onDelete={() => remove(item)} />)}{hasMore ? <div ref={sentinelRef} className="flex items-center justify-center py-6"><Loader2 size={18} className="animate-spin text-fg-subtle" /></div> : <p className="py-6 text-center text-xs text-fg-subtle">{copy.endOfInbox}</p>}</>
      : empty(<Inbox size={26} />, search.trim() ? copy.emptySearchTitle : copy.emptyTitle, search.trim() ? copy.emptySearchDescription : copy.emptyDescription)

  return (
    <div className={cn('flex h-full min-h-0 bg-bg-subtle', className)}>
      <FolderRail variant="rail" folders={folders} filter={filter} catalog={catalog} visuals={categoryVisuals} copy={copy} preferencesHref={preferencesHref} onSelect={selectFolder} className="hidden w-64 shrink-0 lg:flex" />
      <section className="flex min-w-0 flex-1 flex-col border-r border-border bg-surface lg:w-96 lg:flex-none xl:w-[28rem]">
        <header className="shrink-0 border-b border-border">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
            <button type="button" onClick={() => setFoldersOpen(true)} aria-label={copy.folders} className="-ml-1 rounded-md p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg lg:hidden"><Menu size={20} /></button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-fg">{active.label}</h1>
              <p className="text-[11px] text-fg-subtle">{active.total} {active.total === 1 ? copy.item : copy.items}{active.unread ? copy.unreadSuffix(active.unread) : ''}</p>
            </div>
            {active.unread ? <button type="button" onClick={() => void markAll()} title={copy.markAllRead} aria-label={copy.markAllRead} className="rounded-md p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg"><CheckCheck size={18} /></button> : null}
            <UiLink href={preferencesHref} aria-label={copy.preferences} className="rounded-md p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg lg:hidden"><Settings size={18} /></UiLink>
          </div>
          <div className={cn('px-3 pb-2.5 sm:px-4', filter.kind === 'todos' && 'hidden')}>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="h-9 w-full rounded-lg border border-border bg-bg-subtle pl-8 pr-8 text-base text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-primary focus:bg-surface focus:ring-2 focus:ring-ring/20 sm:text-sm" />
              {search ? <button type="button" onClick={() => setSearch('')} aria-label={copy.clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:text-fg"><X size={14} /></button> : null}
            </div>
          </div>
        </header>
        <div className="app-scroll relative min-h-0 flex-1 overflow-y-auto">
          {loading ? <div className="absolute inset-x-0 top-0 z-10 flex justify-center py-3"><Loader2 size={16} className="animate-spin text-fg-subtle" /></div> : null}
          {error && !loading ? <div role="alert" className="m-3 flex items-center gap-3 rounded-lg border border-danger/25 bg-danger-subtle p-3 text-sm text-danger"><span className="min-w-0 flex-1">{copy.loadError}</span><Button variant="outline" size="sm" onClick={() => void load(filter)}><RotateCw size={14} />{copy.retry}</Button></div> : null}
          {listBody}
        </div>
      </section>
      <section className="hidden min-w-0 flex-1 bg-surface lg:flex"><div className="w-full"><ReadingPane item={selected} label={selected ? labels.get(selected.category) : undefined} visuals={categoryVisuals} copy={copy} onToggleRead={(item) => setRead(item, !item.read)} onDelete={remove} onSnooze={snooze} /></div></section>
      {!isDesktop ? <>
        <Drawer open={foldersOpen} onClose={() => setFoldersOpen(false)} side="left" size="sm" title={copy.folders} disableFullscreen bodyClassName="min-h-0 flex-1 overflow-hidden px-4 py-5"><FolderRail variant="flyout" folders={folders} filter={filter} catalog={catalog} visuals={categoryVisuals} copy={copy} preferencesHref={preferencesHref} onSelect={selectFolder} /></Drawer>
        <Drawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)} size="lg" title={selected?.title} disableFullscreen><ReadingPane item={selected} label={selected ? labels.get(selected.category) : undefined} visuals={categoryVisuals} copy={copy} onToggleRead={(item) => setRead(item, !item.read)} onDelete={(item) => { remove(item); setSelectedId(null) }} onSnooze={(item) => { snooze(item); setSelectedId(null) }} onClose={() => setSelectedId(null)} /></Drawer>
      </> : null}
    </div>
  )
}

export function NotificationInboxSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading inbox" aria-busy="true" className={cn('flex h-full min-h-0 bg-bg-subtle', className)}>
      <div className="hidden w-64 shrink-0 flex-col gap-2 border-r border-border p-3 lg:flex">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-9 w-full rounded-lg" />)}</div>
      <section className="flex min-w-0 flex-1 flex-col border-r border-border bg-surface lg:w-96 lg:flex-none xl:w-[28rem]">
        <div className="shrink-0 space-y-2.5 border-b border-border px-3 py-3 sm:px-4"><Skeleton className="h-5 w-28" /><Skeleton className="h-9 w-full rounded-lg" /></div>
        <div className="flex-1 overflow-hidden">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="flex items-center gap-3 border-b border-border-subtle px-3 py-3 sm:px-4"><Skeleton className="size-9 shrink-0 rounded-full" /><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>)}</div>
      </section>
      <div className="hidden min-w-0 flex-1 items-center justify-center lg:flex"><Skeleton className="size-10 rounded-full" /></div>
    </div>
  )
}

export type NotificationPreferencesProps = {
  catalog: NotificationCatalog
  value: NotificationPreference[]
  onChange: (preferences: NotificationPreference[]) => void
  availableChannels?: NotificationChannel[]
  readOnly?: boolean
  className?: string
}

export function NotificationPreferences({ catalog, value, onChange, availableChannels = [...NOTIFICATION_CHANNELS], readOnly = false, className }: NotificationPreferencesProps) {
  const enabled = (category: string, channel: NotificationChannel) => value.find((item) => item.category === category && item.channel === channel)?.enabled ?? catalog.categories.find((item) => item.key === category)?.defaultChannels.includes(channel) ?? false
  const update = (category: string, channel: NotificationChannel, next: boolean) => onChange([...value.filter((item) => item.category !== category || item.channel !== channel), { category, channel, enabled: next }])
  const gridStyle = { gridTemplateColumns: `minmax(14rem, 1fr) repeat(${availableChannels.length}, minmax(4.5rem, auto))` }
  return <div className={cn('overflow-x-auto rounded-lg border border-border bg-surface', className)}><div className="min-w-[36rem]"><div style={gridStyle} className="grid border-b border-border bg-bg-subtle px-4 py-2 text-xs font-semibold text-fg-muted"><span>Category</span>{availableChannels.map((channel) => <span key={channel} className="text-center capitalize">{channel.replace('_', ' ')}</span>)}</div>{catalog.categories.map((category) => <div key={category.key} style={gridStyle} className="grid items-center border-b border-border-subtle px-4 py-3 last:border-b-0"><span><span className="block text-sm font-medium text-fg">{category.label}</span>{category.description ? <span className="block text-xs text-fg-muted">{category.description}</span> : null}</span>{availableChannels.map((channel) => <span key={channel} className="flex justify-center"><Checkbox aria-label={`${category.label}: ${channel}`} checked={enabled(category.key, channel)} disabled={readOnly} onChange={(event) => update(category.key, channel, event.currentTarget.checked)} /></span>)}</div>)}</div></div>
}
