'use client'

import * as React from 'react'
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Input,
  Label,
  RecordList,
  Select,
  Switch,
  cn,
  confirmDialog,
  type RecordColumn,
} from '@braedonsaunders/appkit-ui'
import { Building2, KeyRound, MonitorSmartphone, ShieldCheck, UserPlus, Users } from 'lucide-react'
import type { PlatformSessionRecord, PlatformTenantRecord, PlatformUserRecord, TenantMemberRecord } from './types'

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
    /** The workspace the new account joins — chosen explicitly in the drawer. */
    tenantId: string
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
  /** Workspaces a new account can join — typically the active tenants. */
  tenants: { id: string; name: string }[]
  /** Preselected workspace in the Add-user drawer — typically the operator's current tenant. */
  defaultTenantId: string
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
  tenants,
  defaultTenantId,
  actions,
  title = 'Users',
  description = 'Every account that can sign in to this installation. Deactivating an account blocks sign-in immediately and ends its sessions.',
}: PlatformUsersAdminProps) {
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState<'all' | 'active' | 'inactive'>('all')
  const [sort, setSort] = React.useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [notice, setNotice] = React.useState<{ tone: 'error' | 'success'; message: string } | null>(null)

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    const base = users.filter((user) => {
      if (status !== 'all' && user.isActive !== (status === 'active')) return false
      if (!needle) return true
      return user.name.toLocaleLowerCase().includes(needle) || user.email.toLocaleLowerCase().includes(needle)
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...base].sort((a, b) => {
      const key = sort.key as keyof PlatformUserRecord
      return String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * dir
    })
  }, [users, query, status, sort])
  const counts = {
    all: users.length,
    active: users.filter((user) => user.isActive).length,
    inactive: users.filter((user) => !user.isActive).length,
  }
  const selected = users.find((user) => user.id === selectedId) ?? null

  const columns = React.useMemo<RecordColumn<PlatformUserRecord>[]>(
    () => [
      {
        key: 'name',
        label: 'Name',
        sortable: true,
        render: (user) => (
          <div className="flex items-center gap-3">
            <Avatar name={user.name} src={user.image ?? undefined} size={32} />
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium text-fg">{user.name}</span>
              {user.id === currentUserId ? <Badge variant="outline">You</Badge> : null}
              {user.isSuperAdmin ? <Badge variant="warning">Super admin</Badge> : null}
            </div>
          </div>
        ),
      },
      {
        key: 'email',
        label: 'Email',
        sortable: true,
        render: (user) => <span className="text-fg-muted">{user.email}</span>,
      },
      {
        key: 'isActive',
        label: 'Status',
        render: (user) => (
          <Badge variant={user.isActive ? 'success' : 'secondary'}>{user.isActive ? 'Active' : 'Deactivated'}</Badge>
        ),
      },
      {
        key: 'hasCredential',
        label: 'Sign-in',
        render: (user) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant={user.hasCredential ? 'secondary' : 'outline'}>
              {user.hasCredential ? 'Password' : 'No credential'}
            </Badge>
            {user.emailVerified ? null : <Badge variant="outline">Unverified</Badge>}
          </div>
        ),
      },
      {
        key: 'activeSessionCount',
        label: 'Sessions',
        render: (user) => <span className="tabular-nums text-fg-muted">{user.activeSessionCount}</span>,
      },
      {
        key: 'lastSeenAt',
        label: 'Last seen',
        render: (user) => (
          <span className="whitespace-nowrap text-fg-muted">{formatDateTime(user.lastSeenAt)}</span>
        ),
      },
    ],
    [currentUserId],
  )

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p>
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

      <RecordList
        columns={columns}
        rows={filtered}
        getRowId={(user) => user.id}
        search={{ value: query, onChange: setQuery, placeholder: 'Search name or email…' }}
        sort={sort}
        onSortChange={(key) =>
          setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
        }
        filters={
          <div
            className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-1"
            aria-label="Filter users by status"
          >
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
        }
        toolbarActions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus size={16} />
            Add user
          </Button>
        }
        onRowClick={(user) => setSelectedId(user.id)}
        empty={{
          icon: <Users />,
          title: 'No users found',
          description: 'Try a different search or filter.',
        }}
      />

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
          tenants={tenants}
          defaultTenantId={defaultTenantId}
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
  tenants,
  defaultTenantId,
  onClose,
  onCreate,
}: {
  tenants: { id: string; name: string }[]
  defaultTenantId: string
  onClose: () => void
  onCreate: (input: {
    name: string
    email: string
    password: string
    isSuperAdmin?: boolean
    tenantId: string
  }) => Promise<void>
}) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [tenantId, setTenantId] = React.useState(defaultTenantId)
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false)
  const [busy, startBusy] = React.useTransition()
  const valid = name.trim().length > 0 && email.includes('@') && password.length >= 8 && tenantId.length > 0

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
            onClick={() => startBusy(() => onCreate({ name, email, password, isSuperAdmin, tenantId }))}
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
          <Label htmlFor="superadmin-create-tenant">Workspace</Label>
          <Select
            id="superadmin-create-tenant"
            required
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            placeholder="Choose a workspace"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-fg-muted">
            The workspace this account joins on creation. Move or add memberships later from Tenants.
          </p>
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

  const columns = React.useMemo<RecordColumn<PlatformSessionRecord>[]>(
    () => [
      {
        key: 'userName',
        label: 'User',
        render: (session) => (
          <div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-fg">{session.userName}</span>
              {session.isCurrentSession ? <Badge variant="outline">This session</Badge> : null}
            </div>
            <div className="truncate text-xs text-fg-muted">{session.userEmail}</div>
          </div>
        ),
      },
      {
        key: 'createdAt',
        label: 'Signed in',
        render: (session) => (
          <span className="whitespace-nowrap text-fg-muted">{formatDateTime(session.createdAt)}</span>
        ),
      },
      {
        key: 'expiresAt',
        label: 'Expires',
        render: (session) => (
          <span className="whitespace-nowrap text-fg-muted">{formatDateTime(session.expiresAt)}</span>
        ),
      },
      {
        key: 'ipAddress',
        label: 'IP address',
        render: (session) => <span className="font-mono text-xs text-fg-muted">{session.ipAddress || '—'}</span>,
      },
      {
        key: 'userAgent',
        label: 'Device',
        render: (session) => (
          <span className="block max-w-64 truncate text-xs text-fg-muted" title={session.userAgent ?? undefined}>
            {session.userAgent || '—'}
          </span>
        ),
      },
      {
        key: 'revoke',
        label: '',
        kind: 'actions',
        render: (session) => (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
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
            }}
          >
            Revoke
          </Button>
        ),
      },
    ],
    [actions, busy],
  )

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

      <RecordList
        columns={columns}
        rows={sessions}
        getRowId={(session) => session.id}
        empty={{
          icon: <MonitorSmartphone />,
          title: 'No active sessions',
          description: 'Nobody is signed in right now.',
        }}
      />
    </div>
  )
}

