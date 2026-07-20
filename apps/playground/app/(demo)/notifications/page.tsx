import { PageHeader } from '@appkit/ui'
import { NotificationsWorkbench } from './workbench'

export const metadata = { title: 'Notifications — appkit' }
export default function NotificationsPage() { return <div className="space-y-4 p-4 lg:p-6"><PageHeader title="Inbox and delivery preferences" description="In-app, email, push, and SMS delivery from one notification event." /><NotificationsWorkbench /></div> }
