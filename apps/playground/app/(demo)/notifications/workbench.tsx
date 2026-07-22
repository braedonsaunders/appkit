'use client'

import * as React from 'react'
import { AlertTriangle, ClipboardCheck, FileText, Settings, Users } from 'lucide-react'
import { NotificationInbox } from '@appkit/notifications/react'
import {
  buildNotificationInboxFolders,
  filterNotificationInboxItems,
  type NotificationCatalog,
  type NotificationInboxAdapter,
  type NotificationInboxFilter,
  type NotificationInboxItem,
  type NotificationTodoItem,
} from '@appkit/notifications'

export const notificationCatalog: NotificationCatalog = {
  categories: [
    { key: 'approvals', label: 'Approvals', description: 'Requests waiting for a decision.', defaultChannels: ['in_app', 'email'] },
    { key: 'forms', label: 'Forms', description: 'Submissions and follow-up work.', defaultChannels: ['in_app', 'push'] },
    { key: 'reports', label: 'Reports', description: 'Scheduled exports and completed runs.', defaultChannels: ['in_app', 'email'] },
    { key: 'people', label: 'People', description: 'Assignments, access, and team changes.', defaultChannels: ['in_app', 'email'] },
    { key: 'system', label: 'System', description: 'Security and application administration.', defaultChannels: ['in_app', 'email', 'push', 'sms'] },
  ],
}

const seedItems: NotificationInboxItem[] = [
  { id: 'n-12', title: 'Quarterly access review needs approval', body: 'Twelve role changes are ready for your review. Open the workflow to approve or return the request.', category: 'approvals', linkPath: '/workflows', isCritical: false, occurredAt: '2026-07-21T13:48:00.000Z', read: false },
  { id: 'n-11', title: 'A submitted form needs follow-up', body: 'The site review contains two answers that require an owner and due date.', category: 'forms', linkPath: '/forms', isCritical: true, occurredAt: '2026-07-21T12:22:00.000Z', read: false },
  { id: 'n-10', title: 'Portfolio report is ready', body: 'The scheduled PDF finished successfully and is ready to review.', category: 'reports', linkPath: '/reports', isCritical: false, occurredAt: '2026-07-21T10:05:00.000Z', read: true },
  { id: 'n-9', title: 'New member joined the workspace', body: 'Jordan Lee accepted the invitation and received the Project manager role.', category: 'people', linkPath: '/admin/users', isCritical: false, occurredAt: '2026-07-20T20:36:00.000Z', read: false },
  { id: 'n-8', title: 'API credential expires tomorrow', body: 'Replace the import credential before 9:00 AM to avoid an interrupted sync.', category: 'system', linkPath: '/admin/integrations', isCritical: true, occurredAt: '2026-07-20T18:15:00.000Z', read: false },
  { id: 'n-7', title: 'Budget change was approved', body: 'The approval workflow completed and the project record is unlocked.', category: 'approvals', linkPath: '/workflows', isCritical: false, occurredAt: '2026-07-20T15:40:00.000Z', read: true },
  { id: 'n-6', title: 'Monthly operations report is ready', body: 'The spreadsheet export contains 184 rows.', category: 'reports', linkPath: '/reports', isCritical: false, occurredAt: '2026-07-19T16:12:00.000Z', read: true },
  { id: 'n-5', title: 'Form assignment is due Friday', body: 'Complete the equipment handover form before the end of the week.', category: 'forms', linkPath: '/forms', isCritical: false, occurredAt: '2026-07-18T14:05:00.000Z', read: false },
  { id: 'n-4', title: 'Role permissions were updated', body: 'The Operations role can now publish reports and manage schedules.', category: 'people', linkPath: '/admin/users', isCritical: false, occurredAt: '2026-07-17T11:20:00.000Z', read: true },
  { id: 'n-3', title: 'Connector recovered', body: 'The accounting sync completed after two automatic retries.', category: 'system', linkPath: '/admin/integrations', isCritical: false, occurredAt: '2026-07-16T09:32:00.000Z', read: true },
  { id: 'n-2', title: 'Annual review was submitted', body: 'The completed response is ready for sign-off.', category: 'forms', linkPath: '/forms', isCritical: false, occurredAt: '2026-07-15T17:44:00.000Z', read: true },
  { id: 'n-1', title: 'Weekly summary is ready', body: 'Open the report to view activity across all active projects.', category: 'reports', linkPath: '/reports', isCritical: false, occurredAt: '2026-07-14T13:10:00.000Z', read: true },
]

