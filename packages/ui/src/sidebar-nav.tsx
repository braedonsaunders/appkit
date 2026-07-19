'use client'

import * as React from 'react'
import { cn } from './utils'
import type { LinkRender } from './settings-layout'

export type SidebarNavItem = {
  href: string
  label: string
  icon?: React.ReactNode
  /** Active only on an exact path match (for hub/overview links that are a
   *  prefix of their siblings). */
  exact?: boolean
}

export type SidebarNavGroup = {
  label?: string
  items: SidebarNavItem[]
}

function matchesNavPath(pathname: string, item: { href: string; exact?: boolean }): boolean {
  if (pathname === item.href) return true
  if (item.exact || item.href === '/') return false
  return pathname.startsWith(item.href + '/')
}

/** The longest-matching nav href for the current path (greedy: /x/123 keeps /x lit). */
export function findActiveNavHref(
  pathname: string | null | undefined,
  groups: SidebarNavGroup[],
): string | null {
  if (!pathname) return null
  let active: string | null = null
  for (const group of groups) {
    for (const item of group.items) {
      if (!matchesNavPath(pathname, item)) continue
      if (!active || item.href.length > active.length) active = item.href
    }
  }
  return active
}

const defaultLink: LinkRender = ({ href, children, className, title }) => (
  <a href={href} className={className} title={title}>
    {children}
  </a>
)

/**
 * Grouped sidebar nav with a 2px left accent rail on active/hover. Greedy active
 * match keeps a parent lit on its sub-routes. Collapsed mode is icon-only.
 * Pass `pathname` (e.g. Next's `usePathname()`) and a `linkRender` for your
 * router's Link.
 */
export function SidebarNav({
  groups,
  pathname,
  collapsed = false,
  linkRender = defaultLink,
}: {
  groups: SidebarNavGroup[]
  pathname: string
  collapsed?: boolean
  linkRender?: LinkRender
}) {
  const activeHref = findActiveNavHref(pathname, groups)
  return (
    <nav className="app-scroll flex-1 overflow-y-auto px-2 py-3">
      {groups.map((group, gi) => (
        <div key={gi} className="mb-3">
          {collapsed ? (
            <div className="mx-2 mb-1 border-t border-border-subtle" aria-hidden />
          ) : group.label ? (
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">
              {group.label}
            </div>
          ) : null}
          {group.items.map((item) => {
            const active = activeHref === item.href
            return (
              <React.Fragment key={item.href}>
                {linkRender({
                  href: item.href,
                  title: collapsed ? item.label : undefined,
                  className: cn(
                    'group relative flex items-center rounded-md py-1.5 text-sm transition-colors duration-150 ease-out',
                    collapsed ? 'justify-center px-2' : 'gap-2.5 px-2',
                    'before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:transition-all before:duration-150 before:ease-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    active
                      ? 'bg-primary-subtle text-primary before:h-6 before:bg-primary'
                      : 'text-fg-muted before:bg-transparent hover:bg-surface-hover hover:text-fg hover:before:bg-border-strong',
                  ),
                  children: (
                    <>
                      {item.icon ? (
                        <span
                          className={cn(
                            'shrink-0 transition-colors duration-150 [&_svg]:size-[15px]',
                            active ? 'text-primary' : 'text-fg-subtle group-hover:text-fg',
                          )}
                        >
                          {item.icon}
                        </span>
                      ) : null}
                      {collapsed ? null : <span className="truncate">{item.label}</span>}
                    </>
                  ),
                })}
              </React.Fragment>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
