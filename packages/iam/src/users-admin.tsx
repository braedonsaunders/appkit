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
  SearchSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@appkit/ui'
import { Plus, Search, Shield, Trash2, UserPlus, Users, X } from 'lucide-react'
import { ScopePicker } from './scope-picker'
import type {
  IamAdminService,
  MemberRecord,
  MembershipStatus,
  PermissionGroup,
  RoleRecord,
  RoleScope,
  ScopeOptions,
} from './types'

type MemberTab = 'profile' | 'roles' | 'permissions'

export type UsersAdminProps = {
  service: IamAdminService
  permissionGroups: PermissionGroup[]
  scopeOptions?: ScopeOptions
  locales?: Array<{ value: string; label: string }>
  canManage?: boolean
  title?: string
  description?: string
  onError?: (error: unknown) => void
}

/** Complete tenant-member administration with invitations, lifecycle, roles, scopes, and overrides. */
export function UsersAdmin({
  service,
  permissionGroups,
  scopeOptions = {},
  locales = [{ value: 'en', label: 'English' }],
  canManage = true,
  title = 'Users',
  description = 'Invite members, assign scoped roles, and manage individual permission exceptions.',
  onError,
}: UsersAdminProps) {
  const [members, setMembers] = React.useState<MemberRecord[]>([])
  const [roles, setRoles] = React.useState<RoleRecord[]>([])
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState<MembershipStatus | ''>('')
  const [roleId, setRoleId] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [inviting, setInviting] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [memberResult, roleResult] = await Promise.all([
        service.listMembers({ perPage: 100, sort: 'name' }),
        service.listRoles({ perPage: 100, sort: 'name' }),
      ])
      setMembers(memberResult.rows)
      setRoles(roleResult.rows)
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause))
      onError?.(cause)
    } finally {
      setLoading(false)
    }
  }, [onError, service])

  React.useEffect(() => { void load() }, [load])

  async function mutate(operation: () => Promise<unknown>) {
    try {
      setError(null)
      await operation()
      await load()
    } catch (cause) {
      setError(errorMessage(cause))
      onError?.(cause)
      throw cause
    }
  }

  const normalized = query.trim().toLocaleLowerCase()
  const visibleMembers = members.filter((member) => {
    if (normalized && !`${member.name} ${member.email}`.toLocaleLowerCase().includes(normalized)) return false
    if (status && member.status !== status) return false
    return !roleId || member.assignments.some((assignment) => assignment.roleId === roleId)
  })
  const selected = members.find((member) => member.id === selectedId) ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1><p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p></div>
        {canManage ? <Button onClick={() => setInviting(true)}><UserPlus size={16} />Invite member</Button> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-64 flex-1 sm:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email…" className="pl-9" /></div>
        <div className="w-40"><SearchSelect value={status} onChange={(value) => setStatus(value as MembershipStatus | '')} options={[{ value: '', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'invited', label: 'Invited' }, { value: 'suspended', label: 'Suspended' }]} /></div>
        <div className="w-48"><SearchSelect value={roleId} onChange={setRoleId} options={[{ value: '', label: 'All roles' }, ...roles.map((role) => ({ value: role.id, label: role.name }))]} /></div>
      </div>

      {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</div> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader><TableRow noAnimate><TableHead>Member</TableHead><TableHead>Status</TableHead><TableHead>Roles</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
          <TableBody>
            {visibleMembers.map((member) => (
              <TableRow key={member.id} role="button" tabIndex={0} className="cursor-pointer" onClick={() => setSelectedId(member.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(member.id) } }}>
                <TableCell><div className="flex items-center gap-3"><Avatar name={member.name} src={member.image ?? undefined} size={32} /><div className="min-w-0"><div className="flex items-center gap-1.5"><span className="truncate font-medium text-fg">{member.name}</span>{member.isCurrentUser ? <Badge variant="outline">You</Badge> : null}</div><div className="truncate text-xs text-fg-muted">{member.email}</div></div></div></TableCell>
                <TableCell><StatusBadge status={member.status} /></TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{member.assignments.map((assignment) => <Badge key={assignment.id} variant="secondary">{assignment.roleName}</Badge>)}{member.assignments.length === 0 ? <span className="text-fg-subtle">—</span> : null}</div></TableCell>
                <TableCell className="whitespace-nowrap text-fg-muted">{formatDate(member.joinedAt ?? member.invitedAt ?? member.createdAt)}</TableCell>
              </TableRow>
            ))}
            {!loading && visibleMembers.length === 0 ? <TableRow noAnimate><TableCell colSpan={4}><EmptyState icon={<Users />} title="No members found" description="Try a different search or filter." className="border-0 bg-transparent py-10 shadow-none" /></TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>

      {selected ? (
        <MemberDrawer
          member={selected}
          roles={roles}
          permissionGroups={permissionGroups}
          scopeOptions={scopeOptions}
          locales={locales}
          canManage={canManage}
          onClose={() => setSelectedId(null)}
          onUpdate={(input) => mutate(() => service.updateMember(selected.id, input))}
          onRemove={() => mutate(async () => { await service.removeMember(selected.id); setSelectedId(null) })}
          onAssign={(nextRoleId, scope) => mutate(() => service.assignRole(selected.id, nextRoleId, scope))}
          onUpdateScope={(assignmentId, scope) => mutate(() => service.updateAssignmentScope(assignmentId, scope))}
          onRemoveAssignment={(assignmentId) => mutate(() => service.removeAssignment(assignmentId))}
          onSetOverride={(permission, effect) => mutate(() => service.setPermissionOverride(selected.id, { permission, effect }))}
          onRemoveOverride={(permission) => mutate(() => service.removePermissionOverride(selected.id, permission))}
        />
      ) : null}

      {inviting ? <InviteMemberDrawer roles={roles} scopeOptions={scopeOptions} locales={locales} onClose={() => setInviting(false)} onInvite={async (input) => { await mutate(() => service.inviteMember(input)); setInviting(false) }} /> : null}
    </div>
  )
}

