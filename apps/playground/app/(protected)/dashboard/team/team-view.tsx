'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { Loader2, Mail, Plus, Users } from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Input,
  Label,
  RecordList,
  type RecordColumn,
  toast,
} from '@appkit/ui'
import { inviteMemberAction } from '../../../../lib/server/actions'

export type TeamRow = { id: string; name: string; email: string; roles: string[]; since: string }

export function TeamView({ rows, canManage }: { rows: TeamRow[]; canManage: boolean }) {
  const [search, setSearch] = React.useState('')
  const [inviteOpen, setInviteOpen] = React.useState(false)

  const filtered = rows.filter((r) =>
    search ? `${r.name} ${r.email}`.toLowerCase().includes(search.toLowerCase()) : true,
  )

  const columns: RecordColumn<TeamRow>[] = [
    {
      key: 'name',
      label: 'Member',
      render: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.name} size={32} />
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{r.name}</div>
            <div className="truncate text-xs text-fg-muted">{r.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'roles',
      label: 'Roles',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.roles.length ? (
            r.roles.map((role) => (
              <Badge key={role} variant={role === 'Admin' ? 'default' : 'secondary'}>
                {role}
              </Badge>
            ))
          ) : (
            <span className="text-fg-subtle">—</span>
          )}
        </div>
      ),
    },
    { key: 'since', label: 'Member since' },
  ]

  return (
    <>
      <RecordList
        columns={columns}
        rows={filtered}
        getRowId={(r) => r.id}
        search={{ value: search, onChange: setSearch, placeholder: 'Search team…' }}
        toolbarActions={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <Plus className="size-4" /> Invite member
            </Button>
          ) : undefined
        }
        empty={{
          icon: <Users />,
          title: 'No members found',
          description: 'Try a different search.',
        }}
      />
      {canManage ? <InviteDrawer open={inviteOpen} onClose={() => setInviteOpen(false)} /> : null}
    </>
  )
}

function InviteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState(inviteMemberAction, { error: null, ok: false })

  React.useEffect(() => {
    if (state.ok) {
      toast.success('Invitation sent', { description: 'They were added to the workspace.' })
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Invite a member"
      description="Creates a real user + membership, RBAC-gated and written to the audit log."
      size="sm"
    >
      <form action={action} className="space-y-4">
        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        <div className="space-y-1.5">
          <Label htmlFor="invite-name">Name</Label>
          <Input id="invite-name" name="name" placeholder="Grace Hopper" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" name="email" type="email" placeholder="grace@acme.com" required />
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
          Send invite
        </Button>
      </form>
    </Drawer>
  )
}