export type PlatformTenantsActions = {
  createTenant(input: { name: string; slug: string }): Promise<SuperadminActionResult>
  setTenantStatus(tenantId: string, status: 'active' | 'suspended'): Promise<SuperadminActionResult>
  addMember(tenantId: string, email: string): Promise<SuperadminActionResult>
  setMemberStatus(
    tenantId: string,
    membershipId: string,
    status: 'active' | 'suspended',
  ): Promise<SuperadminActionResult>
  removeMember(tenantId: string, membershipId: string): Promise<SuperadminActionResult>
}

export type PlatformTenantsAdminProps = {
  tenants: PlatformTenantRecord[]
  /** tenantId → members, preloaded by the server page and refreshed on revalidation. */
  members: Record<string, TenantMemberRecord[]>
  /** The tenant the operator is currently working in — suspending it is called out. */
  currentTenantId?: string
  actions: PlatformTenantsActions
  title?: string
  description?: string
}

/**
 * Instance-operator tenant administration: every workspace of the
 * installation, with activation, membership management, and creation.
 */
export function PlatformTenantsAdmin({
  tenants,
  members,
  currentTenantId,
  actions,
  title = 'Tenants',
  description = 'Every workspace on this installation. Suspending a tenant hides it from members immediately; its data is kept.',
}: PlatformTenantsAdminProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [sort, setSort] = React.useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
  const [notice, setNotice] = React.useState<{ tone: 'error' | 'success' | 'warning'; message: string } | null>(null)

  const selected = tenants.find((tenant) => tenant.id === selectedId) ?? null

  const columns = React.useMemo<RecordColumn<PlatformTenantRecord>[]>(
    () => [
      {
        key: 'name',
        label: 'Name',
        sortable: true,
        render: (tenant) => (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-fg">{tenant.name}</span>
            {tenant.id === currentTenantId ? <Badge variant="outline">Current</Badge> : null}
          </div>
        ),
      },
      {
        key: 'slug',
        label: 'Slug',
        sortable: true,
        render: (tenant) => <span className="font-mono text-xs text-fg-muted">{tenant.slug}</span>,
      },
      {
        key: 'status',
        label: 'Status',
        render: (tenant) => (
          <Badge variant={tenant.status === 'active' ? 'success' : 'secondary'}>
            {tenant.status === 'active' ? 'Active' : tenant.status === 'suspended' ? 'Suspended' : 'Archived'}
          </Badge>
        ),
      },
      {
        key: 'memberCount',
        label: 'Members',
        render: (tenant) => <span className="tabular-nums text-fg-muted">{tenant.memberCount}</span>,
      },
      {
        key: 'createdAt',
        label: 'Created',
        render: (tenant) => (
          <span className="whitespace-nowrap text-fg-muted">{formatDateTime(tenant.createdAt)}</span>
        ),
      },
    ],
    [currentTenantId],
  )

  const sorted = React.useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...tenants].sort((a, b) => {
      const key = sort.key as keyof PlatformTenantRecord
      return String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * dir
    })
  }, [tenants, sort])

  async function run(operation: () => Promise<SuperadminActionResult>, successMessage?: string): Promise<boolean> {
    setNotice(null)
    const result = await operation()
    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message })
      return false
    }
    const message = result.message ?? successMessage
    if (message) setNotice({ tone: result.message ? 'warning' : 'success', message })
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
          <Building2 size={16} />
          Add tenant
        </Button>
      </div>

      {notice ? (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-lg border px-4 py-3 text-sm',
            notice.tone === 'error'
              ? 'border-danger/30 bg-danger-subtle text-danger'
              : notice.tone === 'warning'
                ? 'border-warning/30 bg-warning-subtle text-warning'
                : 'border-success/30 bg-success-subtle text-success',
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <RecordList
        columns={columns}
        rows={sorted}
        getRowId={(tenant) => tenant.id}
        sort={sort}
        onSortChange={(key) =>
          setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
        }
        onRowClick={(tenant) => setSelectedId(tenant.id)}
        empty={{
          icon: <Building2 />,
          title: 'No tenants',
          description: 'Create the first workspace to get started.',
        }}
      />

      {selected ? (
        <TenantDrawer
          tenant={selected}
          members={members[selected.id] ?? []}
          isCurrentTenant={selected.id === currentTenantId}
          onClose={() => setSelectedId(null)}
          onSetStatus={(status) =>
            run(
              () => actions.setTenantStatus(selected.id, status),
              status === 'active' ? 'Tenant reactivated.' : 'Tenant suspended.',
            )
          }
          onAddMember={(email) => run(() => actions.addMember(selected.id, email), `${email} added.`)}
          onSetMemberStatus={(membershipId, status) =>
            run(
              () => actions.setMemberStatus(selected.id, membershipId, status),
              status === 'active' ? 'Membership reactivated.' : 'Membership suspended.',
            )
          }
          onRemoveMember={(membershipId) => run(() => actions.removeMember(selected.id, membershipId), 'Member removed.')}
        />
      ) : null}

      {creating ? (
        <CreateTenantDrawer
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            const saved = await run(() => actions.createTenant(input), `${input.name} created.`)
            if (saved) setCreating(false)
          }}
        />
      ) : null}
    </div>
  )
}

