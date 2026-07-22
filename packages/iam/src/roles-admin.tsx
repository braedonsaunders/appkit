'use client'

import * as React from 'react'
import {
  Badge,
  Button,
  Checkbox,
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
  confirmDialog,
} from '@appkit/ui'
import { Copy, Plus, Search, Shield, Trash2, UserPlus, UsersRound, X } from 'lucide-react'
import { PermissionMatrix } from './permission-matrix'
import { ScopePicker } from './scope-picker'
import { collectAll, ServicePagination, SortButton } from './admin-list'
import { ActivityList } from './activity-list'
import type {
  IamAdminService,
  BulkRoleAssignmentInput,
  MemberRecord,
  PermissionGroup,
  RoleRecord,
  RoleScope,
  ScopeOptions,
} from './types'

type RoleTab = 'details' | 'permissions' | 'members' | 'activity' | string

export type RoleAdminExtension = {
  key: string
  label: string
  render: (context: { role: RoleRecord; service: IamAdminService; refresh: () => Promise<void> }) => React.ReactNode
}

export type RolesAdminProps = {
  service: IamAdminService
  permissionGroups: PermissionGroup[]
  scopeOptions?: ScopeOptions
  title?: string
  description?: string
  canManage?: boolean
  detailTabs?: RoleAdminExtension[]
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
  detailTabs = [],
  onError,
}: RolesAdminProps) {
  assertUniqueExtensions(detailTabs, ['details', 'permissions', 'members', 'activity'], 'role')
  const [roles, setRoles] = React.useState<RoleRecord[]>([])
  const [roleOptions, setRoleOptions] = React.useState<RoleRecord[]>([])
  const [members, setMembers] = React.useState<MemberRecord[]>([])
  const [query, setQuery] = React.useState('')
  const deferredQuery = React.useDeferredValue(query)
  const [roleType, setRoleType] = React.useState<'built_in' | 'custom' | ''>('')
  const [sort, setSort] = React.useState<'name' | 'permissions' | 'members' | 'updated'>('name')
  const [direction, setDirection] = React.useState<'asc' | 'desc'>('asc')
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [typeCounts, setTypeCounts] = React.useState({ built_in: 0, custom: 0 })
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [bulkEditing, setBulkEditing] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [roleResult, memberResult, allRoles] = await Promise.all([
        service.listRoles({ q: deferredQuery || undefined, type: roleType || undefined, page, perPage: 25, sort, direction }),
        collectMembers(service),
        collectRoles(service),
      ])
      setRoles(roleResult.rows)
      setRoleOptions(allRoles)
      setTotal(roleResult.total)
      setTypeCounts(roleResult.facets.typeCounts)
      setMembers(memberResult.rows)
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause))
      onError?.(cause)
    } finally {
      setLoading(false)
    }
  }, [deferredQuery, direction, onError, page, roleType, service, sort])

  React.useEffect(() => { void load() }, [load])

  const selected = roles.find((role) => role.id === selectedId) ?? null
  React.useEffect(() => { setPage(1) }, [deferredQuery, roleType])

  function changeSort(next: typeof sort) {
    if (sort === next) setDirection((value) => value === 'asc' ? 'desc' : 'asc')
    else { setSort(next); setDirection('asc') }
    setPage(1)
  }

  async function mutate(operation: () => Promise<unknown>): Promise<boolean> {
    try {
      setError(null)
      await operation()
      await load()
      return true
    } catch (cause) {
      setError(errorMessage(cause))
      onError?.(cause)
      return false
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p>
        </div>
        {canManage ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setBulkEditing(true)}><UsersRound size={16} />Manage members</Button><Button onClick={() => setCreating(true)}><Plus size={16} />New role</Button></div> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-64 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles…" className="pl-9" />
        </div>
        <RoleTypeFilters value={roleType} counts={typeCounts} onChange={setRoleType} />
      </div>

      {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow noAnimate>
              <TableHead><SortButton label="Role" active={sort === 'name'} direction={direction} onClick={() => changeSort('name')} /></TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Description</TableHead>
              <TableHead><SortButton label="Permissions" active={sort === 'permissions'} direction={direction} onClick={() => changeSort('permissions')} /></TableHead>
              <TableHead><SortButton label="Members" active={sort === 'members'} direction={direction} onClick={() => changeSort('members')} /></TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
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
                </TableCell>
                <TableCell className="font-mono text-xs text-fg-muted">{role.key}</TableCell>
                <TableCell className="max-w-md text-fg-muted"><span className="line-clamp-1">{role.description ?? '—'}</span></TableCell>
                <TableCell className="tabular-nums text-fg-muted">{role.permissions.length}</TableCell>
                <TableCell className="tabular-nums text-fg-muted">{role.memberCount}</TableCell>
                <TableCell><Badge variant={role.isBuiltIn ? 'secondary' : 'outline'}>{role.isBuiltIn ? 'Built-in' : 'Custom'}</Badge></TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setSelectedId(role.id) }}>{roleCan(role, 'updateDetails') || roleCan(role, 'updatePermissions') ? 'Edit' : 'View'}</Button></TableCell>
              </TableRow>
            ))}
            {!loading && roles.length === 0 ? (
              <TableRow noAnimate><TableCell colSpan={7}><EmptyState icon={<Shield />} title="No roles found" description="Try a different search or create a role." className="border-0 bg-transparent py-10 shadow-none" /></TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <ServicePagination page={page} perPage={25} total={total} onPage={setPage} />

      {selected ? (
        <RoleDetailDrawer
          role={selected}
          service={service}
          members={members}
          permissionGroups={permissionGroups}
          scopeOptions={scopeOptions}
          canManage={canManage}
          extensions={detailTabs}
          refresh={load}
          onClose={() => setSelectedId(null)}
          onEdit={() => setEditing(true)}
          onDuplicate={() => mutate(async () => { const duplicate = await service.duplicateRole(selected.id); setSelectedId(duplicate.id) })}
          onDelete={async () => {
            if (!(await confirmDialog({ message: `Delete ${selected.name}? This cannot be undone.`, confirmLabel: 'Delete role', tone: 'danger' }))) return
            await mutate(async () => { await service.deleteRole(selected.id); setSelectedId(null) })
          }}
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
            const saved = await mutate(async () => {
              const saved = editing && selected
                ? await service.updateRole(selected.id, input)
                : await service.createRole(input)
              setSelectedId(saved.id)
            })
            if (!saved) return
            setCreating(false)
            setEditing(false)
          }}
        />
      ) : null}

      {bulkEditing ? <BulkRoleAssignmentDrawer roles={roleOptions} members={members} scopeOptions={scopeOptions} onClose={() => setBulkEditing(false)} onSubmit={(input) => mutate(() => service.bulkUpdateRoleAssignments(input))} /> : null}
    </div>
  )
}

