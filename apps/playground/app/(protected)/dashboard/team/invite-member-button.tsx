'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { Loader2, Mail, Plus } from 'lucide-react'
import { Button, Drawer, Input, Label, toast } from '@appkit/ui'
import { inviteMemberAction } from '../../../../lib/server/actions'

export function InviteMemberButton() {
  const [open, setOpen] = React.useState(false)
  const close = React.useCallback(() => setOpen(false), [])
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Invite member
      </Button>
      <InviteDrawer open={open} onClose={close} />
    </>
  )
}

function InviteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState(inviteMemberAction, { error: null, ok: false })

  React.useEffect(() => {
    if (!state.ok) return
    toast.success('Invitation sent', { description: 'They were added to the workspace.' })
    onClose()
  }, [state.ok, onClose])

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
