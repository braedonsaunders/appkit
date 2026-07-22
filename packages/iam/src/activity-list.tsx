'use client'

import { Badge, EmptyState } from '@appkit/ui'
import { History } from 'lucide-react'
import type { AuditEventRecord } from './types'

export function ActivityList({ events }: { events: AuditEventRecord[] }) {
  if (events.length === 0) {
    return <EmptyState icon={<History />} title="No activity yet" description="IAM changes to this record will appear here." />
  }
  return (
    <ol className="divide-y divide-border rounded-lg border border-border">
      {events.map((event) => (
        <li key={event.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={event.action === 'delete' ? 'destructive' : event.action === 'invite' ? 'warning' : event.action === 'insert' || event.action === 'create' ? 'success' : 'secondary'}>{humanize(event.action)}</Badge>
              <span className="text-sm font-medium text-fg">{event.summary ?? humanize(event.recordType)}</span>
            </div>
            <p className="mt-1 text-xs text-fg-muted">{event.actorName ?? 'System'}{event.requestId ? ` · Request ${event.requestId}` : ''}</p>
          </div>
          <time className="whitespace-nowrap text-xs text-fg-subtle" dateTime={event.at.toISOString()}>{event.at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </li>
      ))}
    </ol>
  )
}

function humanize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').split(' ').map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : word).join(' ')
}
