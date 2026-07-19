'use client'

import * as React from 'react'
import { cn } from './utils'

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  ),
)
Table.displayName = 'Table'

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      'sticky top-0 z-10 bg-bg-subtle/95 backdrop-blur-sm [&_tr]:border-b [&_tr]:border-border',
      className,
    )}
    {...props}
  />
))
TableHeader.displayName = 'TableHeader'

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
))
TableBody.displayName = 'TableBody'

export type TableRowProps = React.HTMLAttributes<HTMLTableRowElement> & {
  /** Disable the staggered entrance (e.g. header rows). */
  noAnimate?: boolean
}

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, noAnimate, ...props }, ref) => (
    // Staggered entrance is pure CSS (`.appkit-row` + nth-child delay in
    // tokens.css) — no JS index, so it's StrictMode- and hydration-safe, and
    // visible-by-default (@starting-style) so it never strands in a hidden tab.
    <tr
      ref={ref}
      className={cn(
        'border-b border-border-subtle transition-colors duration-150 hover:bg-surface-hover data-[state=selected]:bg-bg-subtle',
        !noAnimate && 'appkit-row',
        className,
      )}
      {...props}
    />
  ),
)
TableRow.displayName = 'TableRow'

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-10 px-3 text-left align-middle text-xs font-medium tracking-wide text-fg-muted uppercase',
      className,
    )}
    {...props}
  />
))
TableHead.displayName = 'TableHead'

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('px-3 py-3 align-middle', className)} {...props} />
))
TableCell.displayName = 'TableCell'
