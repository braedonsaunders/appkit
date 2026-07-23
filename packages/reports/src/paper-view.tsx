'use client'

import * as React from 'react'
import { cn } from '@appkit/ui'
import { ReportPaper } from './report-paper'
import {
  ReportTable,
  ReportTableBody,
  ReportTableCell,
  ReportTableHead,
  ReportTableHeader,
  ReportTableRow,
  reportTotalRowClass,
} from './report-table'
import { reportPaperSummary, type ReportPaperCell, type ReportPaperData } from './viewer-types'

function isNumericCell(value: ReportPaperCell): boolean {
  if (typeof value === 'number') return true
  if (typeof value !== 'string') return false
  return /^-?[$(]?-?[\d,]+(\.\d+)?\)?%?$/.test(value.trim())
}

function formatMoney(value: number, currency: string, locale?: string): string {
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
  }
  const formatted = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value < 0 ? `(${currency}${formatted})` : `${currency}${formatted}`
}

function formatCell(value: ReportPaperCell, money: boolean, currency: string, locale?: string): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    if (money) return formatMoney(value, currency, locale)
    return value.toLocaleString(locale, { maximumFractionDigits: 2 })
  }
  return value
}

function DrillValue<T>({
  target,
  onDrill,
  children,
}: {
  target: T
  onDrill?: (target: T) => void
  children: React.ReactNode
}) {
  if (!onDrill) return children
  return <button type="button" onClick={() => onDrill(target)} className="font-inherit text-inherit hover:text-primary hover:underline">{children}</button>
}

/**
 * The shared on-screen renderer for the unified report shape. Its paper header,
 * summary band, document table rules, totals, currency treatment, and per-cell
 * drill behavior are the same surface used by both builders and result pages.
 */
export function PaperView<TDrillTarget>({
  organization,
  data,
  emptyLabel = 'No data.',
  currency = '',
  locale,
  onDrill,
  renderLink,
}: {
  organization: string
  data: ReportPaperData<TDrillTarget>
  emptyLabel?: string
  currency?: string
  locale?: string
  onDrill?: (target: TDrillTarget) => void
  renderLink?: (href: string, content: React.ReactNode) => React.ReactNode
}) {
  const wide = data.groups.some((group) => group.columns.length > 5)
  const summary = reportPaperSummary(data)
  return <ReportPaper
    organization={organization}
    title={data.title}
    periodPhrase={data.periodPhrase}
    note={data.note}
    wide={wide}
    layout={data.layout}
  >
    {summary.length ? <div className="mb-6 grid grid-flow-col auto-cols-fr divide-x divide-border border-y border-border py-3">
      {summary.map((item, index) => {
        const target = item.drill ?? (isNumericCell(item.value) ? data.defaultDrillTarget : undefined)
        const value = formatCell(item.value, false, currency, locale)
        return <div key={item.key ?? `${item.label}-${index}`} className="min-w-0 px-3 text-center">
          <div className="truncate text-xs text-fg-muted">{item.label}</div>
          <div className="truncate font-semibold tabular-nums">{target !== undefined ? <DrillValue target={target} onDrill={onDrill}>{value}</DrillValue> : value}</div>
        </div>
      })}
    </div> : null}
    <div className="space-y-7">
      {data.groups.map((group, groupIndex) => {
        const showTitle = group.title && (data.groups.length > 1 || Boolean(group.subtitle))
        const alignOf = (columnIndex: number, cell: ReportPaperCell): 'left' | 'right' | 'center' => group.align?.[columnIndex] ?? (isNumericCell(cell) ? 'right' : 'left')
        return <section key={`${group.title ?? 'group'}-${groupIndex}`} className="space-y-1.5">
          {showTitle ? <div className="flex items-baseline gap-2">
            <h3 className="pt-2 text-xs font-semibold tracking-wide uppercase">{group.title}</h3>
            {group.subtitle ? <span className="text-xs text-fg-muted">{group.subtitle}</span> : null}
          </div> : null}
          {group.isEmpty || group.rows.length === 0 ? <p className="py-6 text-center text-sm text-fg-subtle italic">{emptyLabel}</p> : <ReportTable>
            <ReportTableHeader><ReportTableRow>{group.columns.map((column, columnIndex) => <ReportTableHead
              key={`${column}-${columnIndex}`}
              className={(group.align?.[columnIndex] ?? (columnIndex === 0 ? 'left' : 'right')) === 'right' ? 'text-right' : (group.align?.[columnIndex] === 'center' ? 'text-center' : 'text-left')}
            >{column}</ReportTableHead>)}</ReportTableRow></ReportTableHeader>
            <ReportTableBody>{group.rows.map((row, rowIndex) => {
              const total = group.totalRowIndex === rowIndex
              return <ReportTableRow key={rowIndex} className={cn(total && reportTotalRowClass, total && 'font-semibold')}>
                {row.map((cell, columnIndex) => {
                  const align = alignOf(columnIndex, cell)
                  const money = Boolean(group.money?.[columnIndex])
                  const negative = typeof cell === 'number' && cell < 0
                  const href = group.links?.[rowIndex]?.[columnIndex]
                  const target = group.drills?.[rowIndex]?.[columnIndex] ?? (isNumericCell(cell) ? data.defaultDrillTarget : undefined)
                  const content = formatCell(cell, money, currency, locale)
                  return <ReportTableCell key={columnIndex} className={cn(align === 'right' && 'text-right tabular-nums', align === 'center' && 'text-center', negative && 'text-danger')}>
                    {target !== undefined ? <DrillValue target={target} onDrill={onDrill}>{content}</DrillValue> : href ? (renderLink?.(href, content) ?? <a href={href} className="hover:text-primary hover:underline">{content}</a>) : content}
                  </ReportTableCell>
                })}
              </ReportTableRow>
            })}</ReportTableBody>
          </ReportTable>}
        </section>
      })}
    </div>
  </ReportPaper>
}
