'use client'

import * as React from 'react'
import { ArrowUpRight } from 'lucide-react'
import { PageHeader } from './page-header'
import { cn } from './utils'

export type LinkRender = (props: {
  href: string
  children: React.ReactNode
  className: string
  title?: string
  ariaCurrent?: 'page' | 'true'
  role?: string
  dataWalkthrough?: string
}) => React.ReactNode

const defaultLink: LinkRender = ({
  href,
  children,
  className,
  title,
  ariaCurrent,
  role,
  dataWalkthrough,
}) => (
  <a
    href={href}
    className={className}
    title={title}
    aria-current={ariaCurrent}
    role={role}
    data-walkthrough={dataWalkthrough}
  >
    {children}
  </a>
)

// ---------------------------------------------------------------------------
// AdminHub — the settings LANDING page: grouped cards, each an accent-colored
// icon chip + title/description + a hover arrow, linking to a sub-area.
// Faithful to openbooks admin/page.tsx. Accent hues are decorative categories
// (like chart colors), kept as complete literal classes for Tailwind's scanner.
// ---------------------------------------------------------------------------

export type AdminHubAccent = 'teal' | 'violet' | 'amber' | 'sky'

const ACCENTS: Record<AdminHubAccent, { chip: string; border: string; link: string }> = {
  teal: {
    chip: 'bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-950/50 dark:text-teal-300',
    border: 'hover:border-teal-300 dark:hover:border-teal-700',
    link: 'group-hover:text-teal-600 dark:group-hover:text-teal-300',
  },
  violet: {
    chip: 'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/50 dark:text-violet-300',
    border: 'hover:border-violet-300 dark:hover:border-violet-700',
    link: 'group-hover:text-violet-600 dark:group-hover:text-violet-300',
  },
  amber: {
    chip: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/50 dark:text-amber-300',
    border: 'hover:border-amber-300 dark:hover:border-amber-700',
    link: 'group-hover:text-amber-600 dark:group-hover:text-amber-300',
  },
  sky: {
    chip: 'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-950/50 dark:text-sky-300',
    border: 'hover:border-sky-300 dark:hover:border-sky-700',
    link: 'group-hover:text-sky-600 dark:group-hover:text-sky-300',
  },
}

export type AdminHubCard = { href: string; title: string; description?: string; icon?: React.ReactNode }
export type AdminHubGroup = { label?: string; accent?: AdminHubAccent; cards: AdminHubCard[] }

export function AdminHub({
  title,
  description,
  groups,
  linkRender = defaultLink,
}: {
  title?: string
  description?: string
  groups: AdminHubGroup[]
  linkRender?: LinkRender
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {title || description ? (
        <div className="shrink-0 border-b border-border bg-surface px-3 py-3 sm:px-6">
          <PageHeader title={title ?? ''} description={description} />
        </div>
      ) : null}
      <div className="app-scroll min-h-0 flex-1 overflow-y-auto bg-bg-subtle">
        <div className="mx-auto w-full max-w-(--breakpoint-2xl) space-y-8 p-4 sm:p-6">
          {groups.map((group, gi) => {
            const accent = ACCENTS[group.accent ?? 'teal']
            return (
              <section key={gi} className="space-y-3">
                {group.label ? (
                  <h2 className="px-0.5 text-xs font-semibold tracking-wider text-fg-subtle uppercase">
                    {group.label}
                  </h2>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {group.cards.map((card, ci) => (
                    <React.Fragment key={ci}>
                      {linkRender({
                      href: card.href,
                      title: card.description,
                      className: cn(
                        'group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-all hover:shadow-md',
                        accent.border,
                      ),
                      children: (
                        <>
                          <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg ring-1', accent.chip)}>
                            {card.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold text-fg">{card.title}</h3>
                            {card.description ? (
                              <p className="truncate text-xs text-fg-muted">{card.description}</p>
                            ) : null}
                          </div>
                          <ArrowUpRight
                            size={15}
                            aria-hidden
                            className={cn(
                              'shrink-0 text-fg-subtle opacity-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100',
                              accent.link,
                            )}
                          />
                        </>
                      ),
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsShell — the SIDEBAR settings area: a fixed header (with a back link
// to the hub), and a two-pane body — a grouped nav rail beside the active
// content, each pane scrolling independently. Faithful to openbooks
// setup/layout.tsx + SetupNav.tsx.
// ---------------------------------------------------------------------------

export type SettingsNavItem = { key: string; label: string; icon?: React.ReactNode; badge?: React.ReactNode }
export type SettingsNavGroup = { label?: string; items: SettingsNavItem[] }

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
    <nav className={cn('w-full', className)}>
      <div className="space-y-5">
        {groups.map((group, gi) => (
          <div key={gi} className="space-y-1">
            {group.label ? (
              <h3 className="px-2 text-xs font-semibold tracking-wider text-fg-subtle uppercase">
                {group.label}
              </h3>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.key === activeKey
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => onSelect(item.key)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-primary-subtle font-medium text-primary'
                          : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                      )}
                    >
                      <span className={cn('shrink-0 [&_svg]:size-[15px]', active ? 'text-primary' : 'text-fg-subtle')}>
                        {item.icon}
                      </span>
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      {item.badge}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}

export function SettingsShell({
  title,
  description,
  back,
  actions,
  nav,
  activeKey,
  onSelect,
  children,
  linkRender = defaultLink,
}: {
  title: string
  description?: string
  back?: { href: string; label: string }
  actions?: React.ReactNode
  nav: SettingsNavGroup[]
  activeKey: string
  onSelect: (key: string) => void
  children: React.ReactNode
  linkRender?: LinkRender
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-surface px-3 py-3 sm:px-6">
        <PageHeader
          title={title}
          description={description}
          actions={actions}
          back={
            back
              ? { ...back, render: (p) => linkRender({ href: p.href, className: p.className, children: p.children }) }
              : undefined
          }
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="app-scroll w-44 shrink-0 overflow-y-auto border-r border-border bg-surface p-3 sm:w-52 lg:w-60">
          <SettingsNav groups={nav} activeKey={activeKey} onSelect={onSelect} />
        </aside>
        <div className="app-scroll min-h-0 flex-1 overflow-y-auto bg-bg-subtle">
          <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">{children}</div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Content helpers used inside a SettingsShell.
// ---------------------------------------------------------------------------

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
