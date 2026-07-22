import { PageHeader } from '@appkit/ui'
import { APP_CAPABILITIES, appsSnapshot } from '../../../../lib/server/apps-demo'
import { AppsWorkbench } from './workbench'

export const metadata = { title: 'Apps — appkit' }
export const dynamic = 'force-dynamic'

export default async function AppsPage() {
  const snapshot = await appsSnapshot()
  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        back={{ href: '/admin', label: 'Administration' }}
        title="Apps"
        description="Build, install, permission, run, inspect, and publish sandboxed applications."
      />
      <AppsWorkbench initial={snapshot} capabilities={[...APP_CAPABILITIES]} />
    </div>
  )
}
