'use client'

import * as React from 'react'
import { CornerDownLeft, Loader2, Search, X } from 'lucide-react'
import { Badge } from './badge'
import { NavIcon } from './sidebar-nav'
import { cn } from './utils'

export type GlobalSearchHit = {
  id: string
  type: string
  title: string
  subtitle?: string
  href: string
  iconKey?: string
  badge?: string
  meta?: string
}

export type GlobalSearchGroup = { id: string; label: string; hits: GlobalSearchHit[] }
export type GlobalSearchResult = { groups: GlobalSearchGroup[]; total: number }
export type GlobalSearchLabels = {
  placeholder: string
  ariaLabel: string
  clear: string
  searching: string
  noMatches: (query: string) => string
  navigate: string
  open: string
  close: string
  resultCount: (count: number) => string
}

const DEFAULT_LABELS: GlobalSearchLabels = {
  placeholder: 'Search…',
  ariaLabel: 'Search the application',
  clear: 'Clear search',
  searching: 'Searching…',
  noMatches: (query) => `No matches for “${query}”`,
  navigate: 'navigate',
  open: 'open',
  close: 'close',
  resultCount: (count) => `${count} result${count === 1 ? '' : 's'}`,
}

function Highlight({ text, query }: { text: string; query: string }) {
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (!query || index < 0) return text
  return <>{text.slice(0, index)}<mark className="bg-transparent font-semibold text-primary">{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>
}

/** Production sibling search interaction with app-owned querying and navigation. */
export function GlobalSearch({
  search,
  onNavigate,
  className,
  labels = DEFAULT_LABELS,
  minimumQueryLength = 2,
  debounceMs = 180,
}: {
  search: (query: string, signal: AbortSignal) => Promise<GlobalSearchResult>
  onNavigate: (hit: GlobalSearchHit) => void
  className?: string
  labels?: GlobalSearchLabels
  minimumQueryLength?: number
  debounceMs?: number
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const resultsId = React.useId()
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState<GlobalSearchResult | null>(null)
  const [active, setActive] = React.useState(0)
  const hits = React.useMemo(() => result?.groups.flatMap((group) => group.hits) ?? [], [result])

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  React.useEffect(() => {
    const term = query.trim()
    if (term.length < minimumQueryLength) {
      setResult(null)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    const timeout = window.setTimeout(async () => {
      try {
        const next = await search(term, controller.signal)
        setResult(next)
        setActive(0)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResult({ groups: [], total: 0 })
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, debounceMs)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [debounceMs, minimumQueryLength, query, search])

  const go = React.useCallback((hit: GlobalSearchHit | undefined) => {
    if (!hit) return
    setOpen(false)
    setQuery('')
    setResult(null)
    inputRef.current?.blur()
    onNavigate(hit)
  }, [onNavigate])

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return }
    if (!hits.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => (value + 1) % hits.length) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => (value - 1 + hits.length) % hits.length) }
    else if (event.key === 'Enter') { event.preventDefault(); go(hits[active]) }
  }

  const showPanel = open && query.trim().length >= minimumQueryLength
  let itemIndex = -1
  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" />
        <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown} placeholder={labels.placeholder} aria-label={labels.ariaLabel} role="combobox" aria-expanded={showPanel} aria-controls={resultsId} className="h-9 w-full rounded-lg border border-border bg-bg-subtle pr-16 pl-9 text-sm text-fg transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-primary focus:bg-surface focus:ring-2 focus:ring-ring/20 focus:outline-none" />
        <div className="absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center gap-1">
          {loading ? <Loader2 size={14} className="animate-spin text-fg-subtle" /> : query ? <button type="button" onClick={() => { setQuery(''); setResult(null); inputRef.current?.focus() }} className="rounded p-0.5 text-fg-subtle hover:text-fg" aria-label={labels.clear}><X size={14} /></button> : <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 font-sans text-[10px] font-medium text-fg-subtle sm:inline">⌘K</kbd>}
        </div>
      </div>
      {showPanel ? (
        <div id={resultsId} className="absolute top-[calc(100%+6px)] left-0 z-50 max-h-[70vh] w-full min-w-88 overflow-y-auto rounded-xl border border-border bg-elevated p-1.5 shadow-lg" role="listbox">
          {result && result.total > 0 ? <>
            {result.groups.map((group) => <div key={group.id} className="mb-1 last:mb-0"><div className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">{group.label}</div>{group.hits.map((hit) => { itemIndex += 1; const index = itemIndex; const selected = index === active; return <button key={`${hit.type}-${hit.id}`} type="button" role="option" aria-selected={selected} onMouseEnter={() => setActive(index)} onMouseDown={(event) => { event.preventDefault(); go(hit) }} className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors', selected ? 'bg-primary-subtle' : 'hover:bg-surface-hover')}><span className={cn('grid size-7 shrink-0 place-items-center rounded-md', selected ? 'bg-surface text-primary' : 'bg-bg-subtle text-fg-muted')}>{hit.iconKey ? <NavIcon iconKey={hit.iconKey} size={15} /> : <Search size={15} />}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm text-fg"><Highlight text={hit.title} query={query.trim()} /></span>{hit.badge ? <Badge variant="secondary" className="text-[10px]">{hit.badge}</Badge> : null}</span>{hit.subtitle ? <span className="block truncate text-xs text-fg-muted">{hit.subtitle}</span> : null}</span>{hit.meta ? <span className="shrink-0 font-mono text-xs tabular-nums text-fg-muted">{hit.meta}</span> : null}{selected ? <CornerDownLeft size={13} className="shrink-0 text-primary" /> : null}</button>})}</div>)}
            <div className="mt-1 flex items-center justify-between border-t border-border-subtle px-2 py-1.5 text-[11px] text-fg-subtle"><span><kbd className="font-sans">↑↓</kbd> {labels.navigate}&nbsp;&nbsp;<kbd className="font-sans">↵</kbd> {labels.open}&nbsp;&nbsp;<kbd className="font-sans">esc</kbd> {labels.close}</span><span>{labels.resultCount(result.total)}</span></div>
          </> : loading ? <div className="flex items-center gap-2 px-3 py-6 text-sm text-fg-subtle"><Loader2 size={15} className="animate-spin" />{labels.searching}</div> : <div className="px-3 py-6 text-center text-sm text-fg-subtle">{labels.noMatches(query.trim())}</div>}
        </div>
      ) : null}
    </div>
  )
}
