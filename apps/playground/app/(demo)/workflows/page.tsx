import { PageHeader } from '@appkit/ui'
import { WorkflowWorkbench } from './workbench'

export const metadata = { title: 'Workflows — appkit' }

export default function WorkflowsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 lg:p-6">
      <PageHeader
        title="Workflows"
        description="Create and manage event-driven automations and approval flows."
      />
      <div className="min-h-0 flex-1">
        <WorkflowWorkbench />
      </div>
    </div>
  )
}
