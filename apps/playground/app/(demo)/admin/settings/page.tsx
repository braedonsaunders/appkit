'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GripVertical, Settings } from 'lucide-react'
import {
  Button,
  Input,
  type LinkRender,
  SearchSelect,
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

const NAV_ITEMS = ['Dashboard', 'Invoices', 'Expenses', 'Reports', 'Customers', 'Settings']

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
