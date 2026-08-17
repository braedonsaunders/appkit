import * as React from 'react'
import { cn } from '@braedonsaunders/appkit-ui'

export type DashboardMetricTone = 'primary' | 'info' | 'success' | 'warning' | 'danger'

export type DashboardMetricCardProps = {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  icon?: React.ReactNode
  trend?: React.ReactNode
  tone?: DashboardMetricTone
  className?: string
}

/**
 * Opinionated KPI tile for fixed or configurable dashboards. The host owns the
 * metric and its data; AppKit owns the visual grammar.
 */
export function DashboardMetricCard({
  label,
  value,
  detail,
  icon,
  trend,
  tone = 'primary',
  className,
}: DashboardMetricCardProps) {
  const tones = {
    primary: { border: 'border-l-primary', icon: 'bg-primary-subtle text-primary' },
    info: { border: 'border-l-info', icon: 'bg-info-subtle text-info' },
    success: { border: 'border-l-success', icon: 'bg-success-subtle text-success' },
    warning: { border: 'border-l-warning', icon: 'bg-warning-subtle text-warning' },
    danger: { border: 'border-l-danger', icon: 'bg-danger-subtle text-danger' },
  }

  return (
    <div
      className={cn(
        'relative h-full overflow-hidden rounded-xl border border-border border-l-4 bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
        tones[tone].border,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {label}
          </div>
          <div className="mt-3 truncate text-2xl font-semibold tabular-nums text-fg">{value}</div>
          {detail ? <div className="mt-1 truncate text-xs text-fg-muted">{detail}</div> : null}
        </div>
        {icon ? (
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tones[tone].icon)}>
            {icon}
          </span>
        ) : null}
      </div>
      {trend ? <div className="absolute bottom-3 right-4 h-7 w-20 opacity-80">{trend}</div> : null}
    </div>
  )
}

export type DashboardPanelProps = {
  title?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

/**
 * Shared dashboard panel chrome. Omit `title` for a body-owned header while
 * retaining the same surface, border, radius, and elevation.
 */
export function DashboardPanel({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: DashboardPanelProps) {
  return (
    <section
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm',
        className,
      )}
    >
      {title ? (
        <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <h3 className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-fg">
            {icon ? <span className="text-primary">{icon}</span> : null}
            {title}
          </h3>
          {actions}
        </header>
      ) : null}
      <div className={cn('min-h-0 flex-1 p-4', bodyClassName)}>{children}</div>
    </section>
  )
}
