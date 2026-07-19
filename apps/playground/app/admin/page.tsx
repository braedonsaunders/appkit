'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Bell,
  Database,
  Moon,
  PanelLeft,
  ScrollText,
  Settings,
  Shield,
  Sun,
  Users,
} from 'lucide-react'
import { AdminHub, type AdminHubGroup, Button, type LinkRender } from '@appkit/ui'

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

const nextLink: LinkRender = ({ href, children, className, title }) => (
  <Link href={href} className={className} title={title}>
    {children}
  </Link>
)

const HUB_GROUPS: AdminHubGroup[] = [
  {
    label: 'People',
    accent: 'violet',
    cards: [
      { href: '/admin/settings?s=users', title: 'Users', description: 'Invite and manage people', icon: <Users size={18} /> },
      { href: '/admin/settings?s=roles', title: 'Roles', description: 'Roles and permissions', icon: <Shield size={18} /> },
    ],
  },
  {
    label: 'Workspace',
    accent: 'amber',
    cards: [
      { href: '/admin/settings?s=general', title: 'General', description: 'Organization details', icon: <Settings size={18} /> },
      { href: '/admin/settings?s=navigation', title: 'Navigation', description: 'Sidebar items', icon: <PanelLeft size={18} /> },
      { href: '/admin/settings?s=notifications', title: 'Notifications', description: 'Alerts and digests', icon: <Bell size={18} /> },
    ],
  },
  {
    label: 'Data',
    accent: 'sky',
    cards: [
      { href: '#', title: 'Audit log', description: 'Activity history', icon: <ScrollText size={18} /> },
      { href: '#', title: 'Import & export', description: 'Move data in and out', icon: <Database size={18} /> },
    ],
  },
]

export default function AdminHubPage() {
  const { dark, toggle } = useTheme()
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg">
          <ArrowLeft className="size-4" /> appkit
        </Link>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <AdminHub
          title="Administration"
          description="Manage your workspace, people, and access."
          groups={HUB_GROUPS}
          linkRender={nextLink}
        />
      </div>
    </div>
  )
}
