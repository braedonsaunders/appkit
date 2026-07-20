'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronDown,
  LayoutPanelLeft,
  Monitor,
  Moon,
  Palette,
  Search,
  Sun,
} from 'lucide-react'
import {
  AppShell,
  type AppShellNavigationMode,
  Avatar,
  Badge,
  ListNavProvider,
  type LinkRender,
  Popover,
  type SidebarNavGroup,
  cn,
} from '@appkit/ui'
import { AppkitLogo } from './appkit-logo'

type Theme = 'light' | 'system' | 'dark'

function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
}

function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>('system')
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem('theme')
    } catch {}
    const initial: Theme = stored === 'light' || stored === 'dark' ? stored : 'system'
    setThemeState(initial)
    applyTheme(initial)
    setMounted(true)
  }, [])

  React.useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      if (theme === 'system') applyTheme('system')
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [theme])

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next)
    applyTheme(next)
    try {
      if (next === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', next)
    } catch {}
  }, [])

  return { theme, setTheme, mounted }
}

function useNavigationMode() {
  const [mode, setModeState] = React.useState<AppShellNavigationMode>('topbar')
  React.useEffect(() => {
    try {
      if (localStorage.getItem('appkit-navigation-mode') === 'sidebar') setModeState('sidebar')
    } catch {}
  }, [])
  const setMode = React.useCallback((next: AppShellNavigationMode) => {
    setModeState(next)
    try {
      localStorage.setItem('appkit-navigation-mode', next)
    } catch {}
  }, [])
  return { mode, setMode }
}

const nextLink: LinkRender = ({
  href,
  children,
  className,
  title,
  ariaCurrent,
  role,
  dataWalkthrough,
}) => (
  <Link
    href={href}
    className={className}
    title={title}
    aria-current={ariaCurrent}
    role={role}
    data-walkthrough={dataWalkthrough}
  >
    {children}
  </Link>
)

