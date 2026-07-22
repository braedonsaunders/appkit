'use client'

import { useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { Alert, AlertDescription, Button, Input, Label } from '@appkit/ui'

export type AuthFormLabels = Partial<{
  passwordMode: string
  magicLinkMode: string
  email: string
  password: string
  forgotPassword: string
  signIn: string
  sendMagicLink: string
  signingIn: string
  magicLinkSent: string
  invalidCredentials: string
  requestReset: string
  requestingReset: string
  resetSent: string
  newPassword: string
  confirmPassword: string
  showPassword: string
  hidePassword: string
  updatePassword: string
  updatingPassword: string
  passwordTooShort: string
  passwordsDoNotMatch: string
  invalidResetLink: string
}>

const defaults = {
  passwordMode: 'Password',
  magicLinkMode: 'Email link',
  email: 'Email',
  password: 'Password',
  forgotPassword: 'Forgot password?',
  signIn: 'Sign in',
  sendMagicLink: 'Email me a sign-in link',
  signingIn: 'Signing in…',
  magicLinkSent: 'Check your email for a sign-in link.',
  invalidCredentials: 'Sign-in failed. Check your details and try again.',
  requestReset: 'Send reset link',
  requestingReset: 'Sending…',
  resetSent: 'If an account exists for that email, a reset link is on its way.',
  newPassword: 'New password',
  confirmPassword: 'Confirm password',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  updatePassword: 'Update password',
  updatingPassword: 'Updating…',
  passwordTooShort: 'Password must be at least 8 characters.',
  passwordsDoNotMatch: 'Passwords do not match.',
  invalidResetLink: 'This reset link has expired or already been used. Request a new one.',
} as const

export type SignInFormProps = {
  signInWithPassword: (input: { email: string; password: string }) => Promise<{ error?: string | null }>
  signInWithMagicLink: (input: { email: string; callbackURL: string }) => Promise<{ error?: string | null }>
  onSignedIn: () => void
  callbackURL?: string
  forgotPasswordHref?: string
  defaultMode?: 'password' | 'magic'
  labels?: AuthFormLabels
}

/** Source-parity password/magic-link sign-in form with app-owned navigation. */
export function SignInForm({
  signInWithPassword,
  signInWithMagicLink,
  onSignedIn,
  callbackURL = '/auth/continue',
  forgotPasswordHref = '/forgot-password',
  defaultMode = 'password',
  labels,
}: SignInFormProps) {
  const copy = { ...defaults, ...labels }
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<'password' | 'magic'>(defaultMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    startTransition(async () => {
      try {
        if (mode === 'password') {
          const result = await signInWithPassword({ email: email.trim().toLowerCase(), password })
          if (result.error) return setError(result.error || copy.invalidCredentials)
          onSignedIn()
          return
        }
        const result = await signInWithMagicLink({
          email: email.trim().toLowerCase(),
          callbackURL,
        })
        if (result.error) return setError(result.error || copy.invalidCredentials)
        setInfo(copy.magicLinkSent)
      } catch (cause) {
        setError(cause instanceof Error && cause.message ? cause.message : copy.invalidCredentials)
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-1 rounded-md border border-border bg-surface p-1 text-sm">
        {(['password', 'magic'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={mode === candidate}
            onClick={() => setMode(candidate)}
            className={
              mode === candidate
                ? 'flex-1 rounded bg-bg-subtle px-3 py-1.5 font-medium text-fg'
                : 'flex-1 rounded px-3 py-1.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg'
            }
          >
            {candidate === 'password' ? copy.passwordMode : copy.magicLinkMode}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="auth-email">{copy.email}</Label>
        <Input
          id="auth-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
      </div>
      {mode === 'password' ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="auth-password">{copy.password}</Label>
            <a href={forgotPasswordHref} className="text-xs text-primary hover:underline">
              {copy.forgotPassword}
            </a>
          </div>
          <Input
            id="auth-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
        </div>
      ) : null}
      <AuthMessage error={error} info={info} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? copy.signingIn : mode === 'password' ? copy.signIn : copy.sendMagicLink}
      </Button>
    </form>
  )
}

export type ForgotPasswordFormProps = {
  requestReset: (email: string) => Promise<void>
  labels?: AuthFormLabels
}

/** Account-enumeration-safe reset request form. */
export function ForgotPasswordForm({ requestReset, labels }: ForgotPasswordFormProps) {
  const copy = { ...defaults, ...labels }
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  function submit(event: FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      try {
        await requestReset(email.trim().toLowerCase())
      } catch {
        // Deliberately indistinguishable: never reveal whether the identity exists.
      }
      setSent(true)
    })
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="reset-email">{copy.email}</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
      </div>
      {sent ? (
        <Alert variant="success"><AlertDescription>{copy.resetSent}</AlertDescription></Alert>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending || sent}>
        {pending ? copy.requestingReset : copy.requestReset}
      </Button>
    </form>
  )
}

export type ResetPasswordFormProps = {
  token: string
  resetPassword: (input: { token: string; newPassword: string }) => Promise<{ error?: string | null }>
  onReset: () => void
  minLength?: number
  labels?: AuthFormLabels
}

/** Token-bound reset form preserving the source validation and recovery states. */
export function ResetPasswordForm({
  token,
  resetPassword,
  onReset,
  minLength = 8,
  labels,
}: ResetPasswordFormProps) {
  const copy = { ...defaults, ...labels }
  const [pending, startTransition] = useTransition()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!token) return setError(copy.invalidResetLink)
    if (password.length < minLength) return setError(copy.passwordTooShort)
    if (password !== confirm) return setError(copy.passwordsDoNotMatch)
    setError(null)
    startTransition(async () => {
      try {
        const result = await resetPassword({ token, newPassword: password })
        if (result.error) return setError(result.error)
        onReset()
      } catch {
        setError(copy.invalidResetLink)
      }
    })
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="new-password">{copy.newPassword}</Label>
        <Input id="new-password" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={minLength} required value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">{copy.confirmPassword}</Label>
        <Input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={minLength} required value={confirm} onChange={(event) => setConfirm(event.currentTarget.value)} />
      </div>
      <button type="button" onClick={() => setShow((value) => !value)} className="text-xs text-fg-muted hover:text-fg hover:underline">
        {show ? copy.hidePassword : copy.showPassword}
      </button>
      <AuthMessage error={error} info={null} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? copy.updatingPassword : copy.updatePassword}
      </Button>
    </form>
  )
}

export function AuthScreen({
  logo,
  title,
  description,
  children,
  footer,
}: {
  logo?: ReactNode
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          {logo ? <div className="mb-5 flex justify-center">{logo}</div> : null}
          <h1 className="text-xl font-semibold text-fg">{title}</h1>
          {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
        </div>
        {children}
        {footer ? <div className="text-center text-xs text-fg-muted">{footer}</div> : null}
      </div>
    </main>
  )
}

function AuthMessage({ error, info }: { error: string | null; info: string | null }) {
  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (info) return <Alert variant="success"><AlertDescription>{info}</AlertDescription></Alert>
  return null
}