const seedTodos: NotificationTodoItem[] = [
  { id: 'todo-1', kind: 'approval', title: 'Approve the quarterly access review', subtitle: '12 proposed changes', status: 'open', dueOn: 'Jul 23', linkPath: '/workflows' },
  { id: 'todo-2', kind: 'form', title: 'Complete the equipment handover', subtitle: 'Assigned to you', status: 'overdue', dueOn: 'Jul 20', linkPath: '/forms' },
]

const PAGE_SIZE = 7

export function NotificationsWorkbench() {
  const itemsRef = React.useRef(seedItems.map((item) => ({ ...item })))
  const todosRef = React.useRef(seedTodos.map((todo) => ({ ...todo })))

  const adapter = React.useMemo<NotificationInboxAdapter>(() => ({
    async fetchPage(options) {
      const filter = options?.filter ?? { kind: 'all' }
      const filtered = filterNotificationInboxItems(itemsRef.current, filter)
      const cursorIndex = options?.cursor
        ? filtered.findIndex((item) => item.id === options.cursor?.id)
        : -1
      const start = cursorIndex >= 0 ? cursorIndex + 1 : 0
      const page = filtered.slice(start, start + PAGE_SIZE)
      return { items: page.map((item) => ({ ...item })), hasMore: start + PAGE_SIZE < filtered.length }
    },
    async fetchFolders() {
      return buildNotificationInboxFolders(itemsRef.current, todosRef.current.length)
    },
    async fetchTodos() {
      return todosRef.current.map((todo) => ({ ...todo }))
    },
    async markRead(id) {
      itemsRef.current = itemsRef.current.map((item) => item.id === id ? { ...item, read: true } : item)
    },
    async markUnread(id) {
      itemsRef.current = itemsRef.current.map((item) => item.id === id ? { ...item, read: false } : item)
    },
    async delete(id) {
      itemsRef.current = itemsRef.current.filter((item) => item.id !== id)
    },
    async snooze(id) {
      itemsRef.current = itemsRef.current.filter((item) => item.id !== id)
    },
    async markAllRead(filter?: NotificationInboxFilter) {
      const matching = new Set(filterNotificationInboxItems(itemsRef.current, filter).map((item) => item.id))
      itemsRef.current = itemsRef.current.map((item) => matching.has(item.id) ? { ...item, read: true } : item)
    },
  }), [])

  const initialItems = seedItems.slice(0, PAGE_SIZE)
  return (
    <NotificationInbox
      initialItems={initialItems}
      initialHasMore={seedItems.length > PAGE_SIZE}
      initialFolders={buildNotificationInboxFolders(seedItems, seedTodos.length)}
      catalog={notificationCatalog}
      adapter={adapter}
      preferencesHref="/notifications/preferences"
      categoryVisuals={{
        approvals: { Icon: ClipboardCheck, tone: 'primary' },
        forms: { Icon: FileText, tone: 'info' },
        reports: { Icon: FileText, tone: 'success' },
        people: { Icon: Users, tone: 'warning' },
        system: { Icon: Settings, tone: 'danger' },
      }}
      todoVisuals={{
        approval: { Icon: ClipboardCheck, tone: 'primary', label: 'Approval' },
        form: { Icon: AlertTriangle, tone: 'warning', label: 'Form assignment' },
      }}
    />
  )
}
