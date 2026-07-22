import { PageHeader } from '@appkit/ui'
import { scriptsSnapshot } from '../../../../lib/server/scripts-demo'
import { ScriptsWorkbench } from './workbench'

export const metadata = { title: 'Scripts — appkit' }
export const dynamic = 'force-dynamic'

export default function ScriptsPage() {
  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        back={{ href: '/admin', label: 'Administration' }}
        title="Scripts"
        description="Run JavaScript at application trigger points — validate input, change allowed fields, or veto execution. Every run is recorded."
      />
      <ScriptsWorkbench initial={scriptsSnapshot()} />
    </div>
  )
}
