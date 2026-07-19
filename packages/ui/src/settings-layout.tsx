'use client'

import * as React from 'react'
import { cn } from './utils'

export type SettingsNavItem = { key: string; label: string; icon?: React.ReactNode; badge?: React.ReactNode }
export type SettingsNavGroup = { label?: string; items: SettingsNavItem[] }

/** The left navigation for a settings/admin area. Vertical on desktop, a
 *  horizontal scroll on mobile. Controlled via activeKey/onSelect. */
export function SettingsNav({
  groups,
  activeKey,
  onSelect,
  className,
}: {
  groups: SettingsNavGroup[]
  activeKey: string
  onSelect: (key: string) => void
  className?: string
}) {
  return (
    <nav
      className={cn(
        'flex gap-1 overflow-x-auto pb-1 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0',
        className,
      )}
    >
      {groups.map((group, gi) => (
        <div key={gi} className="flex gap-1 md:flex-col md:gap-0.5">
          {group.label ? (
            <div className="hidden px-3 pb-1 pt-3 text-xs font-medium tracking-wide text-fg-subtle uppercase md:block">
              {group.label}
            </div>
          ) : null}
          {group.items.map((item) => {
            const active = item.key === activeKey
            return (
              <button
                key={item.key}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelect(item.key)}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  active
                    ? 'bg-primary-subtle text-primary'
                    : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                )}
              >
                {item.icon ? <span className="[&_svg]:size-4">{item.icon}</span> : null}
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/** Two-pane settings shell: a sticky nav column + a content column, with an
 *  optional page header. Compose the content from SettingsSection/SettingsRow. */
export function SettingsLayout({
  title,
  description,
  actions,
  nav,
  activeKey,
  onSelect,
  children,
  className,
}: {
  title?: string
  description?: string
  actions?: React.ReactNode
  nav: SettingsNavGroup[]
  activeKey: string
  onSelect: (key: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-4 py-8 sm:px-6', className)}>
      {title || actions ? (
        <header className="mb-6 flex items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            {title ? <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1> : null}
            {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="grid gap-6 md:grid-cols-[210px_1fr] md:gap-8">
        <aside className="md:sticky md:top-20 md:self-start">
          <SettingsNav groups={nav} activeKey={activeKey} onSelect={onSelect} />
        </aside>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  )
}

/** A titled group of settings rows. */
export function SettingsSection({
  title,
  description,
  footer,
  children,
  className,
}: {
  title?: string
  description?: string
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-surface', className)}>
      {title || description ? (
        <div className="border-b border-border px-5 py-4">
          {title ? <h2 className="text-sm font-semibold text-fg">{title}</h2> : null}
          {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
        </div>
      ) : null}
      <div className="divide-y divide-border">{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-subtle px-5 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  )
}

/** One row inside a SettingsSection: label/description on the left, a control on
 *  the right. `stacked` drops the control to a full-width row below the label. */
export function SettingsRow({
  title,
  description,
  control,
  stacked = false,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  control?: React.ReactNode
  stacked?: boolean
  children?: React.ReactNode
  className?: string
}) {
  const right = control ?? children
  return (
    <div
      className={cn(
        stacked ? 'space-y-2 px-5 py-4' : 'flex items-center justify-between gap-4 px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm font-medium text-fg">{title}</div>
        {description ? <div className="text-sm text-fg-muted">{description}</div> : null}
      </div>
      {right ? <div className={cn(stacked ? 'w-full' : 'shrink-0')}>{right}</div> : null}
    </div>
  )
}
