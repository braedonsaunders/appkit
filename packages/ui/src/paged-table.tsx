'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
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
import { cn } from './utils'

/** Comparable value a column exposes for client-side ordering. */
export type PagedSortValue = string | number | Date | null | undefined

export interface PagedColumn<T> {
  key: string
  header: React.ReactNode
  align?: 'left' | 'right'
  cell: (row: T) => React.ReactNode
  /** Text used for client-side search matching. */
  search?: (row: T) => string
  /**
   * Comparable value used for client-side ordering. Supplying it turns the
   * column header into a sort control; omit it for columns that can't be
   * ordered (actions, rendered composites without a natural key).
   */
  sortValue?: (row: T) => PagedSortValue
}

export interface PagedTableSort {
  key: string
  dir: 'asc' | 'desc'
}

export interface PagedTableLabels {
  searchPlaceholder: string
  searchLabel: string
  showing: (from: number, to: number, total: number) => React.ReactNode
  prev: string
  next: string
  pageOf: (page: number, pages: number) => React.ReactNode
  /** Shown in place of rows when a search matches nothing. */
  noResults: (query: string) => React.ReactNode
  /** Accessible name for a column's sort control. */
  sortBy: (column: string) => string
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
  noResults: (query) => <>No matches for “{query}”</>,
  sortBy: (column) => `Sort by ${column}`,
}

export interface PagedTableProps<T> {
  rows: T[]
  columns: PagedColumn<T>[]
  pageSize?: number
  searchable?: boolean
  empty: React.ReactNode
  rowKey: (row: T, index: number) => string
  rowClassName?: (row: T) => string | undefined
  /** Initial ordering; the header controls take over from there. */
  defaultSort?: PagedTableSort
  /** Row activation — makes rows clickable (open a drawer, navigate, select). */
  onRowClick?: (row: T) => void
  labels?: Partial<PagedTableLabels>
}

/** Blanks order last ascending, so a sorted column leads with real values. */
function compareValues(a: PagedSortValue, b: PagedSortValue): number {
  const aBlank = a == null || a === ''
  const bBlank = b == null || b === ''
  if (aBlank || bBlank) return aBlank && bBlank ? 0 : aBlank ? 1 : -1
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Client-side searched, sorted, and paginated table for bounded data already
 * loaded into a page or drawer. The call surface matches the production
 * reference; only localized copy and semantic tokens are injected/generalized.
 */
export function PagedTable<T>({
  rows,
  columns,
  pageSize = 10,
  searchable = false,
  empty,
  rowKey,
  rowClassName,
  defaultSort,
  onRowClick,
  labels: labelOverrides,
}: PagedTableProps<T>) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const [query, setQuery] = React.useState('')
  const [page, setPage] = React.useState(0)
  const [sort, setSort] = React.useState<PagedTableSort | null>(defaultSort ?? null)

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return rows
    return rows.filter((row) => columns.some((column) =>
      column.search?.(row).toLocaleLowerCase().includes(normalized),
    ))
  }, [columns, query, rows])

  const ordered = React.useMemo(() => {
    const read = sort ? columns.find((column) => column.key === sort.key)?.sortValue : undefined
    if (!read || !sort) return filtered
    const direction = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => compareValues(read(a), read(b)) * direction)
  }, [columns, filtered, sort])

  const boundedPageSize = Math.max(1, Math.trunc(pageSize))
  const pageCount = Math.max(1, Math.ceil(ordered.length / boundedPageSize))
  const clamped = Math.min(page, pageCount - 1)
  const start = clamped * boundedPageSize
  const visible = ordered.slice(start, start + boundedPageSize)

  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    )
    setPage(0)
  }

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
        <TableRow noAnimate>{columns.map((column) => {
          const active = sort?.key === column.key
          const alignRight = column.align === 'right'
          return <TableHead
            key={column.key}
            align={alignRight ? 'right' : undefined}
            className={alignRight ? 'text-right' : undefined}
            aria-sort={column.sortValue ? (active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
          >{column.sortValue ? <button
            type="button"
            onClick={() => toggleSort(column.key)}
            aria-label={typeof column.header === 'string' ? labels.sortBy(column.header) : undefined}
            className={cn(
              'inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-fg',
              alignRight && 'flex-row-reverse',
              active && 'text-fg',
            )}
          >
            {column.header}
            {active ? (sort!.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : null}
          </button> : column.header}</TableHead>
        })}</TableRow>
      </TableHeader>
      <TableBody>{visible.length === 0 ? <TableRow>
        <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-fg-muted">
          {labels.noResults(query.trim())}
        </TableCell>
      </TableRow> : visible.map((row, index) => <TableRow
        key={rowKey(row, start + index)}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
      >{columns.map((column) => <TableCell
        key={column.key}
        className={column.align === 'right' ? 'text-right tabular-nums' : undefined}
      >{column.cell(row)}</TableCell>)}</TableRow>)}</TableBody>
    </Table>
    {ordered.length > boundedPageSize ? <div className="flex items-center justify-between text-xs text-fg-muted">
      <span>{labels.showing(start + 1, Math.min(start + boundedPageSize, ordered.length), ordered.length)}</span>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" disabled={clamped === 0} onClick={() => setPage(clamped - 1)}>{labels.prev}</Button>
        <span className="tabular-nums">{labels.pageOf(clamped + 1, pageCount)}</span>
        <Button variant="outline" size="sm" disabled={clamped >= pageCount - 1} onClick={() => setPage(clamped + 1)}>{labels.next}</Button>
      </div>
    </div> : null}
  </div>
}
