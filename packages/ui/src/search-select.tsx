'use client'

// SearchSelect — a slick, mobile-first searchable select / typeahead.
//   • Desktop: anchored dropdown (portaled to <body>) with a search box + kbd nav.
//   • Mobile (<lg): an iOS/Android-style bottom sheet with large tap targets.
// Animated, portal'd sheet, Esc + click-out + scroll-lock, disabled options,
// optgroup-style headers (via SelectOption.group), hints, clearable, remote mode.
// Fully tokenized; i18n strings are injectable props with English defaults.

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from './utils'

export type SelectOption = {
  value: string
  label: string
  hint?: string
  disabled?: boolean
  /** Group header label; options sharing a group are batched under it. */
  group?: string
}

export type SearchSelectProps = {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  /** Adds a leading empty option (e.g. "None"). */
  clearable?: boolean
  emptyLabel?: string
  /** Title at the top of the mobile bottom sheet. */
  sheetTitle?: string
  ariaLabel?: string
  className?: string
  triggerClassName?: string
  /** Force the search box on/off. Auto: shown when >7 options or any groups. */
  searchable?: boolean
  /** Preserve server ordering + forward the query instead of local filtering. */
  remote?: boolean
  loading?: boolean
  statusMessage?: string
  statusTone?: 'muted' | 'error'
  onSearchChange?: (query: string) => void
  invalid?: boolean
  id?: string
  // Injectable labels (default English).
  noneLabel?: string
  noMatchesLabel?: string
  searchingLabel?: string
  selectLabel?: string
  closeLabel?: string
}

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  disabled = false,
  clearable = false,
  emptyLabel,
  sheetTitle,
  ariaLabel,
  className,
  triggerClassName,
  searchable,
  remote = false,
  loading = false,
  statusMessage,
  statusTone = 'muted',
  onSearchChange,
  invalid = false,
  id,
  noneLabel = 'None',
  noMatchesLabel = 'No matches',
  searchingLabel = 'Searching…',
  selectLabel = 'Select',
  closeLabel = 'Close',
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [highlight, setHighlight] = React.useState(0)
  const [isDesktop, setIsDesktop] = React.useState(true)
  const [mounted, setMounted] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const dropRef = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number } | null>(null)
  function place() {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width })
  }

  React.useEffect(() => {
    setMounted(true)
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const allOptions = React.useMemo(
    () => (clearable ? [{ value: '', label: emptyLabel ?? noneLabel }, ...options] : options),
    [clearable, emptyLabel, noneLabel, options],
  )
  const selected = options.find((o) => o.value === value)
  const showEmpty = clearable && value === '' && !!emptyLabel
  const display = selected?.label ?? (showEmpty ? emptyLabel : placeholder)
  const isPlaceholder = !selected && !showEmpty

  const showSearch = searchable ?? (allOptions.length > 7 || allOptions.some((o) => o.group))

  const filtered = React.useMemo(() => {
    if (remote) return allOptions
    const q = query.trim().toLowerCase()
    if (!q) return allOptions
    return allOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q),
    )
  }, [allOptions, query, remote])

  function firstEnabled(items: SelectOption[], start: number) {
    if (start >= 0 && start < items.length && !items[start]?.disabled) return start
    const fwd = items.findIndex((o) => !o.disabled)
    return fwd === -1 ? 0 : fwd
  }

  function openMenu() {
    if (disabled) return
    setQuery('')
    onSearchChange?.('')
    setHighlight(firstEnabled(allOptions, allOptions.findIndex((o) => o.value === value)))
    place()
    setOpen(true)
    setTimeout(() => searchRef.current?.focus(), 60)
  }
  function choose(v: string) {
    onChange(v)
    setOpen(false)
  }

  React.useEffect(() => {
    if (!open || !isDesktop) return
    function onDoc(e: MouseEvent) {
      const target = e.target as Node
      if (wrapRef.current?.contains(target) || dropRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, isDesktop])

  React.useEffect(() => {
    if (!open || !isDesktop) return
    place()
    const onMove = () => place()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, isDesktop])

  React.useEffect(() => {
    if (!open) return
    const nextEnabled = (from: number, dir: 1 | -1) => {
      let index = from
      while (true) {
        index += dir
        if (index < 0 || index >= filtered.length) return from
        if (!filtered[index]?.disabled) return index
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => nextEnabled(h, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => nextEnabled(h, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const o = filtered[highlight]
        if (o && !o.disabled) {
          onChange(o.value)
          setOpen(false)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    let restore: (() => void) | undefined
    if (!isDesktop) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      restore = () => {
        document.body.style.overflow = prev
      }
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      restore?.()
    }
  }, [filtered, highlight, isDesktop, onChange, open])

  const optionList = (
    <>
      <ul role="listbox" className="py-1">
        {filtered.length === 0 && !loading ? (
          <li role="option" aria-disabled="true" className="px-3 py-8 text-center text-sm text-fg-subtle">
            {noMatchesLabel}
          </li>
        ) : null}
        {filtered.map((o, i) => {
          const active = o.value === value
          const prevGroup = i > 0 ? filtered[i - 1]?.group : undefined
          const header = o.group && o.group !== prevGroup ? o.group : null
          return (
            <li key={o.value || `__opt-${i}`} role="presentation">
              {header ? (
                <div className="px-4 pb-1 pt-2.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase lg:px-3">
                  {header}
                </div>
              ) : null}
              <button
                type="button"
                role="option"
                aria-selected={active}
                disabled={o.disabled}
                onMouseEnter={() => !o.disabled && setHighlight(i)}
                onClick={() => !o.disabled && choose(o.value)}
                className={cn(
                  'flex h-12 w-full items-center gap-2.5 px-4 text-left text-[15px] transition-colors lg:h-9 lg:px-3 lg:text-sm',
                  o.disabled
                    ? 'cursor-not-allowed text-fg-subtle'
                    : i === highlight
                      ? 'bg-primary-subtle'
                      : 'active:bg-surface-hover',
                  !o.disabled && (active ? 'font-medium text-primary' : 'text-fg'),
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {o.label}
                  {o.hint ? <span className="ml-1.5 text-xs text-fg-subtle">{o.hint}</span> : null}
                </span>
                {active ? <Check size={17} className="shrink-0 text-primary" /> : null}
              </button>
            </li>
          )
        })}
      </ul>
      {loading || statusMessage ? (
        <div
          role={statusTone === 'error' ? 'alert' : 'status'}
          className={cn(
            'border-t border-border px-3 py-2 text-xs',
            statusTone === 'error' ? 'text-danger' : 'text-fg-muted',
          )}
        >
          {loading ? searchingLabel : statusMessage}
        </div>
      ) : null}
    </>
  )

  const searchBox = (largeText: boolean) => (
    <div className="relative px-3 pt-3">
      <Search size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-fg-subtle" />
      <input
        ref={searchRef}
        value={query}
        onChange={(e) => {
          const next = e.target.value
          setQuery(next)
          onSearchChange?.(next)
          setHighlight(0)
        }}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        aria-busy={loading || undefined}
        className={cn(
          'w-full rounded-lg border border-border bg-bg-subtle pl-9 pr-3 outline-none transition focus:border-primary focus:bg-surface focus:ring-2 focus:ring-ring/20',
          largeText ? 'h-11 text-base' : 'h-9 text-base sm:text-sm',
        )}
      />
    </div>
  )

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-left text-sm shadow-sm transition',
          'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25',
          disabled && 'cursor-not-allowed bg-bg-subtle opacity-70',
          open && 'border-primary ring-2 ring-ring/25',
          invalid && 'border-danger focus:border-danger focus:ring-danger/30',
          triggerClassName,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', isPlaceholder ? 'text-fg-subtle' : 'text-fg')}>
          {display}
        </span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')}
        />
      </button>

      {mounted && open && isDesktop && pos
        ? createPortal(
            <div
              ref={dropRef}
              data-ui-overlay
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: Math.max(pos.width, 208) }}
              className="z-[60] overflow-hidden rounded-xl border border-border bg-elevated shadow-lg"
            >
              {showSearch ? searchBox(false) : null}
              <div className={cn('max-h-64 overflow-y-auto', showSearch && 'mt-1')}>{optionList}</div>
            </div>,
            document.body,
          )
        : null}

      {mounted && !isDesktop
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <div data-ui-overlay className="fixed inset-0 z-[60]">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 bg-overlay/40 backdrop-blur-[2px]"
                    onClick={() => setOpen(false)}
                  />
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 34, stiffness: 340, mass: 0.8 }}
                    className="absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col rounded-t-2xl border-t border-border bg-surface shadow-lg"
                  >
                    <div className="flex items-center justify-center pt-2.5">
                      <span className="h-1.5 w-10 rounded-full bg-border-strong" />
                    </div>
                    <div className="flex items-center justify-between px-4 pb-1 pt-2">
                      <span className="text-base font-semibold text-fg">{sheetTitle ?? selectLabel}</span>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label={closeLabel}
                        className="rounded-md p-1.5 text-fg-muted hover:bg-surface-hover"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    {showSearch ? searchBox(true) : null}
                    <div className="mt-1 min-h-0 flex-1 overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                      {optionList}
                    </div>
                  </motion.div>
                </div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  )
}