function MemberDrawer({
  member,
  roles,
  permissionGroups,
  scopeOptions,
  locales,
  canManage,
  onClose,
  onUpdate,
  onRemove,
  onAssign,
  onUpdateScope,
  onRemoveAssignment,
  onSetOverride,
  onRemoveOverride,
}: {
  member: MemberRecord
  roles: RoleRecord[]
  permissionGroups: PermissionGroup[]
  scopeOptions: ScopeOptions
  locales: Array<{ value: string; label: string }>
  canManage: boolean
  onClose: () => void
  onUpdate: (input: { name?: string; status?: MembershipStatus; localeOverride?: string | null }) => Promise<unknown>
  onRemove: () => Promise<unknown>
  onAssign: (roleId: string, scope: RoleScope) => Promise<unknown>
  onUpdateScope: (assignmentId: string, scope: RoleScope) => Promise<unknown>
  onRemoveAssignment: (assignmentId: string) => Promise<unknown>
  onSetOverride: (permission: string, effect: 'grant' | 'deny') => Promise<unknown>
  onRemoveOverride: (permission: string) => Promise<unknown>
}) {
  const [tab, setTab] = React.useState<MemberTab>('profile')
  const protectedMember = member.isCurrentUser || member.isSuperAdmin

  return (
    <Drawer
      open
      onClose={onClose}
      size="xl"
      title={<span className="flex items-center gap-2">{member.name}<StatusBadge status={member.status} />{member.isSuperAdmin ? <Badge variant="warning">Super-admin</Badge> : null}</span>}
      description={member.email}
      subtabs={<MemberTabs value={tab} onChange={setTab} />}
    >
      {tab === 'profile' ? <MemberProfile member={member} locales={locales} canManage={canManage} protectedMember={protectedMember} onUpdate={onUpdate} onRemove={onRemove} /> : null}
      {tab === 'roles' ? <MemberRoles member={member} roles={roles} options={scopeOptions} canManage={canManage} protectedMember={protectedMember} onAssign={onAssign} onUpdateScope={onUpdateScope} onRemoveAssignment={onRemoveAssignment} /> : null}
      {tab === 'permissions' ? <PermissionOverrides member={member} roles={roles} groups={permissionGroups} canManage={canManage} onSet={onSetOverride} onRemove={onRemoveOverride} /> : null}
    </Drawer>
  )
}

