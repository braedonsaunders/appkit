import { PageHeader } from '@appkit/ui'
import { DesignWorkbench } from './workbench'

export const metadata = { title: 'Design studio — appkit' }

export default function DesignStudioPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 lg:p-6">
      <PageHeader
        title="Design studio"
        description="Edit a print-ready project credential with live data, layers, artboards, and output settings."
      />
      <div className="min-h-0 flex-1">
        <DesignWorkbench />
      </div>
    </div>
  )
}
