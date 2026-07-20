import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button, PageContainer } from '@appkit/ui'
import { DashboardExperience } from '../_dashboard-experience'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Customize dashboard — appkit' }

export default function CustomizeDashboardPage() {
  return <PageContainer>
    <div className="mb-5 flex items-center gap-3">
      <Button variant="ghost" size="icon" asChild><Link href="/dashboard" aria-label="Back to dashboard"><ArrowLeft size={18} /></Link></Button>
      <div><h1 className="text-2xl font-bold tracking-tight">Customize dashboard</h1><p className="mt-1 text-sm text-fg-muted">Drag, resize, remove, and add built-in widgets or saved insight cards.</p></div>
    </div>
    <DashboardExperience mode="edit" />
  </PageContainer>
}
