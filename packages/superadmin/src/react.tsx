'use client'

import * as React from 'react'
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  EmptyState,
  Input,
  Label,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  confirmDialog,
} from '@appkit/ui'
import { KeyRound, MonitorSmartphone, Search, ShieldCheck, UserPlus, Users } from 'lucide-react'
import type { PlatformSessionRecord, PlatformUserRecord } from './types'

/**
 * Server-action friendly result contract: the application owns the actions
 * (authorization, persistence, revalidation) and the components render state,
 * collect input, and surface outcomes.
 */
export type SuperadminActionResult = { ok: true; message?: string } | { ok: false; message: string }

export type PlatformUsersActions = {
  createUser(input: {
    name: string
    email: string
    password: string
    isSuperAdmin?: boolean
  }): Promise<SuperadminActionResult>
  updateUser(
    userId: string,
    input: { name?: string; isActive?: boolean; isSuperAdmin?: boolean; emailVerified?: boolean },
  ): Promise<SuperadminActionResult>
  setPassword(userId: string, password: string): Promise<SuperadminActionResult>
  revokeUserSessions(userId: string): Promise<SuperadminActionResult>
}

export type PlatformUsersAdminProps = {
  users: PlatformUserRecord[]
  /** The signed-in operator, so their own row is labeled and guarded in copy. */
  currentUserId?: string
  actions: PlatformUsersActions
  title?: string
  description?: string
}

/**
 * Instance-operator user administration: every account that can sign in to
 * the platform, with activation, super-admin standing, credentials, and
 * session controls.
 */
export function PlatformUsersAdmin({
  users,
  currentUserId,
  actions,
  title = 'Users',
  description = 'Every account that can sign in to this installation. Deactivating an account blocks sign-in immediately and ends its sessions.',
}: PlatformUsersAdminProps) {
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState<'all' | 'active' | 'inactive'>('all')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [notice, setNotice] = React.useState<{ tone: 'error' | 'success'; message: string } | null>(null)

  const filtered = users.filter((user) => {
    if (status !== 'all' && user.isActive !== (status === 'active')) return false
    if (!query.trim()) return true
    const needle = query.trim().toLocaleLowerCase()
    return user.name.toLocaleLowerCase().includes(needle) || user.email.toLocaleLowerCase().includes(needle)
  })
  const counts = {
    all: users.length,
    active: users.filter((user) => user.isActive).length,
    inactive: users.filter((user) => !user.isActive).length,
  }
  const selected = users.find((user) => user.id === selectedId) ?? null

  async function run(operation: () => Promise<SuperadminActionResult>, successMessage?: string): Promise<boolean> {
    setNotice(null)
    const result = await operation()
    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message })
      return false
    }
    const message = result.message ?? successMessage
    if (message) setNotice({ tone: 'success', message })
    return true
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <UserPlus size={16} />
          Add user
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or email…"
            className="pl-9"
          />
        </div>
        <div className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-1" aria-label="Filter users by status">
          {(
            [
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Deactivated' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => setStatus(filter.value)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                status === filter.value ? 'bg-primary-subtle text-primary' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
              )}
            >
              <span>{filter.label}</span>
              <span className="tabular-nums text-fg-subtle">{counts[filter.value]}</span>
            </button>
          ))}
        </div>
      </div>

      {notice ? (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-lg border px-4 py-3 text-sm',
            notice.tone === 'error'
              ? 'border-danger/30 bg-danger-subtle text-danger'
              : 'border-success/30 bg-success-subtle text-success',
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow noAnimate>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Sessions</TableHead>
              <TableHead>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <TableRow
                key={user.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer"
                onClick={() => setSelectedId(user.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedId(user.id)
                  }
                }}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={user.name} src={user.image ?? undefined} size={32} />
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-fg">{user.name}</span>
                      {user.id === currentUserId ? <Badge variant="outline">You</Badge> : null}
                      {user.isSuperAdmin ? <Badge variant="warning">Super admin</Badge> : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-fg-muted">{user.email}</TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? 'success' : 'secondary'}>{user.isActive ? 'Active' : 'Deactivated'}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={user.hasCredential ? 'secondary' : 'outline'}>
                      {user.hasCredential ? 'Password' : 'No credential'}
                    </Badge>
                    {user.emailVerified ? null : <Badge variant="outline">Unverified</Badge>}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums text-fg-muted">{user.activeSessionCount}</TableCell>
                <TableCell className="whitespace-nowrap text-fg-muted">{formatDateTime(user.lastSeenAt)}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow noAnimate>
                <TableCell colSpan={6}>
                  <EmptyState
                    icon={<Users />}
                    title="No users found"
                    description="Try a different search or filter."
                    className="border-0 bg-transparent py-10 shadow-none"
                  />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {selected ? (
        <UserDrawer
          user={selected}
          isCurrentUser={selected.id === currentUserId}
          onClose={() => setSelectedId(null)}
          onUpdate={(input, successMessage) => run(() => actions.updateUser(selected.id, input), successMessage)}
          onSetPassword={(password) => run(() => actions.setPassword(selected.id, password), 'Password updated.')}
          onRevokeSessions={() => run(() => actions.revokeUserSessions(selected.id), 'All sessions ended.')}
        />
      ) : null}

      {creating ? (
        <CreateUserDrawer
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            const saved = await run(() => actions.createUser(input), `${input.email} can now sign in.`)
            if (saved) setCreating(false)
          }}
        />
      ) : null}
    </div>
  )
}

