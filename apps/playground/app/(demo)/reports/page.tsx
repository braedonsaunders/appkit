import { PageHeader } from '@appkit/ui'
import { ReportsDemo } from './_reports-demo'

export const metadata = { title: 'Reports — appkit' }

export default function ReportsPage() {
  return <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 lg:p-6"><PageHeader title="Reports" description="Build, preview, drill into, print, and export a report." /><ReportsDemo /></div>
}
