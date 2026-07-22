import { PageHeader } from '@appkit/ui'
import { NotificationPreferencesWorkbench } from './workbench'

export const metadata = { title: 'Notification preferences — appkit' }

export default function NotificationPreferencesPage() {
  return (
    <div className="app-scroll h-full overflow-y-auto p-4 lg:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader title="Notification preferences" description="Choose which channels each category can use." back={{ href: '/notifications', label: 'Inbox' }} />
        <NotificationPreferencesWorkbench />
      </div>
    </div>
  )
}