function UserDrawer({
  user,
  isCurrentUser,
  onClose,
  onUpdate,
  onSetPassword,
  onRevokeSessions,
}: {
  user: PlatformUserRecord
  isCurrentUser: boolean
  onClose: () => void
  onUpdate: (
    input: { name?: string; isActive?: boolean; isSuperAdmin?: boolean; emailVerified?: boolean },
    successMessage?: string,
  ) => Promise<boolean>
  onSetPassword: (password: string) => Promise<boolean>
  onRevokeSessions: () => Promise<boolean>
}) {
  const [name, setName] = React.useState(user.name)
  const [password, setPassword] = React.useState('')
  const [busy, startBusy] = React.useTransition()

  async function changeActivation(next: boolean) {
    if (!next) {
      const confirmed = await confirmDialog({
        message: `Deactivate ${user.name}? They are signed out everywhere and cannot sign in again until reactivated.`,
        confirmLabel: 'Deactivate account',
        tone: 'danger',
      })
      if (!confirmed) return
    }
    await onUpdate({ isActive: next }, next ? 'Account reactivated.' : 'Account deactivated and signed out.')
  }

  async function changeSuperAdmin(next: boolean) {
    const confirmed = await confirmDialog({
      message: next
        ? `Grant ${user.name} super-admin access? They will be able to manage every account and setting on this installation.`
        : `Remove ${user.name}'s super-admin access?`,
      confirmLabel: next ? 'Grant super admin' : 'Remove super admin',
      tone: next ? 'default' : 'danger',
    })
    if (!confirmed) return
    await onUpdate({ isSuperAdmin: next }, next ? 'Super-admin access granted.' : 'Super-admin access removed.')
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          {user.name}
          <Badge variant={user.isActive ? 'success' : 'secondary'}>{user.isActive ? 'Active' : 'Deactivated'}</Badge>
          {user.isSuperAdmin ? <Badge variant="warning">Super admin</Badge> : null}
        </span>
      }
      description={user.email}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="superadmin-user-name">Name</Label>
            <Input id="superadmin-user-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              disabled={busy || name.trim() === user.name || !name.trim()}
              onClick={() => startBusy(async () => void (await onUpdate({ name }, 'Name updated.')))}
            >
              Save name
            </Button>
          </div>
        </div>

        <dl className="grid gap-4 rounded-xl border border-border bg-bg-subtle p-4 sm:grid-cols-2">
          <Metric label="Email" value={user.email} />
          <Metric label="Created" value={formatDateTime(user.createdAt)} />
          <Metric label="Last seen" value={formatDateTime(user.lastSeenAt)} />
          <Metric label="Account ID" value={user.id} mono />
        </dl>

        <section className="divide-y divide-border rounded-xl border border-border">
          <AccessRow
            title="Account active"
            description={
              isCurrentUser
                ? 'This is your account. Another super admin must deactivate it.'
                : 'When off, sign-in is refused and every session ends immediately.'
            }
            checked={user.isActive}
            disabled={busy || isCurrentUser}
            onChange={(next) => startBusy(() => changeActivation(next))}
          />
          <AccessRow
            title="Super admin"
            description="Full instance-operator access: user management, sessions, and platform settings."
            checked={user.isSuperAdmin}
            disabled={busy}
            onChange={(next) => startBusy(() => changeSuperAdmin(next))}
          />
          <AccessRow
            title="Email verified"
            description="Marks the address as confirmed without sending a verification email."
            checked={user.emailVerified}
            disabled={busy}
            onChange={(next) => startBusy(async () => void (await onUpdate({ emailVerified: next }, next ? 'Email marked verified.' : 'Email marked unverified.')))}
          />
        </section>

        <section className="space-y-4 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-fg-muted" />
            <h3 className="text-sm font-semibold text-fg">Password</h3>
          </div>
          <p className="text-sm text-fg-muted">
            {user.hasCredential
              ? 'Replaces the current password. Existing sessions stay signed in until revoked.'
              : 'This account has no password yet — set one so it can sign in.'}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="superadmin-user-password">New password</Label>
              <Input
                id="superadmin-user-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <Button
              variant="outline"
              disabled={busy || password.length < 8}
              onClick={() =>
                startBusy(async () => {
                  if (await onSetPassword(password)) setPassword('')
                })
              }
            >
              Set password
            </Button>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-fg-muted" />
            <h3 className="text-sm font-semibold text-fg">Sessions</h3>
          </div>
          <p className="text-sm text-fg-muted">
            {user.activeSessionCount === 1
              ? '1 active session.'
              : `${user.activeSessionCount} active sessions.`}{' '}
            Ending them signs this account out of every device.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || user.activeSessionCount === 0}
            onClick={() =>
              startBusy(async () => {
                const confirmed = await confirmDialog({
                  message: `End all of ${user.name}'s sessions?${isCurrentUser ? ' This includes the session you are using right now.' : ''}`,
                  confirmLabel: 'End sessions',
                  tone: 'danger',
                })
                if (confirmed) await onRevokeSessions()
              })
            }
          >
            End all sessions
          </Button>
        </section>
      </div>
    </Drawer>
  )
}

