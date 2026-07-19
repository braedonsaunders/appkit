import * as React from 'react'
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
      {back ? (
        back.render ? (
          back.render({ href: back.href, className: backClass, children: <>← {back.label}</> })
        ) : (
          <a href={back.href} className={backClass}>
            ← {back.label}
          </a>
        )
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