function RoleDetailDrawer({
  role,
  service,
  members,
  permissionGroups,
  scopeOptions,
  canManage,
  extensions,
  refresh,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  onAssign,
  onUpdateScope,
  onRemoveAssignment,
}: {
  role: RoleRecord
  service: IamAdminService
  members: MemberRecord[]
  permissionGroups: PermissionGroup[]
  scopeOptions: ScopeOptions
  canManage: boolean
  extensions: RoleAdminExtension[]
  refresh: () => Promise<void>
  onClose: () => void
  onEdit: () => void
  onDuplicate: () => Promise<unknown>
  onDelete: () => Promise<unknown>
  onAssign: (membershipId: string, scope: RoleScope) => Promise<boolean>
  onUpdateScope: (assignmentId: string, scope: RoleScope) => Promise<boolean>
  onRemoveAssignment: (assignmentId: string) => Promise<boolean>
}) {
  const [tab, setTab] = React.useState<RoleTab>('details')
  const [activity, setActivity] = React.useState<Awaited<ReturnType<IamAdminService['listAuditEvents']>>['rows']>([])
  const roleMembers = members.flatMap((member) => {
    const assignment = member.assignments.find((candidate) => candidate.roleId === role.id)
    return assignment ? [{ member, assignment }] : []
  })

  React.useEffect(() => {
    if (tab !== 'activity') return
    void service.listAuditEvents({ recordType: 'role', recordId: role.id, perPage: 25, sort: 'at', direction: 'desc' }).then((result) => setActivity(result.rows))
  }, [role.id, service, tab])

  return (
    <Drawer
      open
      onClose={onClose}
      size="xl"
      title={<span className="flex items-center gap-2">{role.name}<Badge variant={role.isBuiltIn ? 'secondary' : 'outline'}>{role.isBuiltIn ? 'Built-in' : 'Custom'}</Badge></span>}
      description={role.description ?? `Role key: ${role.key}`}
      headerActions={canManage ? <>
        {roleCan(role, 'updateDetails') || roleCan(role, 'updatePermissions') ? <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button> : null}
        {roleCan(role, 'duplicate') ? <Button size="sm" variant="outline" onClick={() => void onDuplicate()}><Copy size={14} />Duplicate</Button> : null}
      </> : undefined}
      subtabs={<RoleTabs value={tab} onChange={setTab} extensions={extensions} />}
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
          {canManage && roleCan(role, 'delete') ? (
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
          candidates={members.filter((member) => memberCan(member, 'manageRoles') && !member.assignments.some((assignment) => assignment.roleId === role.id) && member.status === 'active')}
          scopeOptions={scopeOptions}
          canManage={canManage}
          onAssign={onAssign}
          onUpdateScope={onUpdateScope}
          onRemove={onRemoveAssignment}
        />
      ) : null}
      {tab === 'activity' ? <ActivityList events={activity} /> : null}
      {extensions.map((extension) => tab === extension.key ? <React.Fragment key={extension.key}>{extension.render({ role, service, refresh })}</React.Fragment> : null)}
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
  const canSave = !role || roleCan(role, 'updateDetails') || roleCan(role, 'updatePermissions')

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
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>{canSave ? 'Cancel' : 'Close'}</Button>{canSave ? <Button type="submit" form="appkit-role-editor" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save role'}</Button> : null}</div>}
    >
      <form id="appkit-role-editor" onSubmit={(event) => void submit(event)} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="iam-role-name">Name</Label><Input id="iam-role-name" value={name} onChange={(event) => setName(event.target.value)} required disabled={Boolean(role && !roleCan(role, 'updateDetails'))} /></div>
          <div className="space-y-2"><Label htmlFor="iam-role-key">Stable key</Label><Input id="iam-role-key" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Generated from name" disabled={Boolean(role && !roleCan(role, 'updateKey'))} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="iam-role-description">Description</Label><Textarea id="iam-role-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} disabled={Boolean(role && !roleCan(role, 'updateDetails'))} /></div>
        <PermissionMatrix groups={permissionGroups} value={permissions} onChange={setPermissions} readOnly={Boolean(role && !roleCan(role, 'updatePermissions'))} />
      </form>
    </Drawer>
  )
}

