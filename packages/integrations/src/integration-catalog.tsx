'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowUpRight,
  Building2,
  Check,
  Database,
  FileSpreadsheet,
  Plug,
  PlugZap,
  Plus,
  Search,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { Button, Input, cn } from '@appkit/ui'

export type IntegrationDirection = 'in' | 'out'
export type IntegrationCatalogItem = {
  key: string
  addValue: string
  name: string
  description: string
  direction: IntegrationDirection
  iconKey: string
  detail: string
  added: boolean
  addedHref?: string
}

export type IntegrationLinkRender = (props: {
  href: string
  className?: string
  children: ReactNode
}) => ReactNode

const ICONS: Record<string, LucideIcon> = {
  database: Database,
  'building-2': Building2,
  'file-spreadsheet': FileSpreadsheet,
  'plug-zap': PlugZap,
  upload: Upload,
}

type Filter = 'all' | IntegrationDirection

export function IntegrationCatalog({
  items,
  onAdd,
  linkRender,
}: {
  items: readonly IntegrationCatalogItem[]
  onAdd: (item: IntegrationCatalogItem) => void | Promise<void>
  linkRender?: IntegrationLinkRender
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return items.filter(
      (item) =>
        (filter === 'all' || item.direction === filter) &&
        (!term ||
          `${item.name} ${item.description} ${item.detail}`
            .toLowerCase()
            .includes(term)),
    )
  }, [filter, items, query])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-muted"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search integrations"
            className="pl-8"
            aria-label="Search integrations"
          />
        </div>
        <DirectionFilter value={filter} onChange={setFilter} />
      </div>
      {!filtered.length ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-fg-muted">
          No integrations match{query.trim() ? ` “${query.trim()}”` : ''}.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <CatalogCard
              key={item.key}
              item={item}
              onAdd={onAdd}
              linkRender={linkRender}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DirectionFilter({
  value,
  onChange,
}: {
  value: Filter
  onChange: (value: Filter) => void
}) {
  const options: [Filter, string][] = [
    ['all', 'All'],
    ['in', 'Sync in'],
    ['out', 'Push out'],
  ]
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-hover p-0.5 text-sm">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            'rounded-md px-3 py-1 font-medium transition',
            value === option
              ? 'bg-surface text-fg shadow-sm'
              : 'text-fg-muted hover:text-fg',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function CatalogCard({
  item,
  onAdd,
  linkRender,
}: {
  item: IntegrationCatalogItem
  onAdd: (item: IntegrationCatalogItem) => void | Promise<void>
  linkRender?: IntegrationLinkRender
}) {
  const Icon = ICONS[item.iconKey] ?? Plug
  const open = item.addedHref ? (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
      <Check size={14} /> Added <ArrowUpRight size={13} />
    </span>
  ) : null
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-4 transition hover:border-primary/40 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-hover text-fg-muted ring-1 ring-border-subtle">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-fg">{item.name}</p>
          <div className="mt-0.5">
            <DirectionPill direction={item.direction} />
          </div>
        </div>
      </div>
      <p className="mt-2.5 line-clamp-2 text-xs text-fg-muted">
        {item.description}
      </p>
      <p className="mt-auto pt-2 text-[11px] text-fg-subtle">{item.detail}</p>
      <div className="mt-3 flex justify-end border-t border-border-subtle pt-3">
        {item.added && item.addedHref && open ? (
          linkRender ? (
            linkRender({
              href: item.addedHref,
              className: 'inline-flex items-center',
              children: open,
            })
          ) : (
            <a href={item.addedHref}>{open}</a>
          )
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void onAdd(item)}
          >
            <Plus size={14} /> Add
          </Button>
        )}
      </div>
    </div>
  )
}

export function DirectionPill({
  direction,
}: {
  direction: IntegrationDirection
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
        direction === 'in'
          ? 'bg-primary-subtle text-primary'
          : 'bg-warning-subtle text-warning',
      )}
    >
      {direction === 'in' ? 'Sync in' : 'Push out'}
    </span>
  )
}
