'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Bell,
  GripVertical,
  Mail,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  Settings,
  Shield,
  Sun,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react'
import {
  Avatar,
  Badge,
  type BadgeProps,
  Button,
  ContextMenu,
  Dialog,
  Input,
  Label,
  type LinkRender,
  RecordList,
  type RecordColumn,
  Select,
  SettingsRow,
  SettingsSection,
  SettingsShell,
  type SettingsNavGroup,
  Switch,
  toast,
  useContextMenu,
} from '@appkit/ui'

function useTheme() {
  const [dark, setDark] = React.useState(false)
  React.useEffect(() => {
    const r = document.documentElement
    setDark(r.classList.contains('dark') || (!r.classList.contains('light') && matchMedia('(prefers-color-scheme: dark)').matches))
  }, [])
  const toggle = () =>
    setDark((d) => {
      const next = !d
      const r = document.documentElement
      r.classList.toggle('dark', next)
      r.classList.toggle('light', !next)
      try {
        localStorage.setItem('theme', next ? 'dark' : 'light')
      } catch {}
      return next
    })
  return { dark, toggle }
}

const nextLink: LinkRender = ({ href, children, className }) => (
  <Link href={href} className={className}>
    {children}
  </Link>
)

type User = { id: string; name: string; email: string; role: string; status: 'Active' | 'Invited' | 'Suspended'; avatar?: string }
const USERS: User[] = [
  { id: '1', name: 'Ada Lovelace', email: 'ada@acme.com', role: 'Owner', status: 'Active', avatar: 'https://i.pravatar.cc/64?img=5' },
  { id: '2', name: 'Grace Hopper', email: 'grace@acme.com', role: 'Admin', status: 'Active' },
  { id: '3', name: 'Alan Turing', email: 'alan@acme.com', role: 'Editor', status: 'Active' },
  { id: '4', name: 'Katherine Johnson', email: 'kj@acme.com', role: 'Editor', status: 'Invited' },
  { id: '5', name: 'Linus Pauling', email: 'linus@acme.com', role: 'Viewer', status: 'Suspended' },
]
const STATUS_VARIANT: Record<User['status'], BadgeProps['variant']> = { Active: 'success', Invited: 'info', Suspended: 'warning' }
const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]
const PERMISSIONS = [
  { key: 'billing', label: 'Manage billing', desc: 'View and change the subscription and payment methods.' },
  { key: 'members', label: 'Invite & manage members', desc: 'Add, remove, and change roles for people.' },
  { key: 'roles', label: 'Manage roles', desc: 'Create roles and edit their permissions.' },
  { key: 'content', label: 'Edit records', desc: 'Create and modify records across the workspace.' },
  { key: 'delete', label: 'Delete records', desc: 'Permanently remove records.' },
  { key: 'reports', label: 'View reports', desc: 'Access analytics and financial reports.' },
]
const DEFAULT_PERMS: Record<string, Record<string, boolean>> = {
  owner: { billing: true, members: true, roles: true, content: true, delete: true, reports: true },
  admin: { billing: true, members: true, roles: true, content: true, delete: true, reports: true },
  editor: { billing: false, members: false, roles: false, content: true, delete: false, reports: true },
  viewer: { billing: false, members: false, roles: false, content: false, delete: false, reports: true },
}
const NAV_ITEMS = ['Dashboard', 'Invoices', 'Expenses', 'Reports', 'Customers', 'Settings']

const NAV: SettingsNavGroup[] = [
  {
    items: [
      { key: 'general', label: 'General', icon: <Settings /> },
      { key: 'users', label: 'Users', icon: <Users />, badge: <Badge variant="secondary">{USERS.length}</Badge> },
      { key: 'roles', label: 'Roles', icon: <Shield /> },
      { key: 'navigation', label: 'Navigation', icon: <GripVertical /> },
      { key: 'notifications', label: 'Notifications', icon: <Bell /> },
    ],
  },
]

export default function SettingsPage() {
  const { dark, toggle } = useTheme()
  const [active, setActive] = React.useState('users')
  const [invite, setInvite] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState('')

  React.useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('s')
    if (s) setActive(s)
  }, [])

  return (
    <div className="h-screen">
      <SettingsShell
        title="Settings"
        description="Manage your workspace, people, and access."
        back={{ href: '/admin', label: 'Administration' }}
        nav={NAV}
        activeKey={active}
        onSelect={setActive}
        linkRender={nextLink}
        actions={
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
        }
      >
        {active === 'general' ? <GeneralSettings /> : null}
        {active === 'users' ? <UsersSettings onInvite={() => setInvite(true)} /> : null}
        {active === 'roles' ? <RolesSettings /> : null}
        {active === 'navigation' ? <NavigationSettings /> : null}
        {active === 'notifications' ? <NotificationSettings /> : null}
      </SettingsShell>

      <Dialog
        open={invite}
        onClose={() => setInvite(false)}
        title="Invite a user"
        description="They'll get an email with a link to join the workspace."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setInvite(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setInvite(false)
                setInviteEmail('')
                toast.success('Invitation sent', { description: inviteEmail || 'user@acme.com' })
              }}
            >
              <Mail className="size-4" /> Send invite
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email address</Label>
          <Input id="invite-email" type="email" placeholder="colleague@acme.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
        </div>
      </Dialog>
    </div>
  )
}

