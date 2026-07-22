'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AccountMenu,
  AppShell,
  Badge,
  DrawerNavigateContext,
  GlobalSearch,
  ListNavProvider,
  NavigationModeProvider,
  NotificationsBell,
  ThemeProvider,
  ThemeToggle,
  UiLinkProvider,
  type GlobalSearchResult,
  type AppShellNavigationMode,
  type LinkRender,
  type NotificationItem,
  type SidebarNavGroup,
  useNavigationMode,
} from '@appkit/ui'
import { PageTransition } from '@appkit/ui/page-transition'
import { AppkitLogo } from './appkit-logo'

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

const NAV: SidebarNavGroup[] = [
  {
    id: 'foundation',
    label: 'Foundation',
    iconKey: 'layers',
    items: [
      { href: '/dashboard', label: 'Dashboard', iconKey: 'gauge', exact: true, mobile: true },
      { href: '/insights', label: 'Insight cards', iconKey: 'library', mobile: true },
      { href: '/forms', label: 'Form builder', iconKey: 'clipboard', mobile: true },
      { href: '/forms/core', label: 'Form engine', iconKey: 'code' },
      { href: '/workflows', label: 'Workflows', iconKey: 'workflow' },
      { href: '/reports', label: 'Reports', iconKey: 'library' },
      { href: '/design-studio', label: 'Design studio', iconKey: 'sparkles' },
      { href: '/customization', label: 'Customization', iconKey: 'wrench' },
      { href: '/attachments', label: 'Attachments', iconKey: 'file' },
      { href: '/notifications', label: 'Notifications', iconKey: 'bell' },
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
        label: 'Setup',
        iconKey: 'wrench',
        subgroup: 'Organization',
      },
      {
        href: '/api-docs',
        label: 'API Docs',
        iconKey: 'code',
        subgroup: 'Extend',
      },
      {
        href: '/admin/integrations',
        label: 'Integrations',
        iconKey: 'workflow',
        subgroup: 'Extend',
      },
      {
        href: '/admin/apps',
        label: 'Apps',
        iconKey: 'package',
        subgroup: 'Extend',
      },
      {
        href: '/admin/scripts',
        label: 'Scripts',
        iconKey: 'code',
        subgroup: 'Extend',
      },
    ],
  },
]

export type AppFrameProps = {
  tenantName: string
  tenantSlug: string
  userName: string
  userEmail: string
  isSuperAdmin: boolean
  activity: NotificationItem[]
  initialNavigationMode: AppShellNavigationMode
  children: React.ReactNode
}

export function AppFrame(props: AppFrameProps) {
  return (
    <UiLinkProvider link={Link}>
      <ThemeProvider>
        <NavigationModeProvider defaultMode={props.initialNavigationMode}>
          <AppFrameContent {...props} />
        </NavigationModeProvider>
      </ThemeProvider>
    </UiLinkProvider>
  )
}

function AppFrameContent({
  tenantName,
  tenantSlug,
  userName,
  userEmail,
  isSuperAdmin,
  activity,
  children,
}: AppFrameProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const navigation = useNavigationMode()
  const navigate = React.useCallback((href: string) => router.push(href, { scroll: false }), [router])
  const listNav = React.useMemo(
    () => ({
      pathname,
      search: searchParams.toString(),
      replace: (href: string) => router.replace(href, { scroll: false }),
      push: navigate,
    }),
    [navigate, pathname, router, searchParams],
  )
  const search = React.useCallback(async (query: string, signal: AbortSignal): Promise<GlobalSearchResult> => {
    const response = await fetch(`/api/demo/search?q=${encodeURIComponent(query)}`, { signal })
    if (!response.ok) throw new Error('Search failed')
    return response.json() as Promise<GlobalSearchResult>
  }, [])

  return (
    <DrawerNavigateContext.Provider value={navigate}>
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
          headerMiddle={
            <GlobalSearch
              search={search}
              onNavigate={(hit) => navigate(hit.href)}
              className="hidden w-52 shrink-0 lg:block xl:w-72"
              labels={{
                placeholder: 'Search people and pages…',
                ariaLabel: 'Search workspace',
                clear: 'Clear search',
                searching: 'Searching…',
                noMatches: (query) => `No matches for “${query}”`,
                navigate: 'navigate',
                open: 'open',
                close: 'close',
                resultCount: (count) => `${count} result${count === 1 ? '' : 's'}`,
              }}
            />
          }
          header={
            <>
              <Badge variant="success" className="hidden xl:inline-flex">No auth</Badge>
              <NotificationsBell
                items={activity}
                onOpenItem={(item) => item.href && navigate(item.href)}
                labels={{
                  ariaLabel: 'Recent activity',
                  title: 'Recent activity',
                  markAllRead: 'Mark all read',
                  empty: 'No audit activity yet.',
                }}
              />
              <AccountMenu
                name={userName}
                email={userEmail}
                contextLabel={`${tenantName} · workspace`}
                roleLabel={isSuperAdmin ? 'Super admin' : 'Member'}
                status={{ label: 'Authentication disabled', variant: 'success' }}
                organization={{
                  label: 'Organization',
                  summary: tenantName,
                  value: tenantSlug,
                  options: [{ value: tenantSlug, label: tenantName, description: 'Current workspace' }],
                  onChange: () => undefined,
                }}
                language={{
                  label: 'Language',
                  summary: 'English',
                  value: 'en',
                  options: [{ value: 'en', label: 'English', description: 'Workspace language' }],
                  onChange: () => undefined,
                }}
                navigation={{
                  label: 'Menu layout',
                  summary: navigation.mode === 'topbar' ? 'Top bar' : 'Sidebar',
                  value: navigation.mode,
                  options: [
                    { value: 'topbar', label: 'Top bar', description: 'Dropdown navigation across the workspace' },
                    { value: 'sidebar', label: 'Sidebar', description: 'Collapsible suite navigation' },
                  ],
                  onChange: (mode) => navigation.setMode(mode === 'sidebar' ? 'sidebar' : 'topbar'),
                }}
                elevatedAccess={isSuperAdmin ? { label: 'Administration', href: '/admin' } : undefined}
              />
            </>
          }
          sidebarFooter={<SidebarFooter />}
          sidebarCollapsedFooter={<div className="flex justify-center"><ThemeToggle collapsed /></div>}
          mobileFooter={<SidebarFooter />}
        >
          <PageTransition navigationKey={pathname}>{children}</PageTransition>
        </AppShell>
      </ListNavProvider>
    </DrawerNavigateContext.Provider>
  )
}

function SidebarFooter() {
  return (
    <div className="space-y-2">
      <ThemeToggle />
      <div className="text-xs text-fg-muted">v0.1.0</div>
    </div>
  )
}
