import Link from 'next/link'
import { LayoutDashboard } from 'lucide-react'
import { Button, PageContainer } from '@appkit/ui'
import { DashboardExperience } from './_dashboard-experience'
import { getDemoEnvironment } from '../../../lib/server/demo-context'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard — appkit' }

export default async function DashboardPage() {
  const { user, tenant } = await getDemoEnvironment()
  return <PageContainer>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Good morning, {user.name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-fg-muted">Here’s what’s happening in {tenant.name}.</p>
      </div>
      <Button variant="outline" size="sm" asChild><Link href="/dashboard/customize"><LayoutDashboard size={15} />Customize</Link></Button>
    </div>
    <DashboardExperience mode="view" />
  </PageContainer>
}
