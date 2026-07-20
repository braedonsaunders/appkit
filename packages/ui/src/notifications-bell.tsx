'use client'

import * as React from 'react'
import { Bell } from 'lucide-react'
import { Popover } from './popover'
import { cn } from './utils'

export type NotificationItem = {
  id: string
  title: string
  body?: string | null
  href?: string | null
  readAt?: string | null
  createdAt: string
}

export type NotificationsBellLabels = {
  ariaLabel: string
  title: string
  markAllRead: string
  empty: string
}

const DEFAULT_LABELS: NotificationsBellLabels = {
  ariaLabel: 'Notifications',
  title: 'Notifications',
  markAllRead: 'Mark all read',
  empty: 'You’re all caught up.',
}

function timeLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function NotificationsBell({
  items,
  onOpenItem,
  onMarkRead,
  labels = DEFAULT_LABELS,
}: {
  items: NotificationItem[]
  onOpenItem?: (item: NotificationItem) => void
  onMarkRead?: (ids: string[] | 'all') => void | Promise<void>
  labels?: NotificationsBellLabels
}) {
  const [open, setOpen] = React.useState(false)
  const unread = items.filter((item) => !item.readAt).length

  function openItem(item: NotificationItem) {
    setOpen(false)
    if (!item.readAt) void onMarkRead?.([item.id])
    onOpenItem?.(item)
  }

  return (
    <Popover open={open} onOpenChange={setOpen} align="end" className="w-80" trigger={<button type="button" onClick={() => setOpen((value) => !value)} aria-label={labels.ariaLabel} aria-expanded={open} aria-haspopup="menu" className="relative grid size-8 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"><Bell size={17} />{unread > 0 ? <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-danger-fg">{unread > 99 ? '99+' : unread}</span> : null}</button>}>
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2.5"><span className="text-sm font-medium text-fg">{labels.title}</span>{unread > 0 && onMarkRead ? <button type="button" onClick={() => void onMarkRead('all')} className="text-xs font-medium text-fg-muted hover:text-fg">{labels.markAllRead}</button> : null}</div>
      <div className="max-h-96 overflow-y-auto">{items.length === 0 ? <p className="px-3 py-6 text-center text-sm text-fg-muted">{labels.empty}</p> : items.map((item) => <button key={item.id} type="button" onClick={() => openItem(item)} className={cn('flex w-full flex-col gap-0.5 border-b border-border-subtle px-3 py-2.5 text-left last:border-b-0 hover:bg-surface-hover', !item.readAt && 'bg-bg-subtle')}><span className="flex items-start gap-2"><span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', item.readAt ? 'bg-transparent' : 'bg-info')} /><span className="min-w-0 flex-1"><span className={cn('block truncate text-sm text-fg', !item.readAt && 'font-medium')}>{item.title}</span>{item.body ? <span className="block truncate text-xs text-fg-muted">{item.body}</span> : null}<span className="block text-[11px] text-fg-subtle">{timeLabel(item.createdAt)}</span></span></span></button>)}</div>
    </Popover>
  )
}
