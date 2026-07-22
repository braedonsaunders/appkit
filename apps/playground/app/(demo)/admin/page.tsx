'use client'

import Link from 'next/link'
import {
  Bell,
  Boxes,
  Braces,
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
      { href: '/admin/roles', title: 'Roles', description: 'Roles, permissions, members, and data scope', icon: <Shield size={18} /> },
    ],
  },
  {
    label: 'Workspace',
    accent: 'amber',
    cards: [
      { href: '/admin/settings?s=general', title: 'Setup', description: 'Organization defaults', icon: <Settings size={18} /> },
      { href: '/admin/settings?s=navigation', title: 'Navigation', description: 'Sidebar items', icon: <PanelLeft size={18} /> },
      { href: '/admin/notifications', title: 'Notifications', description: 'Routing, audiences, schedules, and escalation', icon: <Bell size={18} /> },
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
  {
    label: 'Extend',
    accent: 'violet',
    cards: [
      { href: '/admin/apps', title: 'Apps', description: 'Build and install sandboxed applications', icon: <Boxes size={18} /> },
      { href: '/admin/scripts', title: 'Scripts', description: 'Governed event and scheduled code', icon: <Braces size={18} /> },
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
