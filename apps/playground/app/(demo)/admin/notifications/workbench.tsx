'use client'

import * as React from 'react'
import { NotificationSettings } from '@appkit/notifications/react'
import type { NotificationConfigurationInput, NotificationPolicyInput, NotificationRoutingCategory } from '@appkit/notifications'

const categories: NotificationRoutingCategory[] = [
  { key: 'approvals', label: 'Approvals', description: 'Requests waiting for a decision and completed decisions.', defaultRoles: ['workspace_admin', 'operations_manager'], defaultChannels: ['in_app', 'email'] },
  { key: 'forms', label: 'Forms', description: 'Submissions, assignments, and follow-up work.', defaultRoles: ['operations_manager'], defaultChannels: ['in_app', 'push'] },
  { key: 'reports', label: 'Reports', description: 'Scheduled exports, completed runs, and delivery failures.', defaultRoles: ['workspace_admin'], defaultChannels: ['in_app', 'email'] },
  { key: 'people', label: 'People', description: 'Assignments, invitations, access, and team changes.', defaultRoles: ['workspace_admin'], defaultChannels: ['in_app', 'email'] },
  { key: 'system', label: 'System', description: 'Security, integrations, jobs, and application administration.', defaultRoles: ['workspace_admin'], defaultChannels: ['in_app', 'email', 'push'] },
]

const defaultPolicy: NotificationPolicyInput = { digestMode: 'off', digestHourUtc: 7, quietHours: null, scanEnabled: true, scanCron: '0 6 * * *', scanTimezone: 'UTC' }

export function NotificationRulesWorkbench() {
  const [saved, setSaved] = React.useState<NotificationConfigurationInput | null>(null)
  React.useEffect(() => {
    try {
      const value = window.localStorage.getItem('appkit-demo:notification-configuration:v1')
      if (value) setSaved(JSON.parse(value) as NotificationConfigurationInput)
    } catch {
      // Source defaults remain the active configuration.
    }
  }, [])
  const initial = Object.fromEntries((saved?.settings ?? []).map(({ category, ...setting }) => [category, setting]))
  return <NotificationSettings
    key={saved ? 'saved' : 'defaults'}
    categories={categories}
    roles={[{ key: 'workspace_admin', name: 'Workspace admin' }, { key: 'operations_manager', name: 'Operations manager' }, { key: 'analyst', name: 'Analyst' }]}
    members={[{ value: 'user-alex', label: 'Alex Kim' }, { value: 'user-jordan', label: 'Jordan Lee' }, { value: 'user-morgan', label: 'Morgan Chen' }]}
    groups={[{ value: 'group-operations', label: 'Operations' }, { value: 'group-reviewers', label: 'Reviewers' }]}
    initial={initial}
    policy={saved?.policy ?? defaultPolicy}
    channelAvailability={{ email: 'ready', push: 'ready', sms: 'unconfigured' }}
    channelSettingsHrefs={{ email: '/packages/emails', sms: '/packages/sms' }}
    adapter={{ async save(input) { window.localStorage.setItem('appkit-demo:notification-configuration:v1', JSON.stringify(input)); setSaved(input) } }}
  />
}
