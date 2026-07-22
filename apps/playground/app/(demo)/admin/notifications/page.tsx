import { PageContainer, PageHeader } from '@appkit/ui'
import { NotificationRulesWorkbench } from './workbench'

export const metadata = { title: 'Notification rules — appkit' }

export default function NotificationRulesPage() {
  return <PageContainer className="space-y-5">
    <PageHeader title="Notification rules" description="Configure delivery, audiences, schedules, and escalation." back={{ href: '/admin', label: 'Administration' }} />
    <NotificationRulesWorkbench />
  </PageContainer>
}
