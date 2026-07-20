'use client'

import * as React from 'react'
import { findActiveNavHref, type SidebarNavGroup } from './sidebar-nav'
import type { LinkRender } from './settings-layout'
import { cn } from './utils'

const defaultLink: LinkRender = ({ href, children, className, title }) => (
  <a href={href} className={className} title={title}>
    {children}
  </a>
)

/**
 * Horizontal rendering of the shared navigation registry. AppShell uses this
 * in topbar mode; the same groups and active-path rules drive the sidebar and
 * mobile drawer, so switching layouts never creates a second navigation tree.
 */
export function TopNav({
  groups,
  pathname,
  linkRender = defaultLink,
  className,
}: {
  groups: SidebarNavGroup[]
  pathname: string
  linkRender?: LinkRender
  className?: string
}) {
  const activeHref = findActiveNavHref(pathname, groups)
  const items = groups.flatMap((group) => group.items)

  return (
    <nav aria-label="Primary" className={cn('min-w-0 items-center gap-1', className)}>
      {items.map((item) => {
        const active = item.href === activeHref
        return (
          <React.Fragment key={item.href}>
            {linkRender({
              href: item.href,
              className: cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                active
                  ? 'bg-primary-subtle text-primary'
                  : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
              ),
              children: (
                <>
                  {item.icon ? (
                    <span className={cn('shrink-0 [&_svg]:size-4', active ? 'text-primary' : 'text-fg-subtle')}>
                      {item.icon}
                    </span>
                  ) : null}
                  <span>{item.label}</span>
                </>
              ),
            })}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
