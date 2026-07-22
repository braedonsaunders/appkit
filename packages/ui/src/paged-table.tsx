'use client'

import * as React from 'react'
import { Button } from './button'
import { Input } from './input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table'

export interface PagedColumn<T> {
  key: string
  header: React.ReactNode
  align?: 'left' | 'right'
  cell: (row: T) => React.ReactNode
  /** Text used for client-side search matching. */
  search?: (row: T) => string
}

export interface PagedTableLabels {
  searchPlaceholder: string
  searchLabel: string
  showing: (from: number, to: number, total: number) => React.ReactNode
  prev: string
  next: string
  pageOf: (page: number, pages: number) => React.ReactNode
}

const DEFAULT_LABELS: PagedTableLabels = {
  searchPlaceholder: 'Search…',
  searchLabel: 'Search',
  showing: (from, to, total) => <>
    Showing <strong className="font-semibold text-fg">{from}</strong>–
    <strong className="font-semibold text-fg">{to}</strong> of{' '}
    <strong className="font-semibold text-fg">{total}</strong>
  </>,
  prev: 'Prev',
  next: 'Next',
  pageOf: (page, pages) => <>Page {page} of {pages}</>,
}

export interface PagedTableProps<T> {
  rows: T[]
  columns: PagedColumn<T>[]
  pageSize?: number
  searchable?: boolean
  empty: React.ReactNode
  rowKey: (row: T, index: number) => string
  rowClassName?: (row: T) => string | undefined
  labels?: Partial<PagedTableLabels>
}

/**
 * Client-side searched and paginated table for bounded data already loaded
 * into a page or drawer. The call surface matches the production reference;
 * only localized copy and semantic tokens are injected/generalized.
 */
export function PagedTable<T>({
  rows,
  columns,
  pageSize = 10,
  searchable = false,
  empty,
  rowKey,
  rowClassName,
  labels: labelOverrides,
}: PagedTableProps<T>) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const [query, setQuery] = React.useState('')
  const [page, setPage] = React.useState(0)

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return rows
    return rows.filter((row) => columns.some((column) =>
      column.search?.(row).toLocaleLowerCase().includes(normalized),
    ))
  }, [columns, query, rows])

  const boundedPageSize = Math.max(1, Math.trunc(pageSize))
  const pageCount = Math.max(1, Math.ceil(filtered.length / boundedPageSize))
  const clamped = Math.min(page, pageCount - 1)
  const start = clamped * boundedPageSize
  const visible = filtered.slice(start, start + boundedPageSize)

  if (rows.length === 0) return <>{empty}</>

  return <div className="space-y-3">
    {searchable ? <Input
      type="search"
      aria-label={labels.searchLabel}
      value={query}
      onChange={(event) => {
        setQuery(event.target.value)
        setPage(0)
      }}
      placeholder={labels.searchPlaceholder}
      className="max-w-xs"
    /> : null}
    <Table>
      <TableHeader>
        <TableRow noAnimate>{columns.map((column) => <TableHead
          key={column.key}
          align={column.align === 'right' ? 'right' : undefined}
          className={column.align === 'right' ? 'text-right' : undefined}
        >{column.header}</TableHead>)}</TableRow>
      </TableHeader>
      <TableBody>{visible.map((row, index) => <TableRow
        key={rowKey(row, start + index)}
        className={rowClassName?.(row)}
      >{columns.map((column) => <TableCell
        key={column.key}
        className={column.align === 'right' ? 'text-right tabular-nums' : undefined}
      >{column.cell(row)}</TableCell>)}</TableRow>)}</TableBody>
    </Table>
    {filtered.length > boundedPageSize ? <div className="flex items-center justify-between text-xs text-fg-muted">
      <span>{labels.showing(start + 1, Math.min(start + boundedPageSize, filtered.length), filtered.length)}</span>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" disabled={clamped === 0} onClick={() => setPage(clamped - 1)}>{labels.prev}</Button>
        <span className="tabular-nums">{labels.pageOf(clamped + 1, pageCount)}</span>
        <Button variant="outline" size="sm" disabled={clamped >= pageCount - 1} onClick={() => setPage(clamped + 1)}>{labels.next}</Button>
      </div>
    </div> : null}
  </div>
}