function MemberProfile({ member, locales, canManage, protectedMember, onUpdate, onRemove }: { member: MemberRecord; locales: Array<{ value: string; label: string }>; canManage: boolean; protectedMember: boolean; onUpdate: (input: { name?: string; status?: MembershipStatus; localeOverride?: string | null }) => Promise<unknown>; onRemove: () => Promise<unknown> }) {
  const [name, setName] = React.useState(member.name)
  const [locale, setLocale] = React.useState(member.localeOverride ?? '')
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="iam-member-name">Display name</Label><Input id="iam-member-name" value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} /></div><div className="space-y-2"><Label>Language</Label><SearchSelect value={locale} onChange={setLocale} options={[{ value: '', label: 'Workspace default' }, ...locales]} disabled={!canManage} /></div></div>
    <dl className="grid gap-4 rounded-xl border border-border bg-bg-subtle p-4 sm:grid-cols-2"><Metric label="Email" value={member.email} /><Metric label="Member since" value={formatDate(member.joinedAt ?? member.createdAt)} /><Metric label="Identity ID" value={member.userId} mono /><Metric label="Membership ID" value={member.id} mono /></dl>
    {canManage ? <div className="flex flex-wrap gap-2"><Button onClick={() => void onUpdate({ name, localeOverride: locale || null })}>Save profile</Button>{member.status === 'active' ? <Button variant="outline" disabled={protectedMember} onClick={() => void onUpdate({ status: 'suspended' })}>Suspend</Button> : <Button variant="outline" onClick={() => void onUpdate({ status: 'active' })}>Activate</Button>}</div> : null}
    {canManage ? <section className="rounded-xl border border-danger/30 bg-danger-subtle p-4"><h3 className="text-sm font-semibold text-danger">Remove member</h3><p className="mt-1 text-sm text-fg-muted">Removes the membership, role assignments, and permission overrides from this workspace.</p><Button variant="destructive" size="sm" className="mt-3" disabled={protectedMember} onClick={() => void onRemove()}><Trash2 size={14} />Remove member</Button></section> : null}
  </div>
}

function MemberRoles({ member, roles, options, canManage, protectedMember, onAssign, onUpdateScope, onRemoveAssignment }: { member: MemberRecord; roles: RoleRecord[]; options: ScopeOptions; canManage: boolean; protectedMember: boolean; onAssign: (roleId: string, scope: RoleScope) => Promise<unknown>; onUpdateScope: (assignmentId: string, scope: RoleScope) => Promise<unknown>; onRemoveAssignment: (assignmentId: string) => Promise<unknown> }) {
  const [roleId, setRoleId] = React.useState('')
  const [scope, setScope] = React.useState<RoleScope>({ type: 'tenant' })
  const [editing, setEditing] = React.useState<string | null>(null)
  const availableRoles = roles.filter((role) => !member.assignments.some((assignment) => assignment.roleId === role.id))
  return <div className="space-y-5">
    {canManage && availableRoles.length > 0 ? <section className="space-y-4 rounded-lg border border-border bg-bg-subtle p-4"><div className="space-y-2"><Label>Add role</Label><SearchSelect value={roleId} onChange={setRoleId} options={availableRoles.map((role) => ({ value: role.id, label: role.name, hint: role.description ?? undefined }))} placeholder="Choose a role…" /></div><ScopePicker value={scope} onChange={setScope} options={options} /><div className="flex justify-end"><Button disabled={!roleId} onClick={() => void onAssign(roleId, scope).then(() => setRoleId(''))}><Plus size={14} />Assign role</Button></div></section> : null}
    {member.assignments.length > 0 ? <ul className="divide-y divide-border rounded-lg border border-border">{member.assignments.map((assignment) => <li key={assignment.id} className="p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">{assignment.roleName}</div><div className="text-xs text-fg-muted">{scopeLabel(assignment.scope)}</div></div>{canManage ? <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => setEditing(editing === assignment.id ? null : assignment.id)}>{editing === assignment.id ? 'Cancel' : 'Change scope'}</Button><Button variant="ghost" size="sm" className="text-danger" disabled={protectedMember && member.assignments.length === 1} onClick={() => void onRemoveAssignment(assignment.id)}>Remove</Button></div> : null}</div>{editing === assignment.id ? <AssignmentEditor initial={assignment.scope} options={options} onSave={async (next) => { await onUpdateScope(assignment.id, next); setEditing(null) }} /> : null}</li>)}</ul> : <EmptyState icon={<Shield />} title="No roles assigned" description="Assign a role before this member can access workspace features." />}
  </div>
}