function CreateUserDrawer({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (input: { name: string; email: string; password: string; isSuperAdmin?: boolean }) => Promise<void>
}) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false)
  const [busy, startBusy] = React.useTransition()
  const valid = name.trim().length > 0 && email.includes('@') && password.length >= 8

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title="Add user"
      description="Creates a sign-in account for this installation. Share the password securely; the user can change it after signing in."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || busy}
            onClick={() => startBusy(() => onCreate({ name, email, password, isSuperAdmin }))}
          >
            Create user
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="superadmin-create-name">Name</Label>
            <Input id="superadmin-create-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="superadmin-create-email">Email</Label>
            <Input
              id="superadmin-create-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="superadmin-create-password">Password</Label>
          <Input
            id="superadmin-create-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Switch checked={isSuperAdmin} onChange={(event) => setIsSuperAdmin(event.target.checked)} />
          <span>
            <span className="block text-sm font-medium text-fg">Super admin</span>
            <span className="block text-sm text-fg-muted">
              Grants full instance-operator access, including this panel.
            </span>
          </span>
        </label>
      </div>
    </Drawer>
  )
}

export type PlatformSessionsActions = {
  revokeSession(sessionId: string): Promise<SuperadminActionResult>
}

export type PlatformSessionsAdminProps = {
  sessions: PlatformSessionRecord[]
  actions: PlatformSessionsActions
  title?: string
  description?: string
}

/** Live sessions across the installation, with per-session revocation. */
export function PlatformSessionsAdmin({
  sessions,
  actions,
  title = 'Active sessions',
  description = 'Every live sign-in across the installation. Revoking a session signs that device out immediately.',
}: PlatformSessionsAdminProps) {
  const [notice, setNotice] = React.useState<{ tone: 'error' | 'warning'; message: string } | null>(null)
  const [busy, startBusy] = React.useTransition()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p>
      </div>

      {notice ? (
        <div
          role="alert"
          className={cn(
            'rounded-lg border px-4 py-3 text-sm',
            notice.tone === 'error'
              ? 'border-danger/30 bg-danger-subtle text-danger'
              : 'border-warning/30 bg-warning-subtle text-warning',
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow noAnimate>
              <TableHead>User</TableHead>
              <TableHead>Signed in</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>IP address</TableHead>
              <TableHead>Device</TableHead>
              <TableHead aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id} noAnimate>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-fg">{session.userName}</span>
                    {session.isCurrentSession ? <Badge variant="outline">This session</Badge> : null}
                  </div>
                  <div className="truncate text-xs text-fg-muted">{session.userEmail}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-fg-muted">{formatDateTime(session.createdAt)}</TableCell>
                <TableCell className="whitespace-nowrap text-fg-muted">{formatDateTime(session.expiresAt)}</TableCell>
                <TableCell className="font-mono text-xs text-fg-muted">{session.ipAddress || '—'}</TableCell>
                <TableCell className="max-w-64 truncate text-xs text-fg-muted" title={session.userAgent ?? undefined}>
                  {session.userAgent || '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    disabled={busy}
                    onClick={() =>
                      startBusy(async () => {
                        const confirmed = await confirmDialog({
                          message: session.isCurrentSession
                            ? 'Revoke the session you are using right now? You will be signed out.'
                            : `Revoke ${session.userName}'s session? That device is signed out immediately.`,
                          confirmLabel: 'Revoke session',
                          tone: 'danger',
                        })
                        if (!confirmed) return
                        setNotice(null)
                        const result = await actions.revokeSession(session.id)
                        if (!result.ok) setNotice({ tone: 'error', message: result.message })
                        else if (result.message) setNotice({ tone: 'warning', message: result.message })
                      })
                    }
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {sessions.length === 0 ? (
              <TableRow noAnimate>
                <TableCell colSpan={6}>
                  <EmptyState
                    icon={<MonitorSmartphone />}
                    title="No active sessions"
                    description="Nobody is signed in right now."
                    className="border-0 bg-transparent py-10 shadow-none"
                  />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function AccessRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div>
        <div className="text-sm font-medium text-fg">{title}</div>
        <div className="mt-0.5 text-sm text-fg-muted">{description}</div>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={title}
      />
    </div>
  )
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className={cn('mt-1 truncate text-sm font-semibold text-fg', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  )
}

function formatDateTime(value: Date | null): string {
  if (!value) return 'Never'
  return value.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
