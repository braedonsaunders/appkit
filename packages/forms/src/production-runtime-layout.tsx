'use client'

import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@appkit/ui'

export type ProductionSectionTone =
  | 'neutral'
  | 'info'
  | 'accent'
  | 'primary'
  | 'warning'
  | 'success'
  | 'danger'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'amber'
  | 'indigo'
  | 'emerald'
  | 'rose'
  | 'slate'

const TONE: Record<ProductionSectionTone, string> = {
  neutral: 'bg-bg-subtle text-fg-muted',
  info: 'bg-info-subtle text-info',
  accent: 'bg-accent-subtle text-accent',
  primary: 'bg-primary-subtle text-primary',
  warning: 'bg-warning-subtle text-warning',
  success: 'bg-success-subtle text-success',
  danger: 'bg-danger-subtle text-danger',
  teal: 'bg-primary-subtle text-primary',
  blue: 'bg-info-subtle text-info',
  purple: 'bg-accent-subtle text-accent',
  amber: 'bg-warning-subtle text-warning',
  indigo: 'bg-accent-subtle text-accent',
  emerald: 'bg-success-subtle text-success',
  rose: 'bg-danger-subtle text-danger',
  slate: 'bg-bg-subtle text-fg-muted',
}

export type ProductionSectionProps = {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}

/** Tokenized extraction of the production collapsible record section. */
export function ProductionSection({
  title,
  subtitle,
  actions,
  defaultOpen = true,
  children,
}: ProductionSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-3 pr-5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-3 px-5 py-3 text-left hover:bg-surface-hover"
          aria-expanded={open}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-semibold text-fg">
              <ChevronDown
                size={16}
                className={cn('text-fg-subtle transition-transform', !open && '-rotate-90')}
              />
              {title}
            </div>
            {subtitle ? <div className="ml-6 text-xs text-fg-muted">{subtitle}</div> : null}
          </div>
        </button>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {open ? <div className="border-t border-border-subtle px-5 py-4">{children}</div> : null}
    </section>
  )
}

export type ProductionPremiumSectionProps = ProductionSectionProps & {
  icon?: React.ReactNode
  tone?: ProductionSectionTone
  count?: number
  done?: boolean
  doneLabel?: string
}

/** Tokenized extraction of the production premium single-page section card. */
export function ProductionPremiumSection({
  title,
  subtitle,
  actions,
  icon,
  tone = 'neutral',
  count,
  done,
  doneLabel = 'Done',
  defaultOpen = true,
  children,
}: ProductionPremiumSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
        {icon ? (
          <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', TONE[tone])}>
            {icon}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
          aria-expanded={open}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-fg sm:text-[17px]">{title}</h2>
              {typeof count === 'number' ? (
                <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">
                  {count}
                </span>
              ) : null}
              {done ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
                  <Check size={11} /> {doneLabel}
                </span>
              ) : null}
            </div>
            {subtitle ? <p className="mt-0.5 truncate text-sm text-fg-muted">{subtitle}</p> : null}
          </div>
          <ChevronDown
            size={18}
            className={cn('shrink-0 text-fg-subtle transition-transform', !open && '-rotate-90')}
          />
        </button>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {open ? <div className="border-t border-border-subtle p-4 sm:p-5">{children}</div> : null}
    </section>
  )
}
