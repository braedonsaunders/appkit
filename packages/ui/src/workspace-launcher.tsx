'use client'

import * as React from 'react'
import { ArrowRight } from 'lucide-react'
import { Badge, type BadgeProps } from './badge'
import { cn } from './utils'

export type WorkspaceLaunchTone =
  | 'indigo'
  | 'sky'
  | 'amber'
  | 'teal'
  | 'emerald'
  | 'violet'
  | 'rose'
  | 'lime'
  | 'cyan'

export type WorkspaceLaunchSegment = {
  label: string
  value: number
  tone?: WorkspaceLaunchTone
  muted?: boolean
}

export type WorkspaceLaunchBreakdown = {
  label: string
  segments: WorkspaceLaunchSegment[]
}

export type WorkspaceLaunchItem<Id extends string = string> = {
  id: Id
  title: string
  description: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  metric: React.ReactNode
  metricLabel: string
  tone: WorkspaceLaunchTone
  breakdown?: WorkspaceLaunchBreakdown
  summary?: React.ReactNode
  summaryVariant?: BadgeProps['variant']
  disabled?: boolean
  ghostIcon?: boolean
  ariaLabel?: string
}

export type WorkspaceLauncherProps<Id extends string = string> = {
  items: WorkspaceLaunchItem<Id>[]
  onSelect: (id: Id, item: WorkspaceLaunchItem<Id>) => void
  title?: React.ReactNode
  description?: React.ReactNode
  framed?: boolean
  density?: 'compact' | 'comfortable'
  /** `scroll` keeps fixed-height cards and scrolls the grid. `fit` divides the
   * available height evenly between rows and never introduces a grid scrollbar. */
  layout?: 'scroll' | 'fit'
  /** Hide composition meters without changing the data supplied by callers. */
  showBreakdowns?: boolean
  /** Hide per-card summary badges in space-constrained launchers. */
  showSummaries?: boolean
  className?: string
  gridClassName?: string
  cardClassName?: string
  itemCountLabel?: React.ReactNode
  formatCount?: (value: number) => React.ReactNode
}

const toneClasses: Record<
  WorkspaceLaunchTone,
  { accent: string; ghost: string; hover: string; icon: string; rail: string; wash: string }
> = {
  indigo: {
    accent: 'text-indigo-500',
    ghost: 'text-indigo-500/[0.06] group-hover/card:text-indigo-500/[0.10]',
    hover: 'hover:border-indigo-500/45',
    icon: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-500',
    rail: 'bg-indigo-500',
    wash: 'bg-indigo-500/5',
  },
  sky: {
    accent: 'text-sky-500',
    ghost: 'text-sky-500/[0.06] group-hover/card:text-sky-500/[0.10]',
    hover: 'hover:border-sky-500/45',
    icon: 'border-sky-500/25 bg-sky-500/10 text-sky-500',
    rail: 'bg-sky-500',
    wash: 'bg-sky-500/5',
  },
  amber: {
    accent: 'text-amber-500',
    ghost: 'text-amber-500/[0.06] group-hover/card:text-amber-500/[0.10]',
    hover: 'hover:border-amber-500/45',
    icon: 'border-amber-500/25 bg-amber-500/10 text-amber-500',
    rail: 'bg-amber-500',
    wash: 'bg-amber-500/5',
  },
  teal: {
    accent: 'text-teal-600',
    ghost: 'text-teal-600/[0.06] group-hover/card:text-teal-600/[0.10]',
    hover: 'hover:border-teal-600/45',
    icon: 'border-teal-600/25 bg-teal-600/10 text-teal-600',
    rail: 'bg-teal-600',
    wash: 'bg-teal-600/5',
  },
  emerald: {
    accent: 'text-emerald-600',
    ghost: 'text-emerald-600/[0.06] group-hover/card:text-emerald-600/[0.10]',
    hover: 'hover:border-emerald-600/45',
    icon: 'border-emerald-600/25 bg-emerald-600/10 text-emerald-600',
    rail: 'bg-emerald-600',
    wash: 'bg-emerald-600/5',
  },
  violet: {
    accent: 'text-violet-500',
    ghost: 'text-violet-500/[0.06] group-hover/card:text-violet-500/[0.10]',
    hover: 'hover:border-violet-500/45',
    icon: 'border-violet-500/25 bg-violet-500/10 text-violet-500',
    rail: 'bg-violet-500',
    wash: 'bg-violet-500/5',
  },
  rose: {
    accent: 'text-rose-500',
    ghost: 'text-rose-500/[0.06] group-hover/card:text-rose-500/[0.10]',
    hover: 'hover:border-rose-500/45',
    icon: 'border-rose-500/25 bg-rose-500/10 text-rose-500',
    rail: 'bg-rose-500',
    wash: 'bg-rose-500/5',
  },
  lime: {
    accent: 'text-lime-600',
    ghost: 'text-lime-600/[0.06] group-hover/card:text-lime-600/[0.10]',
    hover: 'hover:border-lime-600/45',
    icon: 'border-lime-600/25 bg-lime-600/10 text-lime-600',
    rail: 'bg-lime-600',
    wash: 'bg-lime-600/5',
  },
  cyan: {
    accent: 'text-cyan-500',
    ghost: 'text-cyan-500/[0.06] group-hover/card:text-cyan-500/[0.10]',
    hover: 'hover:border-cyan-500/45',
    icon: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-500',
    rail: 'bg-cyan-500',
    wash: 'bg-cyan-500/5',
  },
}