const BULK_OPERATIONS: Array<{ value: BulkRoleAssignmentInput['operation']; label: string; description: string }> = [
  { value: 'add', label: 'Add or update', description: 'Keep existing roles and update this role’s access scope.' },
  { value: 'replace', label: 'Replace roles', description: 'Remove existing roles and assign only this role.' },
  { value: 'remove', label: 'Remove role', description: 'Remove this role from the selected members.' },
]

function BulkRoleAssignmentDrawer({
  roles,
  members,
  scopeOptions,
  onClose,
  onSubmit,
}: {
  roles: RoleRecord[]
  members: MemberRecord[]
  scopeOptions: ScopeOptions
  onClose: () => void
  onSubmit: (input: BulkRoleAssignmentInput) => Promise<boolean>
}) {
  const [operation, setOperation] = React.useState<BulkRoleAssignmentInput['operation']>('add')
  const [roleId, setRoleId] = React.useState(roles[0]?.id ?? '')
  const [scope, setScope] = React.useState<RoleScope>({ type: 'self' })
  const [query, setQuery] = React.useState('')
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [confirming, setConfirming] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const normalized = query.trim().toLocaleLowerCase()
  const filtered = members.filter((member) => !normalized || `${member.name} ${member.email} ${member.assignments.map((assignment) => assignment.roleName).join(' ')}`.toLocaleLowerCase().includes(normalized))
  const eligible = filtered.filter((member) => memberCan(member, 'manageRoles'))
  const allVisibleSelected = eligible.length > 0 && eligible.every((member) => selected.has(member.id))
  const overLimit = selected.size > 250
  const selectedRole = roles.find((role) => role.id === roleId)

  function toggleVisible() {
    setSelected((current) => {
      const next = new Set(current)
      for (const member of eligible) {
        if (allVisibleSelected) next.delete(member.id)
        else next.add(member.id)
      }
      return next
    })
  }

  async function apply() {
    if (!roleId || selected.size === 0 || overLimit) return
    if (operation !== 'add' && !confirming) { setConfirming(true); return }
    setSaving(true)
    try {
      if (await onSubmit({ operation, roleId, membershipIds: [...selected], scope })) onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size="2xl"
      title="Manage member roles"
      description="Apply one role operation to up to 250 members with the same access scope."
      footer={<div className="flex w-full items-center justify-between gap-3"><span className="text-sm text-fg-muted">{selected.size} selected</span><div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!roleId || selected.size === 0 || overLimit || saving} onClick={() => void apply()}><UsersRound size={14} />{saving ? 'Applying…' : confirming ? 'Confirm change' : 'Apply roles'}</Button></div></div>}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <div className="space-y-2"><Label>Role</Label><SearchSelect value={roleId} onChange={(value) => { setRoleId(value); setConfirming(false) }} options={roles.map((role) => ({ value: role.id, label: role.name, hint: role.isBuiltIn ? 'Built-in' : undefined }))} placeholder="Choose a role…" /></div>
          <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium text-fg">Operation</legend>{BULK_OPERATIONS.map((item) => <label key={item.value} className={cn('flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 transition-colors', operation === item.value ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-surface-hover')}><input type="radio" name="bulk-operation" value={item.value} checked={operation === item.value} onChange={() => { setOperation(item.value); setConfirming(false) }} className="mt-0.5 accent-primary" /><span><span className="block text-sm font-medium text-fg">{item.label}</span><span className="mt-0.5 block text-xs text-fg-muted">{item.description}</span></span></label>)}</fieldset>
          {operation !== 'remove' ? <ScopePicker value={scope} onChange={setScope} options={scopeOptions} /> : null}
          {confirming ? <div role="alert" className="rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm text-fg"><strong className="block text-warning">Confirm bulk access change</strong><span className="mt-1 block text-fg-muted">{operation === 'replace' ? 'Replace every existing role' : 'Remove this role'} for {selected.size} {selected.size === 1 ? 'member' : 'members'}{selectedRole ? ` using “${selectedRole.name}”` : ''}.</span></div> : null}
        </div>
        <div className="min-h-0 space-y-3">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search members or roles…" className="pl-9" /></div>
          <div className="flex items-center justify-between gap-3 text-xs text-fg-muted"><button type="button" onClick={toggleVisible} className="font-medium text-primary hover:underline">{allVisibleSelected ? 'Clear visible' : 'Select visible'}</button><span>{filtered.length} shown</span></div>
          <div className="max-h-[32rem] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {filtered.map((member) => { const allowed = memberCan(member, 'manageRoles'); return <label key={member.id} className={cn('flex items-start gap-3 px-3 py-2.5', allowed ? 'cursor-pointer hover:bg-surface-hover' : 'cursor-not-allowed bg-bg-subtle opacity-70')}><Checkbox checked={selected.has(member.id)} disabled={!allowed} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(member.id); else next.delete(member.id); return next })} className="mt-0.5" /><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-sm font-medium text-fg">{member.name}{member.isCurrentUser ? <Badge variant="outline">You</Badge> : null}{member.isSuperAdmin ? <Badge variant="warning">Super-admin</Badge> : null}</span><span className="block truncate text-xs text-fg-muted">{member.email}</span><span className="mt-1 flex flex-wrap gap-1">{member.assignments.map((assignment) => <Badge key={assignment.id} variant="secondary">{assignment.roleName}</Badge>)}</span></span></label> })}
          </div>
          {overLimit ? <p role="alert" className="text-sm text-danger">Select 250 or fewer members at a time.</p> : null}
        </div>
      </div>
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
  onAssign: (membershipId: string, scope: RoleScope) => Promise<boolean>
  onUpdateScope: (assignmentId: string, scope: RoleScope) => Promise<boolean>
  onRemove: (assignmentId: string) => Promise<boolean>
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
            <Button disabled={!picked.length} onClick={() => void Promise.all(picked.map((id) => onAssign(id, scope))).then((results) => { if (results.every(Boolean)) { setAdding(false); setPicked([]) } })}><Plus size={14} />Add {picked.length || ''}</Button>
          </div>
        </div>
      ) : null}

      {members.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {members.map(({ member, assignment }) => {
            const locked = !memberCan(member, 'manageRoles')
            return (
              <li key={assignment.id} className="px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-medium text-fg">{member.name}</span>{member.isCurrentUser ? <Badge variant="outline">You</Badge> : null}{member.isSuperAdmin ? <Badge variant="warning">Protected</Badge> : null}</div>
                    <div className="truncate text-xs text-fg-muted">{member.email}</div>
                    <div className="mt-0.5 text-xs text-fg-muted">{scopeLabel(assignment.scope)}</div>
                  </div>
                  {canManage && !locked ? <div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" onClick={() => setEditing(editing === assignment.id ? null : assignment.id)}>{editing === assignment.id ? 'Cancel' : 'Change scope'}</Button><Button variant="ghost" size="sm" className="text-danger" onClick={() => void confirmDialog({ message: `Remove ${member.name} from ${role.name}?`, confirmLabel: 'Remove assignment', tone: 'danger' }).then((confirmed) => confirmed ? onRemove(assignment.id) : false)}>Remove</Button></div> : <span className="text-xs text-fg-subtle">Protected</span>}
                </div>
                {editing === assignment.id ? <AssignmentScopeEditor assignmentId={assignment.id} initial={assignment.scope} options={scopeOptions} onSave={async (next) => { if (await onUpdateScope(assignment.id, next)) setEditing(null) }} /> : null}
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

function RoleTabs({ value, onChange, extensions }: { value: RoleTab; onChange: (tab: RoleTab) => void; extensions: RoleAdminExtension[] }) {
  const items: Array<{ value: RoleTab; label: string }> = [{ value: 'details', label: 'Details' }, { value: 'permissions', label: 'Permissions' }, { value: 'members', label: 'Members' }, { value: 'activity', label: 'Activity' }, ...extensions.map((extension) => ({ value: extension.key, label: extension.label }))]
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

async function collectMembers(service: IamAdminService) {
  const rows = await collectAll((page, perPage) => service.listMembers({ page, perPage, sort: 'name' }))
  return { rows, total: rows.length, page: 1, perPage: rows.length || 1 }
}

function collectRoles(service: IamAdminService) {
  return collectAll((page, perPage) => service.listRoles({ page, perPage, sort: 'name' }))
}

function roleCan(role: RoleRecord, capability: keyof NonNullable<RoleRecord['capabilities']>): boolean {
  if (role.capabilities) return Boolean(role.capabilities[capability])
  if (capability === 'updateKey' || capability === 'delete') return !role.isBuiltIn
  return true
}
function RoleTypeFilters({ value, counts, onChange }: { value: 'built_in' | 'custom' | ''; counts: { built_in: number; custom: number }; onChange: (value: 'built_in' | 'custom' | '') => void }) { const filters = [{ value: '' as const, label: 'All', count: counts.built_in + counts.custom }, { value: 'built_in' as const, label: 'Built-in', count: counts.built_in }, { value: 'custom' as const, label: 'Custom', count: counts.custom }]; return <div className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-1" aria-label="Filter roles by type">{filters.map((filter) => <button key={filter.value || 'all'} type="button" aria-pressed={value === filter.value} onClick={() => onChange(filter.value)} className={cn('flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors', value === filter.value ? 'bg-primary-subtle text-primary' : 'text-fg-muted hover:bg-surface-hover hover:text-fg')}><span>{filter.label}</span><span className="tabular-nums text-fg-subtle">{filter.count}</span></button>)}</div> }

function memberCan(member: MemberRecord, capability: keyof NonNullable<MemberRecord['capabilities']>): boolean {
  if (member.capabilities) return Boolean(member.capabilities[capability])
  if (capability === 'updateProfile' || capability === 'resendInvite') return !member.isSuperAdmin
  return !member.isCurrentUser && !member.isSuperAdmin
}
function assertUniqueExtensions(extensions: RoleAdminExtension[], reserved: string[], surface: string) { const keys = new Set(reserved); for (const extension of extensions) { if (!extension.key.trim() || keys.has(extension.key)) throw new Error(`Duplicate or reserved ${surface} detail tab key: ${extension.key || '(empty)'}`); keys.add(extension.key) } }
