'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Badge, type BadgeProps } from './badge'
import { Button } from './button'
import { EmptyState } from './empty-state'
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

export type RecordCellKind = 'text' | 'amount' | 'status' | 'reference' | 'actions' | 'custom'

export type RecordColumn<Row> = {
  key: string
  label: string
  kind?: RecordCellKind
  align?: 'left' | 'right'
  sortable?: boolean
  width?: number | string
  /** Custom / override renderer. */
  render?: (row: Row) => React.ReactNode
  /** For `reference` cells — the destination href. */
  href?: (row: Row) => string
  /** For `amount`/`text` cells — format the raw value. */
  format?: (value: unknown, row: Row) => React.ReactNode
  /** For `status` cells — map a value to a Badge variant. */
  statusVariant?: (value: string) => BadgeProps['variant']
}

export type RecordListLink = (props: {
  href: string
  children: React.ReactNode
  className: string
}) => React.ReactNode

export type RecordListProps<Row> = {
  columns: RecordColumn<Row>[]
  rows: Row[]
  getRowId: (row: Row) => string
  search?: { value: string; onChange: (v: string) => void; placeholder?: string }
  /** Filter chips or other toolbar-left content. */
  filters?: React.ReactNode
  /** Toolbar-right content (e.g. a saved-views switcher). */
  toolbarActions?: React.ReactNode
  sort?: { key: string; dir: 'asc' | 'desc' }
  onSortChange?: (key: string) => void
  pagination?: {
    page: number
    perPage: number
    total: number
    onPageChange: (page: number) => void
  }
  empty?: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }
  /** Supply an app router Link for reference cells (falls back to <a>). */
  linkRender?: RecordListLink
  onRowClick?: (row: Row) => void
}

export function RecordList<Row>({
  columns,
  rows,
  getRowId,
  search,
  filters,
  toolbarActions,
  sort,
  onSortChange,
  pagination,
  empty,
  linkRender,
  onRowClick,
}: RecordListProps<Row>) {
  const renderLink: RecordListLink =
    linkRender ??
    (({ href, children, className }) => (
      <a href={href} className={className}>
        {children}
      </a>
    ))

  const cell = (row: Row, c: RecordColumn<Row>) => {
    const v = (row as Record<string, unknown>)[c.key]
    const emptyText = <span className="text-fg-subtle">—</span>
    if (c.render && c.kind !== 'actions')
      return <TableCell key={c.key}>{c.render(row)}</TableCell>
    switch (c.kind) {
      case 'reference':
        return (
          <TableCell key={c.key} className="font-medium">
            {c.href && v != null && v !== ''
              ? renderLink({
                  href: c.href(row),
                  className: 'text-primary hover:underline',
                  children: String(v),
                })
              : emptyText}
          </TableCell>
        )
      case 'amount':
        return (
          <TableCell key={c.key} className="text-right tabular-nums">
            {v == null || v === '' ? emptyText : (c.format ? c.format(v, row) : String(v))}
          </TableCell>
        )
      case 'status':
        return (
          <TableCell key={c.key}>
            <Badge variant={c.statusVariant?.(String(v)) ?? 'secondary'}>{String(v)}</Badge>
          </TableCell>
        )
      case 'actions':
        return (
          <TableCell key={c.key} className="w-px whitespace-nowrap px-2 text-right">
            {c.render ? c.render(row) : null}
          </TableCell>
        )
      default:
        return (
          <TableCell key={c.key} className={cn(c.align === 'right' && 'text-right')}>
            {v == null || v === '' ? emptyText : c.format ? c.format(v, row) : String(v)}
          </TableCell>
        )
    }
  }

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.perPage)) : 1
  const from = pagination ? (pagination.page - 1) * pagination.perPage + 1 : 0
  const to = pagination ? Math.min(pagination.page * pagination.perPage, pagination.total) : 0

  return (
    <div className="space-y-3">
      {(search || filters || toolbarActions) ? (
        <div className="flex flex-wrap items-center gap-2">
          {search ? (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? 'Search…'}
                className="pl-9"
              />
            </div>
          ) : null}
          {filters}
          <div className="ml-auto flex items-center gap-2">{toolbarActions}</div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={empty?.icon}
          title={empty?.title ?? 'Nothing here yet'}
          description={empty?.description}
          action={empty?.action}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow noAnimate>
                {columns.map((c) => {
                  const active = sort?.key === c.key
                  const alignRight = c.align === 'right' || c.kind === 'amount'
                  return (
                    <TableHead
                      key={c.key}
                      style={c.width ? { width: c.width } : undefined}
                      className={cn(alignRight && 'text-right', c.kind === 'actions' && 'text-right')}
                    >
                      {c.sortable && onSortChange ? (
                        <button
                          type="button"
                          onClick={() => onSortChange(c.key)}
                          className={cn(
                            'inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-fg',
                            alignRight && 'flex-row-reverse',
                            active && 'text-fg',
                          )}
                        >
                          {c.label}
                          {active ? (
                            sort!.dir === 'asc' ? (
                              <ArrowUp className="size-3" />
                            ) : (
                              <ArrowDown className="size-3" />
                            )
                          ) : null}
                        </button>
                      ) : (
                        c.label
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {columns.map((c) => cell(row, c))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pagination && pagination.total > pagination.perPage ? (
            <div className="flex items-center justify-between text-sm text-fg-muted">
              <span>
                {from}–{to} of {pagination.total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => pagination.onPageChange(pagination.page - 1)}
                >
                  <ChevronLeft className="size-4" /> Prev
                </Button>
                <span className="tabular-nums">
                  {pagination.page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= totalPages}
                  onClick={() => pagination.onPageChange(pagination.page + 1)}
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
