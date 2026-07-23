import * as React from 'react'
import { cn } from '@appkit/ui'

/** Report-only table primitives: ruled document typography without list chrome. */
export function ReportTable({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <div className="app-scroll w-full overflow-x-auto"><table className={cn('w-full border-collapse text-sm tabular-nums', className)} {...props} /></div>
}

export function ReportTableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-border-strong', className)} {...props} />
}

export function ReportTableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />
}

export function ReportTableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={className} {...props} />
}

export function ReportTableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('py-2 pr-4 text-left align-bottom text-xs font-semibold tracking-wide text-fg-muted uppercase last:pr-0', className)} {...props} />
}

export function ReportTableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('py-1 pr-4 align-top last:pr-0', className)} {...props} />
}

export const reportSubtotalRowClass = 'border-t border-border-strong'
export const reportTotalRowClass = 'border-t border-b-[3px] border-double border-border-strong'
