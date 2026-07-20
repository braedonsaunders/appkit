'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, LayoutGrid, LogOut, Moon, Settings, Sparkles, Sun, Users } from 'lucide-react'
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  type LinkRender,
  type SidebarNavGroup,
  Tooltip,
} from '@appkit/ui'
import { logoutAction } from '../lib/server/actions'
import { AppkitLogo } from './appkit-logo'

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

const NAV: SidebarNavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <LayoutGrid />, exact: true },
      { href: '/dashboard/team', label: 'Team', icon: <Users /> },
    ],
  },
  {
    label: 'Explore',
    items: [
      { href: '/api-docs', label: 'API reference', icon: <BookOpen /> },
      { href: '/admin', label: 'Admin demo', icon: <Settings /> },
      { href: '/', label: 'Component gallery', icon: <Sparkles /> },
    ],
  },
]

export function AppFrame({
  tenantName,
  userName,
  userEmail,
  children,
}: {
  tenantName: string
  userName: string
  userEmail: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { dark, toggle } = useTheme()
  return (
    <AppShell
      groups={NAV}
      pathname={pathname}
      brand={<AppkitLogo />}
      linkRender={nextLink}
      header={
        <>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {tenantName}
          </Badge>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
            <Tooltip content={userEmail}>
              <span className="flex items-center gap-2 rounded-md px-2 py-1">
                <Avatar name={userName} size={28} />
                <span className="hidden text-sm font-medium text-fg md:block">{userName}</span>
              </span>
            </Tooltip>
            <form action={logoutAction}>
              <Tooltip content="Sign out">
                <Button variant="ghost" size="icon" type="submit" aria-label="Sign out">
                  <LogOut className="size-4" />
                </Button>
              </Tooltip>
            </form>
          </div>
        </>
      }
      sidebarFooter={
        <div className="flex items-center justify-between text-xs text-fg-muted">
          <span>appkit</span>
          <Badge variant="secondary" className="font-mono text-[10px]">
            v0.1
          </Badge>
        </div>
      }
    >
      {children}
    </AppShell>
  )
}
