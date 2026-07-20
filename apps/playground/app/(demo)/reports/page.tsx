import { Download } from 'lucide-react'
import { Button, PageHeader } from '@appkit/ui'
import { ReportsDemo } from './_reports-demo'

export const metadata = { title: 'Reports — appkit' }

export default function ReportsPage() {
  return <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 lg:p-6"><PageHeader title="Reports" description="Build detail and summary reports, preview results, configure page output, and schedule delivery." actions={<Button variant="outline" asChild><a href="/api/demo/pdf?kind=report"><Download className="size-4" />Download PDF</a></Button>} /><ReportsDemo /></div>
}