const segmentPalette: WorkspaceLaunchTone[] = [
  'indigo',
  'cyan',
  'sky',
  'violet',
  'amber',
  'emerald',
  'rose',
  'lime',
  'teal',
]

function defaultFormatCount(value: number) {
  return new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? 'compact' : 'standard' }).format(value)
}

function BreakdownMeter({
  breakdown,
  formatCount,
}: {
  breakdown: WorkspaceLaunchBreakdown
  formatCount: (value: number) => React.ReactNode
}) {
  const total = breakdown.segments.reduce(
    (sum, segment) => sum + (segment.muted || !Number.isFinite(segment.value) ? 0 : Math.max(0, segment.value)),
    0,
  )

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
        <span className="truncate font-medium text-fg-muted">{breakdown.label}</span>
        <span className="shrink-0 tabular-nums text-fg-subtle">{formatCount(total)}</span>
      </div>
      <div className="flex h-4 overflow-visible rounded-full bg-bg-subtle">
        {breakdown.segments.map((segment, index) => {
          const value = segment.muted ? 0 : Math.max(0, segment.value)
          const width = segment.muted ? 100 : total > 0 ? (value / total) * 100 : 0
          const percent = total > 0 ? Math.round((value / total) * 100) : 0
          const tone = segment.tone ?? segmentPalette[index % segmentPalette.length] ?? 'indigo'
          const label = segment.muted ? segment.label : `${segment.label} · ${percent}%`
          return (
            <div
              key={`${segment.label}-${index}`}
              className={cn(
                'group/segment relative h-full first:rounded-l-full last:rounded-r-full',
                segment.muted ? 'bg-bg-subtle' : toneClasses[tone].rail,
              )}
              style={{ width: `${width}%` }}
              aria-label={segment.muted ? segment.label : `${segment.label}: ${value} (${percent}%)`}
            >
              <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 max-w-40 -translate-x-1/2 rounded border border-border bg-surface px-2 py-1 text-[10px] font-medium text-fg opacity-0 shadow-lg transition-opacity group-hover/segment:opacity-100">
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WorkspaceLaunchCard<Id extends string>({
  item,
  onSelect,
  density,
  showBreakdown,
  showSummary,
  className,
  formatCount,
}: {
  item: WorkspaceLaunchItem<Id>
  onSelect: (id: Id, item: WorkspaceLaunchItem<Id>) => void
  density: 'compact' | 'comfortable'
  showBreakdown: boolean
  showSummary: boolean
  className?: string
  formatCount: (value: number) => React.ReactNode
}) {
  const Icon = item.icon
  const tone = toneClasses[item.tone]
  return (
    <button
      type="button"
      disabled={item.disabled}
      aria-label={item.ariaLabel}
      onClick={() => onSelect(item.id, item)}
      className={cn(
        'group/card relative z-0 flex h-full min-h-0 min-w-0 flex-col overflow-visible rounded-lg border border-border bg-surface text-left shadow-sm transition-all duration-200',
        'hover:z-20 hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgb(var(--ch-fg)/0.10)] focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm',
        density === 'comfortable' ? 'p-5' : 'p-3',
        tone.hover,
        className,
      )}
    >
      <span className={cn('pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-200 group-hover/card:opacity-100', tone.wash)} />
      {item.ghostIcon ? (
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
          <Icon
            aria-hidden
            strokeWidth={1.25}
            className={cn(
              'absolute -bottom-10 -right-10 size-56 transition-all duration-300 group-hover/card:scale-[1.04] group-hover/card:-rotate-2',
              tone.ghost,
            )}
          />
        </span>
      ) : null}
      <span className={cn('absolute inset-x-0 top-0 h-1 rounded-t-lg', tone.rail)} />

      <span className="relative flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-2.5">
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg border shadow-[inset_0_1px_0_rgb(var(--ch-fg)/0.08)]', tone.icon)}>
            <Icon className="size-[18px]" />
          </span>
          <span className="min-w-0 pt-0.5">
            <span className="block truncate text-sm font-semibold text-fg">{item.title}</span>
            {showSummary && item.summary != null ? (
              <Badge variant={item.summaryVariant ?? 'secondary'} className="mt-1 shrink-0 whitespace-nowrap">
                {item.summary}
              </Badge>
            ) : null}
            <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">{item.description}</span>
          </span>
        </span>
        <ArrowRight className="mt-1 size-4 shrink-0 text-fg-subtle transition-all group-hover/card:translate-x-0.5 group-hover/card:text-fg-muted" />
      </span>

      <span className={cn('relative', showBreakdown && item.breakdown ? 'mt-3' : 'mt-auto pt-3')}>
        <span className={cn('block text-[10px] font-semibold uppercase tracking-wider', tone.accent)}>
          {item.metricLabel}
        </span>
        <span className="mt-1 block truncate text-3xl font-semibold leading-none tabular-nums text-fg">
          {item.metric}
        </span>
      </span>

      {showBreakdown && item.breakdown ? (
        <span className="relative mt-3">
          <BreakdownMeter breakdown={item.breakdown} formatCount={formatCount} />
        </span>
      ) : null}
    </button>
  )
}

export function WorkspaceLauncher<Id extends string = string>({
  items,
  onSelect,
  title,
  description,
  framed = true,
  density = 'compact',
  layout = 'scroll',
  showBreakdowns = true,
  showSummaries = true,
  className,
  gridClassName,
  cardClassName,
  itemCountLabel,
  formatCount = defaultFormatCount,
}: WorkspaceLauncherProps<Id>) {
  const content = (
    <>
      {title != null || description != null ? (
        <div className={cn('flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2', !framed && 'mb-3 rounded-lg border')}>
          <div className="min-w-0">
            {title != null ? <div className="text-xs font-semibold text-fg">{title}</div> : null}
            {description != null ? <div className="mt-0.5 truncate text-[11px] text-fg-muted">{description}</div> : null}
          </div>
          {itemCountLabel != null ? <Badge variant="info" className="lg:hidden">{itemCountLabel}</Badge> : null}
        </div>
      ) : null}
      <div className={cn('min-h-0 flex-1 overflow-hidden', framed && 'p-3')}>
        <div className={cn(
          'grid h-full min-h-0 gap-3 overflow-x-hidden md:grid-cols-2 lg:grid-cols-4',
          layout === 'fit'
            ? 'auto-rows-fr overflow-y-hidden'
            : 'auto-rows-[252px] overflow-y-auto pb-4 pr-1',
          gridClassName,
        )}>
          {items.map((item) => (
            <WorkspaceLaunchCard
              key={item.id}
              item={item}
              onSelect={onSelect}
              density={density}
              showBreakdown={showBreakdowns}
              showSummary={showSummaries}
              className={cardClassName}
              formatCount={formatCount}
            />
          ))}
        </div>
      </div>
    </>
  )

  if (!framed) {
    return <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', className)}>{content}</div>
  }
  return (
    <section className={cn('flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface', className)}>
      {content}
    </section>
  )
}