function TenantDrawer({
  tenant,
  members,
  isCurrentTenant,
  onClose,
  onSetStatus,
  onAddMember,
  onSetMemberStatus,
  onRemoveMember,
}: {
  tenant: PlatformTenantRecord
  members: TenantMemberRecord[]
  isCurrentTenant: boolean
  onClose: () => void
  onSetStatus: (status: 'active' | 'suspended') => Promise<boolean>
  onAddMember: (email: string) => Promise<boolean>
  onSetMemberStatus: (membershipId: string, status: 'active' | 'suspended') => Promise<boolean>
  onRemoveMember: (membershipId: string) => Promise<boolean>
}) {
  const [email, setEmail] = React.useState('')
  const [busy, startBusy] = React.useTransition()
  const suspended = tenant.status === 'suspended'

  async function changeStatus(next: boolean) {
    if (!next) {
      const confirmed = await confirmDialog({
        message: `Suspend ${tenant.name}?${isCurrentTenant ? ' This is the tenant you are currently working in — you will lose this workspace until it is reactivated.' : ''} Members lose access immediately; nothing is deleted.`,
        confirmLabel: 'Suspend tenant',
        tone: 'danger',
      })
      if (!confirmed) return
    }
    await onSetStatus(next ? 'active' : 'suspended')
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          {tenant.name}
          <Badge variant={tenant.status === 'active' ? 'success' : 'secondary'}>
            {tenant.status === 'active' ? 'Active' : tenant.status === 'suspended' ? 'Suspended' : 'Archived'}
          </Badge>
          {isCurrentTenant ? <Badge variant="outline">Current workspace</Badge> : null}
        </span>
      }
      description={`Slug: ${tenant.slug} (permanent)`}
    >
      <div className="space-y-6">
        <dl className="grid gap-4 rounded-xl border border-border bg-bg-subtle p-4 sm:grid-cols-2">
          <Metric label="Slug" value={tenant.slug} mono />
          <Metric label="Created" value={formatDateTime(tenant.createdAt)} />
          <Metric label="Active members" value={String(tenant.memberCount)} />
          <Metric label="Tenant ID" value={tenant.id} mono />
        </dl>

        <section className="divide-y divide-border rounded-xl border border-border">
          <AccessRow
            title="Tenant active"
            description={
              isCurrentTenant
                ? 'This is the workspace you are working in right now. Suspending it takes it away from you too.'
                : 'When off, members cannot use this workspace. Data is kept; reactivate any time.'
            }
            checked={!suspended && tenant.status === 'active'}
            disabled={busy || tenant.status === 'archived'}
            onChange={(next) => startBusy(() => changeStatus(next))}
          />
        </section>

        <section className="space-y-4 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-fg-muted" />
            <h3 className="text-sm font-semibold text-fg">Members</h3>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="superadmin-tenant-member-email">Add member by email</Label>
              <Input
                id="superadmin-tenant-member-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="An existing account's email"
              />
            </div>
            <Button
              variant="outline"
              disabled={busy || !email.includes('@')}
              onClick={() =>
                startBusy(async () => {
                  if (await onAddMember(email.trim())) setEmail('')
                })
              }
            >
              <UserPlus size={16} />
              Add member
            </Button>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-fg-muted">No members yet. Add an existing account by email.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {members.map((member) => (
                <li key={member.membershipId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-fg">{member.userName}</span>
                      <Badge
                        variant={member.status === 'active' ? 'success' : member.status === 'invited' ? 'outline' : 'secondary'}
                      >
                        {member.status}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-fg-muted">{member.userEmail}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        startBusy(async () => {
                          await onSetMemberStatus(
                            member.membershipId,
                            member.status === 'active' ? 'suspended' : 'active',
                          )
                        })
                      }
                    >
                      {member.status === 'active' ? 'Suspend' : 'Activate'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      disabled={busy}
                      onClick={() =>
                        startBusy(async () => {
                          const confirmed = await confirmDialog({
                            message: `Remove ${member.userName} from ${tenant.name}? Their account remains; only this workspace access ends.`,
                            confirmLabel: 'Remove member',
                            tone: 'danger',
                          })
                          if (confirmed) await onRemoveMember(member.membershipId)
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  )
}

function CreateTenantDrawer({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (input: { name: string; slug: string }) => Promise<void>
}) {
  const [name, setName] = React.useState('')
  const [slug, setSlug] = React.useState('')
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [busy, startBusy] = React.useTransition()
  const valid = name.trim().length > 0 && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)

  function suggestSlug(value: string): string {
    return value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63)
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title="Add tenant"
      description="Creates a new workspace. It starts empty, with no members — add them from the tenant's drawer."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || busy} onClick={() => startBusy(() => onCreate({ name: name.trim(), slug }))}>
            Create tenant
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="superadmin-create-tenant-name">Name</Label>
          <Input
            id="superadmin-create-tenant-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (!slugTouched) setSlug(suggestSlug(event.target.value))
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="superadmin-create-tenant-slug">Slug</Label>
          <Input
            id="superadmin-create-tenant-slug"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true)
              setSlug(event.target.value.toLocaleLowerCase())
            }}
            placeholder="lowercase-and-hyphens"
          />
          <p className="text-xs text-fg-muted">
            Permanent identifier — lowercase letters, digits, and hyphens. It cannot be changed after creation.
          </p>
        </div>
      </div>
    </Drawer>
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
