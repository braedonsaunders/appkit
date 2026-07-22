'use client'

import { Button, cn } from '@appkit/ui'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import type { ListResult } from './types'

export function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-medium hover:text-fg">
      {label}
      {active ? direction === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} /> : null}
    </button>
  )
}

export function ServicePagination({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number
  perPage: number
  total: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  const first = total === 0 ? 0 : (page - 1) * perPage + 1
  const last = Math.min(total, page * perPage)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted">
      <span>{first}–{last} of {total}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} />Previous</Button>
        <span className={cn('min-w-20 text-center tabular-nums', pages === 1 && 'text-fg-subtle')}>Page {Math.min(page, pages)} of {pages}</span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next<ChevronRight size={14} /></Button>
      </div>
    </div>
  )
}

/** Load a bounded service catalogue across every page for pickers and bulk tools. */
export async function collectAll<T>(load: (page: number, perPage: number) => Promise<ListResult<T>>): Promise<T[]> {
  const rows: T[] = []
  for (let page = 1; page <= 10_000; page += 1) {
    const result = await load(page, 100)
    rows.push(...result.rows)
    if (result.rows.length === 0 || rows.length >= result.total) return rows
  }
  throw new Error('The IAM catalogue exceeded the supported pagination boundary.')
}
