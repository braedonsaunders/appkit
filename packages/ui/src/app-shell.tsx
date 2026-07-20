'use client'

import * as React from 'react'
import { Menu } from 'lucide-react'
import { AppSidebar } from './app-sidebar'
import { Drawer } from './drawer'
import { MobileTabBar } from './mobile-tab-bar'
import { SidebarNav, type SidebarNavGroup } from './sidebar-nav'
import type { LinkRender } from './settings-layout'
import { TopNav } from './top-nav'
import { cn } from './utils'

export type AppShellNavigationMode = 'topbar' | 'sidebar'

/**
 * Generalized OpenBooks/BeaconHS application shell. One serialized navigation
 * registry drives the OpenBooks dropdown topbar, the shared collapsible rail,
 * the mobile drawer, and the native-style mobile tab bar.
 */
export function AppShell({
  groups,
  pathname,
  brand,
  sidebarFooter,
  sidebarCollapsedFooter,
  mobileFooter,
  headerMiddle,
  header,
  banner,
  defaultCollapsed = false,
  navigationMode = 'topbar',
  linkRender,
  moreLabel = 'More',
  openNavigationLabel = 'Open navigation',
  menuLabel = 'Menu',
  primaryNavigationLabel = 'Primary navigation',
  mobileTabCount = 4,
  showMobileTabs = true,
  children,
}: {
  groups: SidebarNavGroup[]
  pathname: string
  brand?: React.ReactNode
  sidebarFooter?: React.ReactNode
  sidebarCollapsedFooter?: React.ReactNode
  mobileFooter?: React.ReactNode
  /** OpenBooks' GlobalSearch / BeaconHS tenant+role controls slot. */
  headerMiddle?: React.ReactNode
  /** Right-side utility actions and account menu. */
  header?: React.ReactNode
  banner?: React.ReactNode
  defaultCollapsed?: boolean
  navigationMode?: AppShellNavigationMode
  linkRender?: LinkRender
  moreLabel?: string
  openNavigationLabel?: string
  menuLabel?: string
  primaryNavigationLabel?: string
  mobileTabCount?: number
  showMobileTabs?: boolean
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const topbar = navigationMode === 'topbar'

  return (
    <div className="flex h-screen overflow-hidden">
      {topbar ? null : (
        <AppSidebar
          groups={groups}
          pathname={pathname}
          brand={brand}
          footer={sidebarFooter}
          collapsedFooter={sidebarCollapsedFooter}
          defaultCollapsed={defaultCollapsed}
          linkRender={linkRender}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden [padding-top:env(safe-area-inset-top)]">
        {banner}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:gap-3 sm:px-4">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={openNavigationLabel}
            className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg lg:hidden"
          >
            <Menu size={18} />
          </button>

          {topbar ? (
            <>
              {brand ? <div className="hidden shrink-0 lg:block">{brand}</div> : null}
              <TopNav
                groups={groups}
                pathname={pathname}
                linkRender={linkRender}
                moreLabel={moreLabel}
                ariaLabel={primaryNavigationLabel}
              />
              <div className="flex-1 lg:hidden" />
              {headerMiddle}
            </>
          ) : (
            <div className={cn('min-w-0 flex-1', !headerMiddle && 'hidden lg:block')}>{headerMiddle}</div>
          )}
          {header ? <div className="flex shrink-0 items-center gap-1">{header}</div> : null}
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-subtle">{children}</main>

        {showMobileTabs ? (
          <MobileTabBar
            groups={groups}
            pathname={pathname}
            onOpenMenu={() => setMobileOpen(true)}
            linkRender={linkRender}
            tabCount={mobileTabCount}
            menuLabel={menuLabel}
            ariaLabel={primaryNavigationLabel}
          />
        ) : null}
      </div>

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        side="left"
        size="sm"
        title={brand ?? menuLabel}
        disableFullscreen
        bodyClassName="min-h-0 flex-1 overflow-hidden p-0"
        footer={mobileFooter ?? sidebarFooter}
      >
        <div onClick={() => setMobileOpen(false)} className="flex h-full flex-col">
          <SidebarNav groups={groups} pathname={pathname} linkRender={linkRender} />
        </div>
      </Drawer>
    </div>
  )
}
