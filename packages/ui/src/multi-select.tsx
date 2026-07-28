'use client'

import * as React from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Badge } from './badge'
import { Button } from './button'
import { Input } from './input'
import { Popover } from './popover'
import { cn } from './utils'

export type MultiSelectOption = {
  value: string
  label: string
  description?: string
  disabled?: boolean
  group?: string
}

export type MultiSelectProps = {
  value: string[]
  onChange: (value: string[]) => void
  options: MultiSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  noMatchesLabel?: string
  clearLabel?: string
  selectAllLabel?: string
  disabled?: boolean
  clearable?: boolean
  maxVisibleValues?: number
  id?: string
  ariaLabel?: string
  className?: string
  triggerClassName?: string
}

/**
 * Searchable multi-value picker for permissions, categories, tags, and other
 * bounded option sets. The selected value order follows the option registry so
 * apps get stable rendering even when values are supplied from persisted data.
 */
export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  noMatchesLabel = 'No matches',
  clearLabel = 'Clear',
  selectAllLabel = 'Select all',
  disabled = false,
  clearable = true,
  maxVisibleValues = 3,
  id,
  ariaLabel,
  className,
  triggerClassName,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const selected = React.useMemo(() => new Set(value), [value])
  const selectedOptions = React.useMemo(
    () => options.filter((option) => selected.has(option.value)),
    [options, selected],
  )
  const enabledValues = React.useMemo(
    () => options.filter((option) => !option.disabled).map((option) => option.value),
    [options],
  )
  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return options
    return options.filter((option) =>
      [option.label, option.description, option.group]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(query)),
    )
  }, [options, search])

  function toggle(option: MultiSelectOption) {
    if (option.disabled) return
    if (selected.has(option.value)) {
      onChange(value.filter((candidate) => candidate !== option.value))
      return
    }
    onChange([...value, option.value])
  }

  const visibleValues = selectedOptions.slice(0, Math.max(0, maxVisibleValues))
  const overflowCount = Math.max(0, selectedOptions.length - visibleValues.length)
  const allEnabledSelected =
    enabledValues.length > 0 && enabledValues.every((candidate) => selected.has(candidate))

  return (
    <div className={cn('w-full', className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setSearch('')
        }}
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden p-0"
        trigger={
          <button
            id={id}
            type="button"
            aria-label={ariaLabel}
            aria-expanded={open}
            disabled={disabled}
            onClick={() => setOpen((current) => !current)}
            className={cn(
              'flex min-h-9 w-full items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-left text-sm text-fg outline-none transition-colors',
              'hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring/50',
              'disabled:pointer-events-none disabled:opacity-50',
              triggerClassName,
            )}
          >
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
              {selectedOptions.length === 0 ? (
                <span className="truncate text-fg-subtle">{placeholder}</span>
              ) : (
                <>
                  {visibleValues.map((option) => (
                    <Badge key={option.value} variant="secondary" className="max-w-full truncate">
                      {option.label}
                    </Badge>
                  ))}
                  {overflowCount > 0 ? <Badge variant="outline">+{overflowCount}</Badge> : null}
                </>
              )}
            </span>
            <ChevronDown className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          </button>
        }
      >
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8 text-xs"
              autoFocus
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(allEnabledSelected ? [] : enabledValues)}
              disabled={enabledValues.length === 0}
            >
              {allEnabledSelected ? clearLabel : selectAllLabel}
            </Button>
            {clearable && value.length > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
                <X className="size-3.5" />
                {clearLabel}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-fg-subtle">{noMatchesLabel}</div>
          ) : (
            filtered.map((option) => {
              const checked = selected.has(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  disabled={option.disabled}
                  onClick={() => toggle(option)}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                    'hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-40',
                    checked && 'bg-primary-subtle',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-4 shrink-0 place-items-center rounded border',
                      checked
                        ? 'border-primary bg-primary text-primary-fg'
                        : 'border-border-strong bg-surface',
                    )}
                  >
                    {checked ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 block truncate text-xs text-fg-muted">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {option.group ? (
                    <span className="shrink-0 text-[10px] font-medium tracking-wide text-fg-subtle uppercase">
                      {option.group}
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      </Popover>
    </div>
  )
}
