'use client'

import * as React from 'react'
import {
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
  Textarea,
  cn,
} from '@appkit/ui'
import { Copy, Plus, Search, Shield, Trash2, UserPlus, X } from 'lucide-react'
import { PermissionMatrix } from './permission-matrix'
import { ScopePicker } from './scope-picker'
import type {
  IamAdminService,
  MemberRecord,
  PermissionGroup,
  RoleRecord,
  RoleScope,
  ScopeOptions,
} from './types'

type RoleTab = 'details' | 'permissions' | 'members'

export type RolesAdminProps = {
  service: IamAdminService
  permissionGroups: PermissionGroup[]
  scopeOptions?: ScopeOptions
  title?: string
  description?: string
  canManage?: boolean
  onError?: (error: unknown) => void
}

/**
 * Production role administration: searchable list, full editor, permission
 * matrix, duplicate/delete protections, member assignment, and scoped access.
 */
export function RolesAdmin({
  service,
  permissionGroups,
  scopeOptions = {},
  title = 'Roles',
  description = 'Create roles, grant permissions, and control record visibility.',
  canManage = true,
  onError,
}: RolesAdminProps) {
  const [roles, setRoles] = React.useState<RoleRecord[]>([])
  const [members, setMembers] = React.useState<MemberRecord[]>([])
  const [query, setQuery] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [roleResult, memberResult] = await Promise.all([
        service.listRoles({ perPage: 100, sort: 'name' }),
        service.listMembers({ perPage: 100, sort: 'name' }),
      ])
      setRoles(roleResult.rows)
      setMembers(memberResult.rows)
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause))
      onError?.(cause)
    } finally {
      setLoading(false)
    }
  }, [onError, service])

  React.useEffect(() => { void load() }, [load])

  const selected = roles.find((role) => role.id === selectedId) ?? null
  const normalized = query.trim().toLocaleLowerCase()
  const visibleRoles = roles.filter((role) =>
    !normalized || `${role.name} ${role.key} ${role.description ?? ''}`.toLocaleLowerCase().includes(normalized),
  )

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p>
        </div>
        {canManage ? <Button onClick={() => setCreating(true)}><Plus size={16} />New role</Button> : null}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles…" className="pl-9" />
      </div>

      {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</div> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow noAnimate>
              <TableHead>Role</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRoles.map((role) => (
              <TableRow
                key={role.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer"
                onClick={() => setSelectedId(role.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedId(role.id)
                  }
                }}
              >
                <TableCell>
                  <div className="font-medium text-fg">{role.name}</div>
                  <div className="mt-0.5 max-w-xl truncate text-xs text-fg-muted">{role.description ?? role.key}</div>
                </TableCell>
                <TableCell className="tabular-nums text-fg-muted">{role.permissions.length}</TableCell>
                <TableCell className="tabular-nums text-fg-muted">{role.memberCount}</TableCell>
                <TableCell><Badge variant={role.isBuiltIn ? 'secondary' : 'outline'}>{role.isBuiltIn ? 'Built-in' : 'Custom'}</Badge></TableCell>
              </TableRow>
            ))}
            {!loading && visibleRoles.length === 0 ? (
              <TableRow noAnimate><TableCell colSpan={4}><EmptyState icon={<Shield />} title="No roles found" description="Try a different search or create a role." className="border-0 bg-transparent py-10 shadow-none" /></TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {selected ? (
        <RoleDetailDrawer
          role={selected}
          members={members}
          permissionGroups={permissionGroups}
          scopeOptions={scopeOptions}
          canManage={canManage}
          onClose={() => setSelectedId(null)}
          onEdit={() => setEditing(true)}
          onDuplicate={() => mutate(async () => { const duplicate = await service.duplicateRole(selected.id); setSelectedId(duplicate.id) })}
          onDelete={() => mutate(async () => { await service.deleteRole(selected.id); setSelectedId(null) })}
          onAssign={(membershipId, scope) => mutate(() => service.assignRole(membershipId, selected.id, scope))}
          onUpdateScope={(assignmentId, scope) => mutate(() => service.updateAssignmentScope(assignmentId, scope))}
          onRemoveAssignment={(assignmentId) => mutate(() => service.removeAssignment(assignmentId))}
        />
      ) : null}

      {creating || (editing && selected) ? (
        <RoleEditorDrawer
          role={editing ? selected : null}
          permissionGroups={permissionGroups}
          onClose={() => { setCreating(false); setEditing(false) }}
          onSave={async (input) => {
            await mutate(async () => {
              const saved = editing && selected
                ? await service.updateRole(selected.id, input)
                : await service.createRole(input)
              setSelectedId(saved.id)
            })
            setCreating(false)
            setEditing(false)
          }}
        />
      ) : null}
    </div>
  )
}

