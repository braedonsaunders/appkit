'use client'

import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover } from './popover'
import { mergeHref, pickString, type ListSearchParams } from './list-params'
import { useListNavClick } from './list-nav'
import { cn } from './utils'

export type FilterOption = { value: string; label: string; count?: number }

/**
 * Single-select filter rendered as a compact dropdown button. Collapses a whole
 * row of chips into one pill showing the active selection inline, so several
 * filters + the search box fit one toolbar row. Selecting an option navigates —
 * the param lives in the URL. (Copied from the openbooks FilterChips; tokenized,
 * next Link → soft-nav anchors, i18n → props.)
 */
export function FilterChips({
  basePath,
  currentParams,
  paramKey,
  label,
  options,
  allLabel = 'All',
  defaultValue,
  pageParamKey = 'page',
  hideAll = false,
}: {
  basePath: string
  currentParams: ListSearchParams
  paramKey: string
  label: string
  options: FilterOption[]
  allLabel?: string
  /** Treated as the active selection while the URL carries no param; picking
   *  "All" then navigates to an explicit `all` sentinel. */
  defaultValue?: string
  /** Pagination parameter reset when this filter changes. */
  pageParamKey?: string
  /** Hide the generic All option (e.g. sort selectors). */
  hideAll?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const raw = pickString(currentParams[paramKey])
  const current = raw ?? defaultValue
  const active = options.find((o) => o.value === current)
  const allHref = mergeHref(basePath, currentParams, {
    [paramKey]: defaultValue ? 'all' : undefined,
    [pageParamKey]: 1,
  })
  const allActive = defaultValue ? current === 'all' : !current

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="min-w-[13rem] p-1"
      trigger={
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'inline-flex h-8 max-w-[16rem] items-center gap-1.5 rounded-md border px-3 text-sm transition-colors',
            active
              ? 'border-primary/40 bg-primary-subtle text-primary'
              : 'border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-hover',
          )}
        >
          <span className={cn('shrink-0', active ? 'text-primary/80' : 'text-fg-muted')}>
            {active ? `${label}:` : label}
          </span>
          {active ? <span className="truncate font-semibold">{active.label}</span> : null}
          <ChevronDown
            size={14}
            className={cn(
              'ml-auto shrink-0 transition-transform',
              open && 'rotate-180',
              active ? 'text-primary/70' : 'text-fg-subtle',
            )}
          />
        </button>
      }
    >
      <div className="max-h-72 overflow-auto" role="listbox">
        {!hideAll ? (
          <FilterItem href={allHref} active={allActive} onSelect={() => setOpen(false)}>
            {allLabel}
          </FilterItem>
        ) : null}
        {options.map((opt) => (
          <FilterItem
            key={opt.value}
            href={mergeHref(basePath, currentParams, { [paramKey]: opt.value, [pageParamKey]: 1 })}
            active={current === opt.value}
            count={opt.count}
            onSelect={() => setOpen(false)}
          >
            {opt.label}
          </FilterItem>
        ))}
      </div>
    </Popover>
  )
}

function FilterItem({
  href,
  active,
  count,
  onSelect,
  children,
}: {
  href: string
  active: boolean
  count?: number
  onSelect: () => void
  children: React.ReactNode
}) {
  const navClick = useListNavClick(href)
  return (
    <a
      href={href}
      onClick={(e) => {
        onSelect()
        navClick(e)
      }}
      role="option"
      aria-selected={active}
      className={cn(
        'flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors',
        active ? 'bg-primary-subtle font-medium text-primary' : 'text-fg hover:bg-surface-hover',
      )}
    >
      <Check size={14} className={cn('shrink-0', active ? 'text-primary' : 'text-transparent')} />
      <span className="flex-1 truncate">{children}</span>
      {typeof count === 'number' ? (
        <span className={cn('shrink-0 text-xs tabular-nums', active ? 'text-primary/80' : 'text-fg-subtle')}>
          {count}
        </span>
      ) : null}
    </a>
  )
}
