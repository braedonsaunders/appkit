'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GripVertical, RotateCcw, Settings } from 'lucide-react'
import {
  buildDefaultNavigationConfig,
  Button,
  Input,
  type LinkRender,
  NavigationConfigEditor,
  type NavigationRegistryItem,
  SearchSelect,
  SettingsRow,
  SettingsSection,
  SettingsShell,
  type SettingsNavGroup,
  stampKnownNavigationItems,
  type TenantNavigationConfig,
} from '@braedonsaunders/ui'

const nextLink: LinkRender = ({ href, children, className }) => (
  <Link href={href} className={className}>
    {children}
  </Link>
)

const NAV_ITEMS: NavigationRegistryItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Workspace overview and current activity.',
    iconKey: 'gauge',
    required: true,
  },
  { key: 'invoices', label: 'Invoices', description: 'Customer billing records.', iconKey: 'file' },
  { key: 'expenses', label: 'Expenses', description: 'Purchases and operating costs.', iconKey: 'wallet' },
  { key: 'reports', label: 'Reports', description: 'Saved analysis and exports.', iconKey: 'activity' },
  { key: 'customers', label: 'Customers', description: 'Organizations and contacts.', iconKey: 'users' },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Workspace and navigation configuration.',
    iconKey: 'settings',
    required: true,
  },
]

const NAV_STORAGE_KEY = 'appkit-demo:navigation:v1'

const NAV: SettingsNavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { key: 'general', label: 'General', icon: <Settings /> },
      { key: 'navigation', label: 'Navigation', icon: <GripVertical /> },
    ],
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
        title="Setup"
        description="Configure workspace defaults and navigation."
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
        {active === 'navigation' ? <NavigationSettings /> : null}
      </SettingsShell>
    </div>
  )
}

function GeneralSettings() {
  const [name, setName] = React.useState('Acme Inc')
  const [timezone, setTimezone] = React.useState('America/Toronto')
  const [currency, setCurrency] = React.useState('USD')
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem('appkit-demo:workspace-settings:v1')
      if (!stored) return
      const parsed = JSON.parse(stored) as { name?: unknown; timezone?: unknown; currency?: unknown }
      if (typeof parsed.name === 'string') setName(parsed.name)
      if (typeof parsed.timezone === 'string') setTimezone(parsed.timezone)
      if (typeof parsed.currency === 'string') setCurrency(parsed.currency)
    } catch {
      // The defaults remain usable when browser storage is unavailable.
    }
  }, [])

  function save() {
    try {
      window.localStorage.setItem('appkit-demo:workspace-settings:v1', JSON.stringify({ name, timezone, currency }))
      setSaved(true)
    } catch {
      setSaved(false)
    }
  }

  function reset() {
    try {
      window.localStorage.removeItem('appkit-demo:workspace-settings:v1')
    } finally {
      setName('Acme Inc')
      setTimezone('America/Toronto')
      setCurrency('USD')
      setSaved(false)
    }
  }

  return (
    <>
      <SettingsSection title="Organization" description="Basic details for your workspace." footer={<Button size="sm" onClick={save}>{saved ? 'Saved' : 'Save changes'}</Button>}>
        <SettingsRow title="Name" description="Shown across the app and on documents." stacked>
          <Input value={name} onChange={(event) => { setName(event.target.value); setSaved(false) }} />
        </SettingsRow>
        <SettingsRow title="Time zone">
          <div className="w-56">
            <SearchSelect
              value={timezone}
              onChange={(value) => { setTimezone(value); setSaved(false) }}
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
            <SearchSelect
              value={currency}
              onChange={(value) => { setCurrency(value); setSaved(false) }}
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
      <SettingsSection title="Reset">
        <SettingsRow title="Reset workspace settings" description="Restore the browser demo defaults.">
          <Button variant="destructive" onClick={reset}>Reset</Button>
        </SettingsRow>
      </SettingsSection>
    </>
  )
}

function NavigationSettings() {
  const [config, setConfig] = React.useState<TenantNavigationConfig>(() =>
    stampKnownNavigationItems(buildDefaultNavigationConfig(NAV_ITEMS), NAV_ITEMS),
  )

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(NAV_STORAGE_KEY)
      if (stored) setConfig(JSON.parse(stored) as TenantNavigationConfig)
    } catch {
      // The complete default registry remains usable.
    }
  }, [])

  const update = React.useCallback((next: TenantNavigationConfig) => {
    setConfig(next)
    try {
      window.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Persistence is optional in the database-free playground.
    }
  }, [])

  return (
    <div className="space-y-3">
      <NavigationConfigEditor registry={NAV_ITEMS} value={config} onChange={update} />
      <Button
        variant="outline"
        onClick={() =>
          update(stampKnownNavigationItems(buildDefaultNavigationConfig(NAV_ITEMS), NAV_ITEMS))
        }
      >
        <RotateCcw className="size-4" aria-hidden />
        Reset navigation
      </Button>
    </div>
  )
}
