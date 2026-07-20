'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { TableHead } from './table'
import { mergeHref, type ListSearchParams } from './list-params'
import { useListNavClick } from './list-nav'
import { cn } from './utils'

type SortLinkProps = {
  basePath: string
  currentParams: ListSearchParams
  column: string
  active: boolean
  dir: 'asc' | 'desc'
  align?: 'left' | 'right'
  sortParamKey?: string
  dirParamKey?: string
  pageParamKey?: string
  children: React.ReactNode
}

/**
 * The clickable header label: column name + sort caret, linking to the toggled
 * sort URL. Clicking an inactive column sorts ascending; clicking the active
 * column flips direction. Page resets to 1. (Copied from openbooks sortable-th.)
 */
function SortLink({
  basePath,
  currentParams,
  column,
  active,
  dir,
  align = 'left',
  sortParamKey = 'sort',
  dirParamKey = 'dir',
  pageParamKey = 'page',
  children,
}: SortLinkProps) {
  const nextDir: 'asc' | 'desc' = active && dir === 'asc' ? 'desc' : 'asc'
  const href = mergeHref(basePath, currentParams, {
    [sortParamKey]: column,
    [dirParamKey]: nextDir,
    [pageParamKey]: 1,
  })
  const navClick = useListNavClick(href)
  return (
    <a
      href={href}
      onClick={navClick}
      className={cn('inline-flex items-center gap-1.5 hover:text-fg', align === 'right' && 'flex-row-reverse')}
    >
      {children}
      {active ? (
        dir === 'asc' ? (
          <ArrowUp size={12} className="text-fg" />
        ) : (
          <ArrowDown size={12} className="text-fg" />
        )
      ) : (
        <ArrowUpDown size={12} className="text-fg-subtle/60" />
      )}
    </a>
  )
}

/** Sortable header for tables built from the <Table> primitives. */
export function SortableTh({ className, ...props }: SortLinkProps & { className?: string }) {
  return (
    <TableHead className={className}>
      <SortLink {...props} />
    </TableHead>
  )
}

/**
 * Sortable header for raw `<table>` lists — renders a plain
 * `<th className="px-3 py-2">` and derives `active` from the current `sort`.
 */
export function SortTh({
  sort,
  className,
  ...props
}: Omit<SortLinkProps, 'active'> & { sort: string; className?: string }) {
  return (
    <th className={cn('px-3 py-2', className)}>
      <SortLink {...props} active={sort === props.column} />
    </th>
  )
}
