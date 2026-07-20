import * as React from 'react'
import { DocumentTitle } from './document-title'
import { UiBackLink } from './link-context'
import { cn } from './utils'

export type PageHeaderProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  /** Optional back link. `render` lets an app supply its own <Link>. */
  back?: { href: string; label: string; render?: (props: { href: string; children: React.ReactNode; className: string }) => React.ReactNode }
  className?: string
}

export function PageHeader({ title, description, actions, back, className }: PageHeaderProps) {
  const backClass = 'inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-primary'
  return (
    <div className={cn('space-y-2', className)}>
      <DocumentTitle title={title} />
      {back ? (
        back.render ? (
          back.render({ href: back.href, className: backClass, children: <>← {back.label}</> })
        ) : <UiBackLink href={back.href} label={back.label} className={backClass} />
      ) : null}
      <header className="flex items-center justify-between gap-3 sm:items-end sm:gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-xl font-semibold text-fg sm:text-2xl">{title}</h1>
          {description ? (
            <p className="hidden text-sm text-fg-muted sm:block">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
        ) : null}
      </header>
    </div>
  )
}

export type DetailHeaderProps = {
  back?: { href: string; label: string }
  title: string
  subtitle?: string
  badge?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

/** Source-compatible record-detail heading. */
export function DetailHeader({
  back,
  title,
  subtitle,
  badge,
  actions,
  className,
}: DetailHeaderProps) {
  return (
    <header className={cn('space-y-2', className)}>
      <DocumentTitle title={title} />
      {back ? (
        <UiBackLink
          href={back.href}
          label={back.label}
          className="text-sm text-primary hover:underline"
        />
      ) : null}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-xl font-semibold text-fg sm:truncate sm:text-2xl">{title}</h1>
          {badge}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {subtitle ? <p className="text-sm text-fg-muted">{subtitle}</p> : null}
    </header>
  )
}
