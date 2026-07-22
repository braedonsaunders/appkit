'use client'

import * as React from 'react'
import { ProductionNotificationPreferences, PushDeviceNotifications } from '@appkit/notifications/react'
import type { NotificationPreference } from '@appkit/notifications'
import { notificationCatalog } from '../workbench'

export function NotificationPreferencesWorkbench() {
  const [preferences, setPreferences] = React.useState<NotificationPreference[]>([])
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem('appkit-demo:notification-preferences:v1')
      if (stored) setPreferences(JSON.parse(stored) as NotificationPreference[])
      if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/notification-worker.js')
    } catch {
      // The complete preference editor remains usable with source defaults.
    }
  }, [])
  return <div className="space-y-4">
    <PushDeviceNotifications
      vapidPublicKey={null}
      adapter={{
        async save(subscription) { window.localStorage.setItem('appkit-demo:push-subscription:v1', JSON.stringify(subscription)) },
        async remove() { window.localStorage.removeItem('appkit-demo:push-subscription:v1') },
        async test() { throw new Error('A VAPID delivery adapter is required to send a push notification.') },
      }}
    />
    <ProductionNotificationPreferences
      catalog={notificationCatalog}
      initial={preferences}
      adapter={{ async save(next) { window.localStorage.setItem('appkit-demo:notification-preferences:v1', JSON.stringify(next)); setPreferences(next) } }}
    />
  </div>
}
