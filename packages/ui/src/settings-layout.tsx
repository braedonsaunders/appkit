'use client'

import * as React from 'react'
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react'
import { UiLink } from './link-context'
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
  <UiLink
    href={href}
    className={className}
    title={title}
    aria-current={ariaCurrent}
    role={role}
    data-walkthrough={dataWalkthrough}
  >
    {children}
  </UiLink>
)

// ---------------------------------------------------------------------------
// AdminHub — the settings LANDING page: grouped cards, each an accent-colored
// icon chip + title/description + a hover arrow, linking to a sub-area.
// Expressed through semantic tokens so a
// consuming application's brand and dark theme remain authoritative.
// ---------------------------------------------------------------------------

export type AdminHubAccent = 'teal' | 'violet' | 'amber' | 'sky'

const ACCENTS: Record<AdminHubAccent, { chip: string; border: string; link: string }> = {
  teal: {
    chip: 'bg-primary-subtle text-primary ring-primary/15',
    border: 'hover:border-primary/40',
    link: 'group-hover:text-primary',
  },
  violet: {
    chip: 'bg-info-subtle text-info ring-info/15',
    border: 'hover:border-info/40',
    link: 'group-hover:text-info',
  },
  amber: {
    chip: 'bg-warning-subtle text-warning ring-warning/15',
    border: 'hover:border-warning/40',
    link: 'group-hover:text-warning',
  },
  sky: {
    chip: 'bg-success-subtle text-success ring-success/15',
    border: 'hover:border-success/40',
    link: 'group-hover:text-success',
  },
}

export type AdminHubCard = {
  href?: string
  title: string
  description?: string
  icon?: React.ReactNode
  badge?: React.ReactNode
  features?: string[]
  linkLabel?: string
}
export type AdminHubGroup = {
  label?: string
  description?: string
  accent?: AdminHubAccent
  layout?: 'compact' | 'detailed'
  cards: AdminHubCard[]
}

export function AdminHub({
  title,
  description,
  actions,
  groups,
  linkRender = defaultLink,
}: {
  title?: string
  description?: string
  actions?: React.ReactNode
  groups: AdminHubGroup[]
  linkRender?: LinkRender
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {title || description ? (
        <div className="shrink-0 border-b border-border bg-surface px-3 py-3 sm:px-6">
          <PageHeader title={title ?? ''} description={description} actions={actions} />
        </div>
      ) : null}
      <div className="app-scroll min-h-0 flex-1 overflow-y-auto bg-bg-subtle">
        <div className="mx-auto w-full max-w-(--breakpoint-2xl) space-y-8 p-4 sm:p-6">
          {groups.map((group, gi) => {
            const accent = ACCENTS[group.accent ?? 'teal']
            return (
              <section key={gi} className="space-y-3">
                {group.label || group.description ? (
                  <div className="space-y-1 px-0.5">
                    {group.label ? (
                      <h2 className="text-xs font-semibold tracking-wider text-fg-subtle uppercase">
                        {group.label}
                      </h2>
                    ) : null}
                    {group.description ? (
                      <p className="max-w-3xl text-sm text-fg-muted">{group.description}</p>
                    ) : null}
                  </div>
                ) : null}
                <div
                  className={cn(
                    'grid grid-cols-1 gap-3 sm:grid-cols-2',
                    group.layout === 'detailed' ? '2xl:grid-cols-3' : 'lg:grid-cols-3 2xl:grid-cols-4',
                  )}
                >
                  {group.cards.map((card, ci) => {
                    const detailed = group.layout === 'detailed'
                    const content = detailed ? (
                      <>
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              'grid size-10 shrink-0 place-items-center rounded-lg ring-1 [&_svg]:size-[18px]',
                              accent.chip,
                            )}
                          >
                            {card.icon}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-mono text-sm font-semibold text-fg">{card.title}</h3>
                              {card.badge}
                            </div>
                            {card.description ? (
                              <p className="text-sm leading-relaxed text-fg-muted">
                                {card.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {card.features?.length ? (
                          <ul className="mt-4 space-y-2 border-t border-border-subtle pt-4">
                            {card.features.map((feature) => (
                              <li
                                key={feature}
                                className="flex gap-2 text-xs leading-relaxed text-fg-muted"
                              >
                                <Check
                                  className="mt-0.5 size-3.5 shrink-0 text-primary"
                                  aria-hidden
                                />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {card.href && card.linkLabel ? (
                          <span
                            className={cn(
                              'mt-auto flex items-center gap-1.5 pt-4 text-xs font-semibold text-fg-muted',
                              accent.link,
                            )}
                          >
                            {card.linkLabel}
                            <ArrowRight
                              className="size-3.5 transition-transform group-hover:translate-x-0.5"
                              aria-hidden
                            />
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <span
                          className={cn(
                            'grid size-10 shrink-0 place-items-center rounded-lg ring-1',
                            accent.chip,
                          )}
                        >
                          {card.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-fg">{card.title}</h3>
                          {card.description ? (
                            <p className="truncate text-xs text-fg-muted">{card.description}</p>
                          ) : null}
                        </div>
                        {card.href ? (
                          <ArrowUpRight
                            size={15}
                            aria-hidden
                            className={cn(
                              'shrink-0 text-fg-subtle opacity-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100',
                              accent.link,
                            )}
                          />
                        ) : null}
                      </>
                    )
                    const className = cn(
                      'group rounded-xl border border-border bg-surface shadow-sm transition-all',
                      detailed ? 'flex h-full flex-col p-4' : 'flex items-center gap-3 p-3.5',
                      card.href && 'hover:shadow-md',
                      card.href && accent.border,
                    )

                    return card.href ? (
                      <React.Fragment key={ci}>
                        {linkRender({
                          href: card.href,
                          title: card.description,
                          className,
                          children: content,
                        })}
                      </React.Fragment>
                    ) : (
                      <article key={ci} className={className}>
                        {content}
                      </article>
                    )
                  })}
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
// content, each pane scrolling independently. The
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