function RoleDetailDrawer({
  role,
  members,
  permissionGroups,
  scopeOptions,
  canManage,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  onAssign,
  onUpdateScope,
  onRemoveAssignment,
}: {
  role: RoleRecord
  members: MemberRecord[]
  permissionGroups: PermissionGroup[]
  scopeOptions: ScopeOptions
  canManage: boolean
  onClose: () => void
  onEdit: () => void
  onDuplicate: () => Promise<unknown>
  onDelete: () => Promise<unknown>
  onAssign: (membershipId: string, scope: RoleScope) => Promise<unknown>
  onUpdateScope: (assignmentId: string, scope: RoleScope) => Promise<unknown>
  onRemoveAssignment: (assignmentId: string) => Promise<unknown>
}) {
  const [tab, setTab] = React.useState<RoleTab>('details')
  const roleMembers = members.flatMap((member) => {
    const assignment = member.assignments.find((candidate) => candidate.roleId === role.id)
    return assignment ? [{ member, assignment }] : []
  })

  return (
    <Drawer
      open
      onClose={onClose}
      size="xl"
      title={<span className="flex items-center gap-2">{role.name}<Badge variant={role.isBuiltIn ? 'secondary' : 'outline'}>{role.isBuiltIn ? 'Built-in' : 'Custom'}</Badge></span>}
      description={role.description ?? `Role key: ${role.key}`}
      headerActions={canManage ? <>
        <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="outline" onClick={() => void onDuplicate()}><Copy size={14} />Duplicate</Button>
      </> : undefined}
      subtabs={<RoleTabs value={tab} onChange={setTab} />}
    >
      {tab === 'details' ? (
        <div className="space-y-6">
          <dl className="grid gap-4 rounded-xl border border-border bg-bg-subtle p-4 sm:grid-cols-3">
            <Metric label="Role key" value={role.key} mono />
            <Metric label="Permissions" value={String(role.permissions.length)} />
            <Metric label="Members" value={String(role.memberCount)} />
          </dl>
          <section>
            <h3 className="text-sm font-semibold text-fg">Description</h3>
            <p className="mt-2 text-sm leading-6 text-fg-muted">{role.description ?? 'No description provided.'}</p>
          </section>
          {canManage && !role.isBuiltIn ? (
            <section className="rounded-xl border border-danger/30 bg-danger-subtle p-4">
              <h3 className="text-sm font-semibold text-danger">Delete role</h3>
              <p className="mt-1 text-sm text-fg-muted">The role can be deleted after all member assignments have been removed.</p>
              <Button variant="destructive" size="sm" className="mt-3" onClick={() => void onDelete()}><Trash2 size={14} />Delete role</Button>
            </section>
          ) : null}
        </div>
      ) : null}
      {tab === 'permissions' ? <PermissionMatrix groups={permissionGroups} value={role.permissions} readOnly /> : null}
      {tab === 'members' ? (
        <RoleMembersManager
          role={role}
          members={roleMembers}
          candidates={members.filter((member) => !member.assignments.some((assignment) => assignment.roleId === role.id) && member.status === 'active')}
          scopeOptions={scopeOptions}
          canManage={canManage}
          onAssign={onAssign}
          onUpdateScope={onUpdateScope}
          onRemove={onRemoveAssignment}
        />
      ) : null}
    </Drawer>
  )
}