// The same OpenBooks-compatible workspace registry drives every shell mode.
const NAV: SidebarNavGroup[] = [
  {
    id: 'foundation',
    label: 'Foundation',
    iconKey: 'layers',
    items: [
      { href: '/dashboard', label: 'Overview', iconKey: 'gauge', exact: true, mobile: true },
      { href: '/dashboard/platform', label: 'Platform', iconKey: 'package', mobile: true },
      { href: '/components', label: 'Components', iconKey: 'sparkles' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    iconKey: 'settings',
    items: [
      {
        href: '/admin',
        label: 'Administration',
        iconKey: 'settings',
        subgroup: 'Organization',
        exact: true,
        mobile: true,
      },
      {
        href: '/admin/settings',
        label: 'Company setup',
        iconKey: 'wrench',
        subgroup: 'Organization',
      },
      {
        href: '/api-docs',
        label: 'API Docs',
        iconKey: 'code',
        subgroup: 'Extend',
      },
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
  const theme = useTheme()
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
        brand={
          <Link href="/dashboard" aria-label="appkit home" className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring">
            <AppkitLogo />
          </Link>
        }
        navigationMode={navigation.mode}
        linkRender={nextLink}
        headerMiddle={<DemoSearch />}
        header={
          <>
            <Badge variant="success" className="hidden xl:inline-flex">
              No auth
            </Badge>
            <DemoAccountMenu
              tenantName={tenantName}
              userName={userName}
              userEmail={userEmail}
              navigation={navigation}
              theme={theme}
            />
          </>
        }
        sidebarFooter={<SidebarFooter theme={theme} />}
        sidebarCollapsedFooter={<CollapsedThemeToggle theme={theme} />}
        mobileFooter={<SidebarFooter theme={theme} />}
      >
        {children}
      </AppShell>
    </ListNavProvider>
  )
}

function DemoSearch() {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  return (
    <form
      className="relative hidden w-52 shrink-0 lg:block xl:w-64"
      onSubmit={(event) => {
        event.preventDefault()
        const q = query.trim()
        router.push(q ? `/admin/users?q=${encodeURIComponent(q)}` : '/admin/users')
      }}
    >
      <Search
        size={15}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
      />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search users…"
        aria-label="Search demo users"
        className="h-9 w-full rounded-lg border border-border bg-bg-subtle pr-12 pl-9 text-sm text-fg transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-primary focus:bg-surface focus:ring-2 focus:ring-ring/20 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-border bg-surface px-1.5 py-0.5 font-sans text-[10px] font-medium text-fg-subtle sm:inline">
        ↵
      </kbd>
    </form>
  )
}

function DemoAccountMenu({
  tenantName,
  userName,
  userEmail,
  navigation,
  theme,
}: {
  tenantName: string
  userName: string
  userEmail: string
  navigation: ReturnType<typeof useNavigationMode>
  theme: ReturnType<typeof useTheme>
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-72"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label="Open account menu"
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex shrink-0 items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <Avatar name={userName} size={28} />
          <span className="hidden min-w-0 max-w-44 flex-col text-left sm:flex">
            <span className="truncate text-sm leading-tight">{userName}</span>
            <span className="truncate text-[11px] leading-tight text-fg-subtle">{tenantName} · public demo</span>
          </span>
          <ChevronDown size={14} className="hidden shrink-0 text-fg-subtle sm:inline" />
        </button>
      }
    >
      <div>
        <div className="flex items-center gap-3 px-3 py-3">
          <Avatar name={userName} size={40} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-fg">{userName}</span>
            <span className="truncate text-xs text-fg-muted">{userEmail}</span>
            <Badge variant="success" className="mt-1 w-fit text-[10px]">
              Authentication disabled
            </Badge>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 px-2 pb-2">
          <button
            type="button"
            onClick={() => {
              theme.setTheme(theme.theme === 'dark' ? 'light' : 'dark')
              setOpen(false)
            }}
            className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-info-subtle text-info">
              <Palette size={18} />
            </span>
            <span>
              <span className="block text-sm font-medium text-fg">Theme</span>
              <span className="block text-xs capitalize text-fg-muted">{theme.theme}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              navigation.setMode(navigation.mode === 'topbar' ? 'sidebar' : 'topbar')
              setOpen(false)
            }}
            className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-warning-subtle text-warning">
              <LayoutPanelLeft size={18} />
            </span>
            <span>
              <span className="block text-sm font-medium text-fg">Menu layout</span>
              <span className="block text-xs capitalize text-fg-muted">{navigation.mode}</span>
            </span>
          </button>
        </div>
      </div>
    </Popover>
  )
}

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
]

function SidebarFooter({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Theme"
        className="flex items-center gap-0.5 rounded-lg border border-border bg-bg-subtle p-0.5"
      >
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon
          const selected = theme.mounted && theme.theme === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => theme.setTheme(option.value)}
              title={option.label}
              className={cn(
                'inline-flex h-7 flex-1 items-center justify-center rounded-md transition-colors',
                selected ? 'bg-surface text-primary shadow-sm' : 'text-fg-muted hover:text-fg',
              )}
            >
              <Icon size={15} />
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span>v0.1.0</span>
        <Badge variant="secondary" className="font-mono text-[10px]">
          demo
        </Badge>
      </div>
    </div>
  )
}

function CollapsedThemeToggle({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const active = THEME_OPTIONS.find((option) => option.value === theme.theme) ?? THEME_OPTIONS[1]!
  const Icon = active.icon
  const next: Theme = theme.theme === 'light' ? 'dark' : theme.theme === 'dark' ? 'system' : 'light'
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={() => theme.setTheme(next)}
        title={`Theme: ${active.label}`}
        aria-label={`Theme: ${active.label}`}
        className="grid size-9 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
      >
        {theme.mounted ? <Icon size={16} /> : <Monitor size={16} className="opacity-0" />}
      </button>
    </div>
  )
}
