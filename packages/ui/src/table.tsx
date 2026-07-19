'use client'

import * as React from 'react'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { cn } from './utils'

// TableBody hands each descendant TableRow a monotonic index so rows can
// stagger their entrance; the delay clamps so long tables don't pause forever.
type RowIndexContextValue = { next: () => number }
const RowIndexContext = React.createContext<RowIndexContextValue | null>(null)

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
>(({ className, children, ...props }, ref) => {
  const counterRef = React.useRef(0)
  counterRef.current = 0
  const value = React.useMemo<RowIndexContextValue>(
    () => ({
      next: () => {
        const i = counterRef.current
        counterRef.current += 1
        return i
      },
    }),
    [],
  )
  return (
    <RowIndexContext.Provider value={value}>
      <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props}>
        {children}
      </tbody>
    </RowIndexContext.Provider>
  )
})
TableBody.displayName = 'TableBody'

export type TableRowProps = HTMLMotionProps<'tr'> & { noAnimate?: boolean }

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, noAnimate, ...props }, ref) => {
    const ctx = React.useContext(RowIndexContext)
    const reduce = useReducedMotion()
    const [index] = React.useState(() => (ctx ? ctx.next() : 0))
    const delay = Math.min(index, 12) * 0.02
    const skip = noAnimate || reduce || !ctx
    return (
      <motion.tr
        ref={ref}
        initial={skip ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, delay, ease: [0.22, 0.61, 0.36, 1] }}
        className={cn(
          'border-b border-border-subtle transition-colors duration-150 hover:bg-surface-hover data-[state=selected]:bg-bg-subtle',
          className,
        )}
        {...props}
      />
    )
  },
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
