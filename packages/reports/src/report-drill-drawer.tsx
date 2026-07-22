'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Drawer, Skeleton, cn } from '@appkit/ui'
import {
  ReportTable,
  ReportTableBody,
  ReportTableCell,
  ReportTableHead,
  ReportTableHeader,
  ReportTableRow,
} from './report-table'
import type { ReportDrillLoader, ReportDrillRecord, ReportDrillResponse } from './viewer-types'

export type ReportDrillDrawerText = {
  title: string
  loadFailed: string
  empty: string
  previous: string
  next: string
  page: (current: number, total: number) => string
}

const DEFAULT_TEXT: ReportDrillDrawerText = {
  title: 'Report details',
  loadFailed: 'The supporting records could not be loaded.',
  empty: 'No supporting records.',
  previous: 'Previous',
  next: 'Next',
  page: (current, total) => `Page ${current} of ${total}`,
}

/** Result rows over the report; applications can open their native record surface from a linked cell. */
export function ReportDrillDrawer<TDrillTarget, TRecord extends ReportDrillRecord = ReportDrillRecord>({
  target,
  load,
  onClose,
  onOpenRecord,
  text: textOverrides,
}: {
  target: TDrillTarget | null
  load: ReportDrillLoader<TDrillTarget, TRecord>
  onClose: () => void
  onOpenRecord?: (record: TRecord) => void
  text?: Partial<ReportDrillDrawerText>
}) {
  const text = { ...DEFAULT_TEXT, ...textOverrides }
  const [page, setPage] = React.useState(1)
  const [data, setData] = React.useState<ReportDrillResponse<TRecord> | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => { setPage(1) }, [target])
  React.useEffect(() => {
    if (target === null) { setData(null); setError(null); return }
    const controller = new AbortController()
    setData(null)
    setError(null)
    load(target, page, controller.signal)
      .then(setData)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : text.loadFailed)
      })
    return () => controller.abort()
  }, [load, page, target, text.loadFailed])

  const pages = data ? Math.max(1, Math.ceil(data.total / Math.max(1, data.perPage))) : 1
  return <Drawer open={target !== null} onClose={onClose} size="2xl" title={data?.title ?? text.title} description={data?.description}>
    {!data && !error ? <div className="space-y-3">
      <Skeleton className="h-16 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" />
    </div> : error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</div> : data ? <div className="space-y-5">
      {data.summary.length ? <div className="grid grid-flow-col auto-cols-fr divide-x divide-border border-y border-border py-3">{data.summary.map((item, index) => <div key={item.key ?? `${item.label}-${index}`} className="min-w-0 px-3 text-center"><div className="truncate text-xs text-fg-muted">{item.label}</div><div className="truncate font-semibold tabular-nums">{item.value}</div></div>)}</div> : null}
      {data.rows.length ? <ReportTable><ReportTableHeader><ReportTableRow>{data.columns.map((column, index) => <ReportTableHead key={column.key ?? index} className={cn(column.align === 'right' && 'text-right', column.align === 'center' && 'text-center')}>{column.label}</ReportTableHead>)}</ReportTableRow></ReportTableHeader><ReportTableBody>
        {data.rows.map((row) => <ReportTableRow key={row.key}>{row.cells.map((cell, index) => {
          const column = data.columns[index]
          const content = cell == null ? '' : String(cell)
          return <ReportTableCell key={index} className={cn(column?.align === 'right' && 'text-right tabular-nums', column?.align === 'center' && 'text-center')}>
            {row.record && data.linkColumn === index && onOpenRecord ? <button type="button" className="font-medium text-primary hover:underline" onClick={() => onOpenRecord(row.record!)}>{content}</button> : content}
          </ReportTableCell>
        })}</ReportTableRow>)}
      </ReportTableBody></ReportTable> : <p className="py-10 text-center text-sm text-fg-muted">{text.empty}</p>}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-fg-muted">{text.page(data.page, pages)} · {data.total.toLocaleString()} rows</span>
        <div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={14} />{text.previous}</Button><Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>{text.next}<ChevronRight size={14} /></Button></div>
      </div>
    </div> : null}
  </Drawer>
}
