import { PageHeader } from '@appkit/ui'
import { WorkflowWorkbench } from './workbench'

export const metadata = { title: 'Workflows — appkit' }

export default function WorkflowsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 lg:p-6">
      <PageHeader
        title="Project approval"
        description="Build triggers, decisions, approvals, and actions on one canvas."
      />
      <div className="min-h-0 flex-1">
        <WorkflowWorkbench />
      </div>
    </div>
  )
}
