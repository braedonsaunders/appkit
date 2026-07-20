'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { NotificationCenter, NotificationPreferences } from '@appkit/notifications/react'
import type { NotificationCatalog, NotificationPreference, NotificationRecord } from '@appkit/notifications'
import { Tabs } from '@appkit/ui'

const catalog: NotificationCatalog = {
  categories: [
    { key: 'projects', label: 'Projects', description: 'Approvals, assignments, and project changes.', defaultChannels: ['in_app', 'email'] },
    { key: 'reports', label: 'Reports', description: 'Scheduled exports and completed report runs.', defaultChannels: ['in_app', 'email'] },
    { key: 'forms', label: 'Forms', description: 'Submissions, sign-offs, and follow-up work.', defaultChannels: ['in_app', 'push'] },
    { key: 'system', label: 'System', description: 'Security and application administration.', defaultChannels: ['in_app', 'email', 'push', 'sms'] },
  ],
}

const seed: NotificationRecord[] = [
  { id: 'n1', tenantId: 'demo', userId: 'demo-user', sourceId: 'approval-184', category: 'projects', type: 'project.approval', title: 'North Tower needs approval', body: 'The contract value changed to $1,840,000.', linkPath: '/workflows', critical: false, occurredAt: new Date('2026-07-20T14:10:00Z') },
  { id: 'n2', tenantId: 'demo', userId: 'demo-user', sourceId: 'report-22', category: 'reports', type: 'report.ready', title: 'Project portfolio is ready', body: 'The scheduled PDF completed successfully.', linkPath: '/reports', critical: false, occurredAt: new Date('2026-07-20T12:30:00Z'), readAt: new Date('2026-07-20T12:40:00Z') },
  { id: 'n3', tenantId: 'demo', userId: 'demo-user', sourceId: 'security-7', category: 'system', type: 'security.key_expiring', title: 'API key expires tomorrow', body: 'Replace the BidWright import key before 9:00 AM.', linkPath: '/api-docs', critical: true, occurredAt: new Date('2026-07-20T11:20:00Z') },
]

export function NotificationsWorkbench() {
  const router = useRouter()
  const [tab, setTab] = React.useState('inbox')
  const [items, setItems] = React.useState(seed)
  const [category, setCategory] = React.useState<string | null>(null)
  const [preferences, setPreferences] = React.useState<NotificationPreference[]>([])
  return (
    <div className="space-y-3">
      <Tabs tabs={[{ value: 'inbox', label: 'Inbox' }, { value: 'preferences', label: 'Preferences' }]} value={tab} onValueChange={setTab} />
      {tab === 'inbox' ? (
        <NotificationCenter
          items={items}
          catalog={catalog}
          selectedCategory={category}
          onCategoryChange={setCategory}
          onOpen={(item) => item.linkPath && router.push(item.linkPath)}
          onMarkRead={(ids) => setItems((current) => current.map((item) => ids === 'all' || ids.includes(item.id) ? { ...item, readAt: new Date() } : item))}
        />
      ) : (
        <NotificationPreferences catalog={catalog} value={preferences} onChange={setPreferences} />
      )}
    </div>
  )
}