function RoleEditorDrawer({
  role,
  permissionGroups,
  onClose,
  onSave,
}: {
  role: RoleRecord | null
  permissionGroups: PermissionGroup[]
  onClose: () => void
  onSave: (input: { key?: string; name: string; description: string | null; permissions: string[] }) => Promise<void>
}) {
  const [name, setName] = React.useState(role?.name ?? '')
  const [key, setKey] = React.useState(role?.key ?? '')
  const [description, setDescription] = React.useState(role?.description ?? '')
  const [permissions, setPermissions] = React.useState(role?.permissions ?? [])
  const [saving, setSaving] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSave({ key: key || undefined, name, description: description || null, permissions })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open
      stacked={Boolean(role)}
      onClose={onClose}
      size="xl"
      title={role ? `Edit ${role.name}` : 'New role'}
      description="Name the role and choose the capabilities it grants."
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="appkit-role-editor" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save role'}</Button></div>}
    >
      <form id="appkit-role-editor" onSubmit={(event) => void submit(event)} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="iam-role-name">Name</Label><Input id="iam-role-name" value={name} onChange={(event) => setName(event.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="iam-role-key">Stable key</Label><Input id="iam-role-key" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Generated from name" disabled={role?.isBuiltIn} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="iam-role-description">Description</Label><Textarea id="iam-role-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></div>
        <PermissionMatrix groups={permissionGroups} value={permissions} onChange={setPermissions} />
      </form>
    </Drawer>
  )
}

function RoleMembersManager({
  role,
  members,
  candidates,
  scopeOptions,
  canManage,
  onAssign,
  onUpdateScope,
  onRemove,
}: {
  role: RoleRecord
  members: Array<{ member: MemberRecord; assignment: MemberRecord['assignments'][number] }>
  candidates: MemberRecord[]
  scopeOptions: ScopeOptions
  canManage: boolean
  onAssign: (membershipId: string, scope: RoleScope) => Promise<unknown>
  onUpdateScope: (assignmentId: string, scope: RoleScope) => Promise<unknown>
  onRemove: (assignmentId: string) => Promise<unknown>
}) {
  const [adding, setAdding] = React.useState(false)
  const [picked, setPicked] = React.useState<string[]>([])
  const [scope, setScope] = React.useState<RoleScope>({ type: 'tenant' })
  const [editing, setEditing] = React.useState<string | null>(null)

  const available = candidates.filter((member) => !picked.includes(member.id))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{members.length} {members.length === 1 ? 'member' : 'members'} assigned</p>
        {canManage && !adding ? <Button variant="outline" size="sm" onClick={() => setAdding(true)}><UserPlus size={14} />Add members</Button> : null}
      </div>

      {adding ? (
        <div className="space-y-4 rounded-lg border border-border bg-bg-subtle p-4">
          <div className="space-y-2">
            <Label>Members</Label>
            <SearchSelect value="" onChange={(value) => value && setPicked((current) => [...current, value])} options={available.map((member) => ({ value: member.id, label: member.name, hint: member.email }))} placeholder={available.length ? 'Select members…' : 'No available members'} disabled={!available.length} />
            <div className="flex flex-wrap gap-1.5">
              {picked.map((id) => {
                const member = candidates.find((candidate) => candidate.id === id)
                return member ? <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary-subtle py-1 pl-2.5 pr-1 text-xs font-medium text-primary">{member.name}<button type="button" aria-label={`Remove ${member.name}`} onClick={() => setPicked((current) => current.filter((value) => value !== id))} className="rounded-full p-0.5 hover:bg-surface-hover"><X size={12} /></button></span> : null
              })}
            </div>
          </div>
          <ScopePicker value={scope} onChange={setScope} options={scopeOptions} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setAdding(false); setPicked([]) }}>Cancel</Button>
            <Button disabled={!picked.length} onClick={() => void Promise.all(picked.map((id) => onAssign(id, scope))).then(() => { setAdding(false); setPicked([]) })}><Plus size={14} />Add {picked.length || ''}</Button>
          </div>
        </div>
      ) : null}

      {members.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {members.map(({ member, assignment }) => {
            const locked = member.isCurrentUser || member.isSuperAdmin
            return (
              <li key={assignment.id} className="px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-medium text-fg">{member.name}</span>{member.isCurrentUser ? <Badge variant="outline">You</Badge> : null}{member.isSuperAdmin ? <Badge variant="warning">Protected</Badge> : null}</div>
                    <div className="truncate text-xs text-fg-muted">{member.email}</div>
                    <div className="mt-0.5 text-xs text-fg-muted">{scopeLabel(assignment.scope)}</div>
                  </div>
                  {canManage && !locked ? <div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" onClick={() => setEditing(editing === assignment.id ? null : assignment.id)}>{editing === assignment.id ? 'Cancel' : 'Change scope'}</Button><Button variant="ghost" size="sm" className="text-danger" onClick={() => void onRemove(assignment.id)}>Remove</Button></div> : <span className="text-xs text-fg-subtle">Protected</span>}
                </div>
                {editing === assignment.id ? <AssignmentScopeEditor assignmentId={assignment.id} initial={assignment.scope} options={scopeOptions} onSave={async (next) => { await onUpdateScope(assignment.id, next); setEditing(null) }} /> : null}
              </li>
            )
          })}
        </ul>
      ) : <EmptyState icon={<Shield />} title={`No members have ${role.name}`} description="Add active members to grant this role." />}
    </div>
  )
}

