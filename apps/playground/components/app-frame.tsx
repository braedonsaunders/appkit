'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  BookOpen,
  Boxes,
  LayoutGrid,
  Moon,
  PanelLeft,
  PanelTop,
  Settings,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react'
import {
  AppShell,
  type AppShellNavigationMode,
  Avatar,
  Badge,
  Button,
  ListNavProvider,
  type LinkRender,
  type SidebarNavGroup,
  Tooltip,
} from '@appkit/ui'
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

function useNavigationMode() {
  const [mode, setMode] = React.useState<AppShellNavigationMode>('topbar')
  React.useEffect(() => {
    try {
      if (localStorage.getItem('appkit-navigation-mode') === 'sidebar') setMode('sidebar')
    } catch {}
  }, [])
  const toggle = React.useCallback(() => {
    setMode((current) => {
      const next = current === 'topbar' ? 'sidebar' : 'topbar'
      try {
        localStorage.setItem('appkit-navigation-mode', next)
      } catch {}
      return next
    })
  }, [])
  return { mode, toggle }
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
      { href: '/dashboard', label: 'Overview', icon: <LayoutGrid />, exact: true },
      { href: '/dashboard/platform', label: 'Platform', icon: <Boxes /> },
      { href: '/dashboard/team', label: 'Team', icon: <Users /> },
    ],
  },
  {
    label: 'Explore',
    items: [
      { href: '/api-docs', label: 'API reference', icon: <BookOpen /> },
      { href: '/admin', label: 'Admin demo', icon: <Settings /> },
      { href: '/components', label: 'Components', icon: <Sparkles /> },
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
  const searchParams = useSearchParams()
  const router = useRouter()
  const { dark, toggle } = useTheme()
  const navigation = useNavigationMode()
  const listNav = React.useMemo(
    () => ({
      pathname,
      search: searchParams.toString(),
      replace: (href: string) => router.replace(href, { scroll: false }),
      push: (href: string) => router.push(href, { scroll: false }),
    }),
    [pathname, router, searchParams],
  )
  return (
    <ListNavProvider value={listNav}>
      <AppShell
        groups={NAV}
        pathname={pathname}
        brand={<AppkitLogo />}
        navigationMode={navigation.mode}
        linkRender={nextLink}
        header={
          <>
            <Badge variant="success" className="hidden xl:inline-flex">
              Demo · no auth
            </Badge>
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {tenantName}
            </Badge>
            <div className="ml-auto flex items-center gap-1.5">
              <Tooltip
                content={
                  navigation.mode === 'topbar'
                    ? 'Switch to sidebar navigation'
                    : 'Switch to topbar navigation'
                }
              >
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigation.toggle}
                  aria-label={
                    navigation.mode === 'topbar'
                      ? 'Switch to sidebar navigation'
                      : 'Switch to topbar navigation'
                  }
                >
                  {navigation.mode === 'topbar' ? <PanelLeft className="size-5" /> : <PanelTop className="size-5" />}
                </Button>
              </Tooltip>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </Button>
              <Tooltip content={`Fixed demo identity · ${userEmail}`}>
                <span className="flex items-center gap-2 rounded-md px-2 py-1">
                  <Avatar name={userName} size={28} />
                  <span className="hidden text-sm font-medium text-fg md:block">{userName}</span>
                </span>
              </Tooltip>
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
    </ListNavProvider>
  )
}
