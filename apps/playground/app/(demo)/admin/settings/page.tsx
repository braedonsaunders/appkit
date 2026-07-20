'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, GripVertical, Settings, Shield } from 'lucide-react'
import {
  Button,
  Input,
  type LinkRender,
  Select,
  SettingsRow,
  SettingsSection,
  SettingsShell,
  type SettingsNavGroup,
  Switch,
} from '@appkit/ui'

const nextLink: LinkRender = ({ href, children, className }) => (
  <Link href={href} className={className}>
    {children}
  </Link>
)

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
    label: 'Workspace',
    items: [
      { key: 'general', label: 'General', icon: <Settings /> },
      { key: 'navigation', label: 'Navigation', icon: <GripVertical /> },
      { key: 'notifications', label: 'Notifications', icon: <Bell /> },
    ],
  },
  {
    label: 'Access',
    items: [{ key: 'roles', label: 'Roles & permissions', icon: <Shield /> }],
  },
]

export default function SettingsPage() {
  const router = useRouter()
  const [active, setActive] = React.useState('general')

  React.useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('s')
    if (s) setActive(s)
  }, [])

  return (
    <div className="h-full">
      <SettingsShell
        title="Company setup"
        description="Configure workspace defaults, access, navigation, and notifications."
        back={{ href: '/admin', label: 'Administration' }}
        nav={NAV}
        activeKey={active}
        onSelect={(key) => {
          setActive(key)
          router.replace(`/admin/settings?s=${key}`, { scroll: false })
        }}
        linkRender={nextLink}
      >
        {active === 'general' ? <GeneralSettings /> : null}
        {active === 'roles' ? <RolesSettings /> : null}
        {active === 'navigation' ? <NavigationSettings /> : null}
        {active === 'notifications' ? <NotificationSettings /> : null}
      </SettingsShell>
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
