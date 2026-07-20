'use client'

import * as React from 'react'
import { Menu } from 'lucide-react'
import {
  findActiveNavHref,
  NavIcon,
  selectMobileTabs,
  type SidebarNavGroup,
} from './sidebar-nav'
import type { LinkRender } from './settings-layout'
import { cn } from './utils'

const defaultLink: LinkRender = ({ href, children, className, ariaCurrent }) => (
  <a href={href} className={className} aria-current={ariaCurrent}>
    {children}
  </a>
)

const tabClass = (active: boolean) =>
  cn(
    'flex min-w-0 flex-1 flex-col items-center gap-1 px-1 pt-2 pb-1.5 text-[10px] font-medium transition-colors',
    active ? 'text-primary' : 'text-fg-muted hover:text-fg',
  )

/** Native-style mobile bottom bar driven by the shared navigation registry. */
export function MobileTabBar({
  groups,
  pathname,
  onOpenMenu,
  linkRender = defaultLink,
  tabCount = 4,
  menuLabel = 'Menu',
  ariaLabel = 'Primary navigation',
}: {
  groups: SidebarNavGroup[]
  pathname: string
  onOpenMenu: () => void
  linkRender?: LinkRender
  tabCount?: number
  menuLabel?: string
  ariaLabel?: string
}) {
  const tabs = selectMobileTabs(groups, tabCount)
  const activeHref = findActiveNavHref(pathname, [{ label: '', items: tabs }])

  if (tabs.length === 0) return null

  return (
    <nav
      aria-label={ariaLabel}
      className="flex shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {tabs.map((tab) => {
        const active = activeHref === tab.href
        return (
          <React.Fragment key={tab.href}>
            {linkRender({
              href: tab.href,
              ariaCurrent: active ? 'page' : undefined,
              className: tabClass(active),
              children: (
                <>
                  <NavIcon iconKey={tab.iconKey} icon={tab.icon} size={20} />
                  <span className="w-full truncate text-center">{tab.label}</span>
                </>
              ),
            })}
          </React.Fragment>
        )
      })}
      <button type="button" onClick={onOpenMenu} className={tabClass(false)}>
        <Menu size={20} />
        <span className="w-full truncate text-center">{menuLabel}</span>
      </button>
    </nav>
  )
}
