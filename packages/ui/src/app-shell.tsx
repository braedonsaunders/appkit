'use client'

import * as React from 'react'
import { Menu } from 'lucide-react'
import { AppSidebar } from './app-sidebar'
import { SidebarNav, type SidebarNavGroup } from './sidebar-nav'
import { Drawer } from './drawer'
import type { LinkRender } from './settings-layout'

/**
 * The app frame: a collapsible desktop nav rail + a header (with a mobile nav
 * toggle) + the scrolling content area. Compose the header's right side (search,
 * notifications, account, theme toggle) yourself and pass it as `header`.
 */
export function AppShell({
  groups,
  pathname,
  brand,
  sidebarFooter,
  header,
  banner,
  defaultCollapsed = false,
  linkRender,
  children,
}: {
  groups: SidebarNavGroup[]
  pathname: string
  brand?: React.ReactNode
  sidebarFooter?: React.ReactNode
  /** Top-bar content (right side). The mobile nav toggle is prepended for you. */
  header?: React.ReactNode
  /** Full-width strip above the header (impersonation / super-admin banners). */
  banner?: React.ReactNode
  defaultCollapsed?: boolean
  linkRender?: LinkRender
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        groups={groups}
        pathname={pathname}
        brand={brand}
        footer={sidebarFooter}
        defaultCollapsed={defaultCollapsed}
        linkRender={linkRender}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden [padding-top:env(safe-area-inset-top)]">
        {banner}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:gap-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="grid size-9 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg lg:hidden"
          >
            <Menu size={18} />
          </button>
          {header}
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-subtle">{children}</main>
      </div>

      {/* Mobile nav — the same grouped nav in a left flyout. */}
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        side="left"
        size="sm"
        title={brand ?? 'Menu'}
        disableFullscreen
        bodyClassName="min-h-0 flex-1 overflow-hidden p-0"
      >
        <div onClick={() => setMobileOpen(false)} className="flex h-full flex-col">
          <SidebarNav groups={groups} pathname={pathname} linkRender={linkRender} />
        </div>
      </Drawer>
    </div>
  )
}