function AssignmentScopeEditor({ assignmentId, initial, options, onSave }: { assignmentId: string; initial: RoleScope; options: ScopeOptions; onSave: (scope: RoleScope) => Promise<void> }) {
  const [scope, setScope] = React.useState(initial)
  return <div className="mt-3 space-y-3 rounded-lg border border-border bg-bg-subtle p-3" data-assignment={assignmentId}><ScopePicker value={scope} onChange={setScope} options={options} /><div className="flex justify-end"><Button size="sm" onClick={() => void onSave(scope)}>Save scope</Button></div></div>
}

function RoleTabs({ value, onChange }: { value: RoleTab; onChange: (tab: RoleTab) => void }) {
  const items: Array<{ value: RoleTab; label: string }> = [{ value: 'details', label: 'Details' }, { value: 'permissions', label: 'Permissions' }, { value: 'members', label: 'Members' }]
  return <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Role sections">{items.map((item) => <button key={item.value} type="button" onClick={() => onChange(item.value)} className={cn('shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors', value === item.value ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg')}>{item.label}</button>)}</nav>
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</dt><dd className={cn('mt-1 text-sm font-semibold text-fg', mono && 'font-mono')}>{value}</dd></div>
}

function scopeLabel(scope: RoleScope): string {
  if (scope.type === 'tenant') return 'All records'
  if (scope.type === 'self') return 'Own records'
  if (scope.type === 'sites') return `${scope.siteIds.length} selected ${scope.siteIds.length === 1 ? 'site' : 'sites'}`
  if (scope.type === 'people') return `${scope.personIds.length} selected ${scope.personIds.length === 1 ? 'person' : 'people'}`
  if (scope.type === 'crews') return `${scope.crewIds.length} selected ${scope.crewIds.length === 1 ? 'crew' : 'crews'}`
  return `${scope.departmentIds.length} departments, ${scope.groupIds.length} groups`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The IAM operation failed.'
}
