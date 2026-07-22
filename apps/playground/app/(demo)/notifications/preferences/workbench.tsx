'use client'

import * as React from 'react'
import { NotificationPreferences } from '@appkit/notifications/react'
import type { NotificationPreference } from '@appkit/notifications'
import { notificationCatalog } from '../workbench'

export function NotificationPreferencesWorkbench() {
  const [preferences, setPreferences] = React.useState<NotificationPreference[]>([])
  return <NotificationPreferences catalog={notificationCatalog} value={preferences} onChange={setPreferences} />
}