function PermissionOverrides({ member, roles, groups, canManage, onSet, onRemove }: { member: MemberRecord; roles: RoleRecord[]; groups: PermissionGroup[]; canManage: boolean; onSet: (permission: string, effect: 'grant' | 'deny') => Promise<unknown>; onRemove: (permission: string) => Promise<unknown> }) {
  const rolePermissions = new Set(
    member.assignments.flatMap((assignment) =>
      roles.find((role) => role.id === assignment.roleId)?.permissions ?? [],
    ),
  )
  return <div className="space-y-4">
    <div className="rounded-lg border border-border bg-bg-subtle p-4"><h3 className="text-sm font-semibold text-fg">Individual exceptions</h3><p className="mt-1 text-sm text-fg-muted">Grant adds a capability beyond assigned roles. Deny removes it even when a role or wildcard grants it.</p></div>
    {groups.map((group) => <section key={group.key} className="overflow-hidden rounded-lg border border-border"><div className="border-b border-border bg-bg-subtle px-4 py-3"><h3 className="text-sm font-semibold text-fg">{group.label}</h3></div><div className="divide-y divide-border">{group.permissions.map((permission) => { const override = member.overrides.find((value) => value.permission === permission.key); const inherited = rolePermissions.has(permission.key) || [...rolePermissions].some((value) => value === '*' || (value.endsWith('.*') && permission.key.startsWith(value.slice(0, -1)))); return <div key={permission.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center"><div><div className="flex items-center gap-2 text-sm font-medium text-fg">{permission.label}{inherited ? <Badge variant="outline">From role</Badge> : null}</div><div className="font-mono text-xs text-fg-subtle">{permission.key}</div></div><SearchSelect value={override?.effect ?? ''} onChange={(value) => { if (!value) void onRemove(permission.key); else void onSet(permission.key, value as 'grant' | 'deny') }} options={[{ value: '', label: 'From roles' }, { value: 'grant', label: 'Grant' }, { value: 'deny', label: 'Deny' }]} disabled={!canManage} /></div> })}</div></section>)}
  </div>
}

function InviteMemberDrawer({ roles, scopeOptions, locales, onClose, onInvite }: { roles: RoleRecord[]; scopeOptions: ScopeOptions; locales: Array<{ value: string; label: string }>; onClose: () => void; onInvite: (input: { email: string; name: string; localeOverride: string | null; assignments: Array<{ roleId: string; scope: RoleScope }> }) => Promise<void> }) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [locale, setLocale] = React.useState('')
  const [roleId, setRoleId] = React.useState('')
  const [scope, setScope] = React.useState<RoleScope>({ type: 'tenant' })
  const [assignments, setAssignments] = React.useState<Array<{ roleId: string; scope: RoleScope }>>([])
  const available = roles.filter((role) => !assignments.some((assignment) => assignment.roleId === role.id))
  const valid = name.trim() && email.includes('@') && assignments.length > 0
  return <Drawer open onClose={onClose} size="lg" title="Invite member" description="Create a pending membership and send it through your configured identity provider." footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={() => void onInvite({ email, name, localeOverride: locale || null, assignments })}>Send invitation</Button></div>}>
    <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="iam-invite-name">Name</Label><Input id="iam-invite-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="iam-invite-email">Email</Label><Input id="iam-invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div></div><div className="space-y-2"><Label>Language</Label><SearchSelect value={locale} onChange={setLocale} options={[{ value: '', label: 'Workspace default' }, ...locales]} /></div>
      <section className="space-y-4 rounded-lg border border-border bg-bg-subtle p-4"><div className="space-y-2"><Label>Role</Label><SearchSelect value={roleId} onChange={setRoleId} options={available.map((role) => ({ value: role.id, label: role.name }))} placeholder="Choose a role…" /></div><ScopePicker value={scope} onChange={setScope} options={scopeOptions} /><div className="flex justify-end"><Button size="sm" variant="outline" disabled={!roleId} onClick={() => { setAssignments((current) => [...current, { roleId, scope }]); setRoleId(''); setScope({ type: 'tenant' }) }}><Plus size={14} />Add role</Button></div></section>
      {assignments.length > 0 ? <ul className="divide-y divide-border rounded-lg border border-border">{assignments.map((assignment) => { const role = roles.find((candidate) => candidate.id === assignment.roleId); return <li key={assignment.roleId} className="flex items-center justify-between gap-3 px-3 py-2"><div><div className="text-sm font-medium text-fg">{role?.name ?? assignment.roleId}</div><div className="text-xs text-fg-muted">{scopeLabel(assignment.scope)}</div></div><Button size="icon" variant="ghost" aria-label={`Remove ${role?.name ?? 'role'}`} onClick={() => setAssignments((current) => current.filter((value) => value.roleId !== assignment.roleId))}><X size={16} /></Button></li>})}</ul> : <p className="text-sm text-fg-muted">At least one role is required.</p>}
    </div>
  </Drawer>
}

function AssignmentEditor({ initial, options, onSave }: { initial: RoleScope; options: ScopeOptions; onSave: (scope: RoleScope) => Promise<void> }) { const [scope, setScope] = React.useState(initial); return <div className="mt-3 space-y-3 rounded-lg border border-border bg-bg-subtle p-3"><ScopePicker value={scope} onChange={setScope} options={options} /><div className="flex justify-end"><Button size="sm" onClick={() => void onSave(scope)}>Save scope</Button></div></div> }

function MemberTabs({ value, onChange }: { value: MemberTab; onChange: (tab: MemberTab) => void }) { const items: Array<{ value: MemberTab; label: string }> = [{ value: 'profile', label: 'Profile' }, { value: 'roles', label: 'Roles & scope' }, { value: 'permissions', label: 'Permission overrides' }]; return <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Member sections">{items.map((item) => <button key={item.value} type="button" onClick={() => onChange(item.value)} className={cn('shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors', value === item.value ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg')}>{item.label}</button>)}</nav> }
function StatusBadge({ status }: { status: MembershipStatus }) { return <Badge variant={status === 'active' ? 'success' : status === 'invited' ? 'warning' : 'secondary'}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge> }
function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</dt><dd className={cn('mt-1 truncate text-sm font-semibold text-fg', mono && 'font-mono text-xs')}>{value}</dd></div> }
function formatDate(value: Date) { return value.toLocaleDateString(undefined, { dateStyle: 'medium' }) }
function scopeLabel(scope: RoleScope): string { if (scope.type === 'tenant') return 'All records'; if (scope.type === 'self') return 'Own records'; if (scope.type === 'sites') return `${scope.siteIds.length} selected sites`; if (scope.type === 'people') return `${scope.personIds.length} selected people`; if (scope.type === 'crews') return `${scope.crewIds.length} selected crews`; return `${scope.departmentIds.length} departments, ${scope.groupIds.length} groups` }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'The IAM operation failed.' }
