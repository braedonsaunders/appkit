'use client'

import Link from 'next/link'
import {
  Bell,
  Cable,
  PanelLeft,
  ScrollText,
  Settings,
  Shield,
  Users,
} from 'lucide-react'
import { AdminHub, type AdminHubGroup, type LinkRender } from '@appkit/ui'

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
      { href: '/admin/users', title: 'Users', description: 'Invite and manage people', icon: <Users size={18} /> },
      { href: '/admin/settings?s=roles', title: 'Roles', description: 'Roles and permissions', icon: <Shield size={18} /> },
    ],
  },
  {
    label: 'Workspace',
    accent: 'amber',
    cards: [
      { href: '/admin/settings?s=general', title: 'Company setup', description: 'Organization defaults', icon: <Settings size={18} /> },
      { href: '/admin/settings?s=navigation', title: 'Navigation', description: 'Sidebar items', icon: <PanelLeft size={18} /> },
      { href: '/admin/settings?s=notifications', title: 'Notifications', description: 'Alerts and digests', icon: <Bell size={18} /> },
    ],
  },
  {
    label: 'Data',
    accent: 'sky',
    cards: [
      { href: '/admin/audit', title: 'Audit log', description: 'Activity history', icon: <ScrollText size={18} /> },
      { href: '/admin/integrations', title: 'Integrations', description: 'Data connections and automations', icon: <Cable size={18} /> },
    ],
  },
]

export default function AdminHubPage() {
  return (
    <AdminHub
      title="Administration"
      description="Manage your workspace, people, and access."
      groups={HUB_GROUPS}
      linkRender={nextLink}
    />
  )
}
