'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { Input } from './input'
import { useListNav } from './list-nav'

/**
 * URL-driven search box: debounced 250ms, writes `?q=` (configurable) and
 * resets the page param. Keeps focus by replacing (not pushing) through the
 * wired ListNav router. Localized copy is supplied through props.
 */
export function SearchInput({
  placeholder = 'Search…',
  searchLabel = 'Search',
  clearLabel = 'Clear search',
  paramKey = 'q',
  pageParamKey = 'page',
  className,
}: {
  placeholder?: string
  searchLabel?: string
  clearLabel?: string
  paramKey?: string
  /** Pagination param to reset when the search changes (sub-tables use prefixed params). */
  pageParamKey?: string
  className?: string
}) {
  const nav = useListNav()
  const urlValue = React.useMemo(
    () => new URLSearchParams(nav?.search ?? '').get(paramKey) ?? '',
    [nav?.search, paramKey],
  )
  const [edit, setEdit] = React.useState({ source: urlValue, value: urlValue })
  const value = edit.source === urlValue ? edit.value : urlValue
  const [, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!nav) return
    const handle = setTimeout(() => {
      // No-op when the input already matches the URL (mount, external URL
      // change) — navigating anyway would strip the page param and reset
      // deep-linked pagination back to page 1.
      const current = new URLSearchParams(nav.search).get(paramKey) ?? ''
      if (value === current) return
      const next = new URLSearchParams(nav.search)
      if (value) next.set(paramKey, value)
      else next.delete(paramKey)
      next.delete(pageParamKey)
      const qs = next.toString()
      // Transition keeps the current page (and this input's focus) mounted
      // while the next server render streams in.
      startTransition(() => {
        nav.replace(qs ? `${nav.pathname}?${qs}` : nav.pathname)
      })
    }, 250)
    return () => clearTimeout(handle)
  }, [nav, pageParamKey, paramKey, value])

  return (
    <div className={className ?? 'relative w-full sm:w-72'}>
      <Search className="pointer-events-none absolute left-2.5 top-2 text-fg-subtle" size={16} />
      <Input
        type="search"
        aria-label={searchLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setEdit({ source: urlValue, value: e.target.value })}
        // Hide the browser's native search clear (×) — we render our own.
        className="h-8 pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => setEdit({ source: urlValue, value: '' })}
          className="absolute right-2.5 top-2 text-fg-subtle hover:text-fg-muted"
        >
          <X size={16} />
        </button>
      ) : null}
    </div>
  )
}
