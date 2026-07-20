import { redirect } from 'next/navigation'
import { getSession } from '../../lib/server/session'
import { LoginForm } from './login-form'
import { AppkitMark } from '../../components/appkit-logo'

export const metadata = { title: 'Sign in — appkit' }
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const session = await getSession()
  if (session) redirect('/dashboard')
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-subtle p-6">
      <div className="reveal w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <AppkitMark size={44} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">
              app<span className="text-primary">kit</span>
            </h1>
            <p className="mt-1 text-sm text-fg-muted">Sign in to your workspace</p>
          </div>
        </div>
        <LoginForm />
        <p className="text-center text-xs text-fg-subtle">
          Demo: <code className="font-mono">admin@appkit.dev</code> ·{' '}
          <code className="font-mono">appkit-demo</code>
        </p>
      </div>
    </div>
  )
}
