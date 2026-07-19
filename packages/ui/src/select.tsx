'use client'

import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover } from './popover'
import { cn } from './utils'

export type SelectOption = { value: string; label: string; disabled?: boolean }

export type SelectProps = {
  value?: string
  onChange?: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  /** Force the search box on/off. Defaults to auto (shown for long lists). */
  searchable?: boolean
  searchPlaceholder?: string
  emptyLabel?: string
  disabled?: boolean
  invalid?: boolean
  id?: string
  'aria-label'?: string
  className?: string
  triggerClassName?: string
}

/**
 * Select — a searchable, keyboard-navigable combobox anchored via Popover.
 * Arrow keys move the highlight, Enter selects, Esc closes, typing filters.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchable,
  searchPlaceholder = 'Search…',
  emptyLabel = 'No results',
  disabled,
  invalid,
  id,
  'aria-label': ariaLabel,
  className,
  triggerClassName,
}: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const searchRef = React.useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)
  const showSearch = searchable ?? options.length > 7
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  React.useEffect(() => {
    if (open) {
      setQuery('')
      setActive(Math.max(0, filtered.findIndex((o) => o.value === value)))
      if (showSearch) requestAnimationFrame(() => searchRef.current?.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function commit(opt: SelectOption | undefined) {
    if (!opt || opt.disabled) return
    onChange?.(opt.value)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(filtered[active])
    }
  }

  return (
    <div className={cn('block w-full', className)}>
      <Popover
        open={open}
        onOpenChange={setOpen}
        align="start"
        className="max-h-72 w-[var(--appkit-select-w,16rem)] overflow-hidden p-0"
        trigger={
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-sm text-fg transition-shadow',
              'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              'disabled:cursor-not-allowed disabled:bg-bg-subtle disabled:opacity-50',
              invalid && 'border-danger focus-visible:ring-danger/30',
              triggerClassName,
            )}
          >
            <span className={cn('truncate', !selected && 'text-fg-subtle')}>
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown className="size-4 shrink-0 text-fg-subtle" />
          </button>
        }
      >
        <div onKeyDown={onKeyDown}>
          {showSearch ? (
            <div className="border-b border-border p-1.5">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                placeholder={searchPlaceholder}
                className="w-full rounded-sm bg-transparent px-2 py-1 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
              />
            </div>
          ) : null}
          <div className="max-h-60 overflow-y-auto p-1" role="listbox">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-fg-subtle">{emptyLabel}</div>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => commit(opt)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-50',
                      i === active ? 'bg-surface-hover text-fg' : 'text-fg',
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </Popover>
    </div>
  )
}
