import { getDemoEnvironment } from '../../lib/server/demo-context'
import { AppFrame } from '../../components/app-frame'

export const dynamic = 'force-dynamic'

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const demo = await getDemoEnvironment()
  return (
    <AppFrame tenantName={demo.tenant.name} userName={demo.user.name} userEmail={demo.user.email}>
      {children}
    </AppFrame>
  )
}
