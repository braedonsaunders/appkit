import { redirect } from 'next/navigation'
import { getSession } from '../../lib/server/session'
import { AppFrame } from '../../components/app-frame'

export const dynamic = 'force-dynamic'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <AppFrame tenantName={session.tenant.name} userName={session.user.name} userEmail={session.user.email}>
      {children}
    </AppFrame>
  )
}