function GeneralSettings() {
  return (
    <>
      <SettingsSection title="Organization" description="Basic details for your workspace.">
        <SettingsRow title="Name" description="Shown across the app and on documents." stacked>
          <Input defaultValue="Acme Inc" />
        </SettingsRow>
        <SettingsRow title="Time zone">
          <div className="w-56">
            <Select
              value="America/Toronto"
              onChange={() => {}}
              options={[
                { value: 'America/Toronto', label: 'Eastern (Toronto)' },
                { value: 'America/Chicago', label: 'Central (Chicago)' },
                { value: 'America/Denver', label: 'Mountain (Denver)' },
                { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
              ]}
            />
          </div>
        </SettingsRow>
        <SettingsRow title="Default currency">
          <div className="w-40">
            <Select
              value="USD"
              onChange={() => {}}
              options={[
                { value: 'USD', label: 'USD $' },
                { value: 'CAD', label: 'CAD $' },
                { value: 'EUR', label: 'EUR €' },
                { value: 'GBP', label: 'GBP £' },
              ]}
            />
          </div>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Danger zone">
        <SettingsRow title="Delete workspace" description="Permanently remove this workspace and all its data.">
          <Button variant="destructive">Delete</Button>
        </SettingsRow>
      </SettingsSection>
    </>
  )
}

function UsersSettings({ onInvite }: { onInvite: () => void }) {
  const menu = useContextMenu()
  const [menuUser, setMenuUser] = React.useState<User | null>(null)
  const [search, setSearch] = React.useState('')
  const rows = USERS.filter((u) => (search ? `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase()) : true))
  const columns: RecordColumn<User>[] = [
    {
      key: 'name',
      label: 'User',
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.name} src={u.avatar} size={32} />
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{u.name}</div>
            <div className="truncate text-xs text-fg-muted">{u.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status', kind: 'status', statusVariant: (v) => STATUS_VARIANT[v as User['status']] },
    {
      key: 'actions',
      label: '',
      kind: 'actions',
      render: (u) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${u.name}`}
          onClick={(e) => {
            setMenuUser(u)
            menu.openBelow(e.currentTarget)
          }}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      ),
    },
  ]
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onInvite}>
          <Plus className="size-4" /> Invite user
        </Button>
      </div>
      <RecordList
        columns={columns}
        rows={rows}
        getRowId={(u) => u.id}
        search={{ value: search, onChange: setSearch, placeholder: 'Search people…' }}
        empty={{ title: 'No people found', description: 'Try a different search.' }}
      />
      <ContextMenu
        open={menu.open && menuUser != null}
        position={menu.position}
        onClose={() => {
          menu.close()
          setMenuUser(null)
        }}
        items={
          menuUser == null
            ? []
            : [
                { key: 'edit', label: 'Edit', icon: Pencil, onSelect: () => toast.info(`Editing ${menuUser.name}`) },
                { key: 'role', label: 'Change role', icon: UserRound, onSelect: () => toast('Role changed') },
                { key: 'sep', separator: true },
                { key: 'rm', label: 'Remove', icon: Trash2, danger: true, onSelect: () => toast.error(`Removed ${menuUser.name}`) },
              ]
        }
      />
    </div>
  )
}

function RolesSettings() {
  const [role, setRole] = React.useState('editor')
  const [perms, setPerms] = React.useState<Record<string, boolean>>(DEFAULT_PERMS.editor!)
  const pick = (value: string) => {
    setRole(value)
    setPerms({ ...(DEFAULT_PERMS[value] ?? {}) })
  }
  return (
    <>
      <SettingsSection title="Role" description="Choose a role to view and edit its permissions.">
        <SettingsRow title="Editing role">
          <div className="w-48">
            <Select value={role} onChange={pick} options={ROLES} />
          </div>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Permissions">
        {PERMISSIONS.map((p) => (
          <SettingsRow key={p.key} title={p.label} description={p.desc}>
            <Switch checked={!!perms[p.key]} disabled={role === 'owner'} onChange={(e) => setPerms((prev) => ({ ...prev, [p.key]: e.target.checked }))} />
          </SettingsRow>
        ))}
      </SettingsSection>
    </>
  )
}

function NavigationSettings() {
  const [visible, setVisible] = React.useState<Record<string, boolean>>(Object.fromEntries(NAV_ITEMS.map((n) => [n, true])))
  return (
    <SettingsSection title="Sidebar navigation" description="Toggle which items appear in the main navigation.">
      {NAV_ITEMS.map((item) => (
        <SettingsRow
          key={item}
          title={
            <span className="flex items-center gap-2">
              <GripVertical className="size-4 text-fg-subtle" />
              {item}
            </span>
          }
        >
          <Switch checked={!!visible[item]} onChange={(e) => setVisible((v) => ({ ...v, [item]: e.target.checked }))} />
        </SettingsRow>
      ))}
    </SettingsSection>
  )
}

function NotificationSettings() {
  return (
    <SettingsSection title="Notifications" description="How you'd like to be notified.">
      <SettingsRow title="Email notifications" description="Product updates and account activity.">
        <Switch defaultChecked />
      </SettingsRow>
      <SettingsRow title="Push notifications" description="Real-time alerts in your browser.">
        <Switch />
      </SettingsRow>
      <SettingsRow title="Weekly summary" description="A digest every Monday morning.">
        <Switch defaultChecked />
      </SettingsRow>
    </SettingsSection>
  )
}
