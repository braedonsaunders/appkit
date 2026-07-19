'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Boxes, LayoutGrid, Moon, Settings, Sparkles, Sun, TrendingUp } from 'lucide-react'
import {
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type LinkRender,
  PageContainer,
  type SidebarNavGroup,
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

const nextLink: LinkRender = ({ href, children, className, title }) => (
  <Link href={href} className={className} title={title}>
    {children}
  </Link>
)

const NAV: SidebarNavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <LayoutGrid /> },
      { href: '/dashboard/records', label: 'Records', icon: <Boxes /> },
      { href: '/dashboard/reports', label: 'Reports', icon: <BarChart3 /> },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/admin', label: 'Administration', icon: <Settings /> },
      { href: '/api-docs', label: 'API reference', icon: <BarChart3 /> },
      { href: '/', label: 'Component gallery', icon: <Sparkles /> },
    ],
  },
]

const STATS = [
  { label: 'Revenue', value: '$48,290', delta: '+12%' },
  { label: 'Active tenants', value: '128', delta: '+4' },
  { label: 'Open records', value: '1,204', delta: '−3%' },
]

export default function Dashboard() {
  const pathname = usePathname()
  const { dark, toggle } = useTheme()
  return (
    <AppShell
      groups={NAV}
      pathname={pathname}
      brand={
        <span className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-5 text-primary" /> appkit
        </span>
      }
      linkRender={nextLink}
      header={
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
        </div>
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
      <PageContainer>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-fg-muted">
          The AppShell frame — collapsible rail (try the toggle), a top bar, and a mobile nav flyout.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {STATS.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5">
                <div className="text-sm text-fg-muted">{s.label}</div>
                <div className="mt-1 flex items-end justify-between">
                  <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
                  <span className="flex items-center gap-1 text-xs font-medium text-success">
                    <TrendingUp className="size-3" /> {s.delta}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>This page is framed by @appkit/ui AppShell + PageContainer.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-fg-muted">
              The rail highlights the active route with a greedy match, collapses to icons, and folds
              into a left flyout below the lg breakpoint.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Get started</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/admin">Open admin</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">Component gallery</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </AppShell>
  )
}
