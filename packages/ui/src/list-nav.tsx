'use client'

import * as React from 'react'

/**
 * Router bridge for the URL-driven list kit (SearchInput, FilterChips,
 * SortableTh, Pagination). The query string is the canonical list state, so
 * these components navigate. An app wires its client router once:
 *
 *   <ListNavProvider value={{ pathname, search, replace: (h) => router.replace(h, { scroll: false }), push: (h) => router.push(h, { scroll: false }) }}>
 *
 * Without a provider the components fall back to full navigations via
 * window.location — correct everywhere, just not soft.
 */
export type ListNav = {
  pathname: string
  /** Current query string WITHOUT the leading `?`. */
  search: string
  replace: (href: string) => void
  push: (href: string) => void
}

const ListNavContext = React.createContext<ListNav | null>(null)

export function ListNavProvider({ value, children }: { value: ListNav; children: React.ReactNode }) {
  return <ListNavContext.Provider value={value}>{children}</ListNavContext.Provider>
}

/** The wired router, or a window-backed fallback (null during SSR). */
export function useListNav(): ListNav | null {
  const wired = React.useContext(ListNavContext)
  const [fallback, setFallback] = React.useState<ListNav | null>(null)
  React.useEffect(() => {
    if (wired) return
    const make = (): ListNav => ({
      pathname: window.location.pathname,
      search: window.location.search.replace(/^\?/, ''),
      replace: (href) => window.location.replace(href),
      push: (href) => window.location.assign(href),
    })
    setFallback(make())
    const onPop = () => setFallback(make())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [wired])
  return wired ?? fallback
}

/** Anchor click handler: soft-navigate through the wired router when the click
 *  is a plain left-click (no modifiers), else let the browser handle it. */
export function useListNavClick(href: string): (e: React.MouseEvent<HTMLAnchorElement>) => void {
  const nav = React.useContext(ListNavContext)
  return React.useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!nav) return
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      nav.push(href)
    },
    [nav, href],
  )
}
