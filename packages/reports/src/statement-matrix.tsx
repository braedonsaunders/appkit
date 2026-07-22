'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@appkit/ui'

export type StatementMatrixColumn = {
  key: string
  label: string
  group?: string
  kind?: 'amount' | 'number' | 'percentage'
}

export type StatementMatrixLine = {
  key: string
  kind: 'section' | 'account' | 'subtotal' | 'total'
  label: string
  number?: string
  depth: number
  emphasis?: boolean
  values?: (number | undefined)[]
}

export type StatementMatrixView = { columns: StatementMatrixColumn[]; lines: StatementMatrixLine[] }
export type StatementSectionVisibility = 'expand' | 'collapse'

function descendantEnd(lines: StatementMatrixLine[], index: number): number {
  const row = lines[index]
  if (!row) return index
  let cursor = index + 1
  if (row.kind === 'section') {
    while (cursor < lines.length && lines[cursor]?.kind === 'account') cursor++
    return cursor - 1
  }
  if (row.kind === 'account') {
    while (cursor < lines.length && lines[cursor]?.kind === 'account' && (lines[cursor]?.depth ?? 0) > row.depth) cursor++
    return cursor - 1
  }
  return index
}

function formatStatementCell(value: number, kind: StatementMatrixColumn['kind'], currency: string, locale?: string): string {
  if (kind === 'percentage') return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value)
  if (kind === 'amount' && /^[A-Z]{3}$/.test(currency)) return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
}

/** Collapsible, grouped, drillable statement table extracted from the production report viewer. */
export function StatementMatrixTable<TDrillTarget>({
  view,
  currency = '',
  locale,
  visibility,
  drillTarget,
  onDrill,
  onOpenRow,
}: {
  view: StatementMatrixView
  currency?: string
  locale?: string
  visibility?: StatementSectionVisibility
  drillTarget?: (line: StatementMatrixLine, column: StatementMatrixColumn, value: number) => TDrillTarget | null | undefined
  onDrill?: (target: TDrillTarget) => void
  onOpenRow?: (line: StatementMatrixLine) => void
}) {
  const columns = view.columns
  const lines = view.lines
  const spans: { group: string; span: number }[] = []
  const hasGroups = columns.some((column) => column.group)
  if (hasGroups) for (const column of columns) {
    const last = spans.at(-1)
    if (last && last.group === (column.group ?? '')) last.span++
    else spans.push({ group: column.group ?? '', span: 1 })
  }
  const groupStart = new Set<number>()
  if (hasGroups) { let index = 0; for (const span of spans) { if (index > 0) groupStart.add(index); index += span.span } }
  const ranges = React.useMemo(() => {
    const map = new Map<number, number>()
    lines.forEach((_, index) => { const end = descendantEnd(lines, index); if (end > index) map.set(index, end) })
    return map
  }, [lines])
  const [collapsed, setCollapsed] = React.useState<Set<number>>(new Set())
  React.useEffect(() => { if (visibility) setCollapsed(visibility === 'collapse' ? new Set(ranges.keys()) : new Set()) }, [ranges, visibility])
  const hidden = React.useMemo(() => {
    const result = new Set<number>()
    for (const index of collapsed) { const end = ranges.get(index); if (end !== undefined) for (let cursor = index + 1; cursor <= end; cursor++) result.add(cursor) }
    return result
  }, [collapsed, ranges])
  const toggle = (index: number) => setCollapsed((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next })

  return <div className="app-scroll overflow-x-auto"><table className="w-full text-sm tabular-nums"><thead>
    {hasGroups ? <tr><th className="min-w-64" />{spans.map((span, index) => <th key={`${span.group}-${index}`} colSpan={span.span} className="border-b border-border px-4 pt-1 pb-1 text-center text-xs font-semibold tracking-wide text-fg-muted uppercase">{span.group}</th>)}</tr> : null}
    <tr className="border-b border-border-strong"><th className="min-w-64 py-2 pr-4 text-left font-semibold text-fg-muted" />{columns.map((column, index) => <th key={column.key} className={cn('py-2 pl-4 text-right font-semibold whitespace-nowrap', column.kind === 'amount' ? 'text-fg' : 'text-fg-muted', groupStart.has(index) && 'border-l border-border')}>{column.label}</th>)}</tr>
  </thead><tbody>{lines.map((line, index) => {
    if (hidden.has(index)) return null
    const canToggle = ranges.has(index)
    const isCollapsed = collapsed.has(index)
    const chevron = canToggle ? <button type="button" onClick={() => toggle(index)} aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${line.label}`} className="mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded text-fg-subtle hover:bg-surface-hover hover:text-fg">{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button> : <span className="mr-0.5 inline-block size-4 shrink-0" />
    if (line.kind === 'section') return <tr key={line.key}><td colSpan={columns.length + 1} className="pt-4 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase"><span className="inline-flex items-center">{chevron}{line.label}</span></td></tr>
    const subtotal = line.kind === 'subtotal'
    const total = line.kind === 'total'
    const weight = total || line.emphasis ? 'font-semibold text-fg' : subtotal ? 'font-medium' : ''
    return <tr key={line.key} className={cn((subtotal || total) && '[&>td]:border-t [&>td]:border-border-strong', total && '[&>td]:border-b-[3px] [&>td]:border-double [&>td]:border-border-strong')}>
      <td className={cn('py-1 pr-4', weight, line.depth === 1 && 'pl-6', line.depth === 2 && 'pl-10', line.depth >= 3 && 'pl-14')}><span className="inline-flex items-baseline">{line.kind === 'account' ? chevron : null}{line.kind === 'account' && onOpenRow ? <button type="button" onClick={() => onOpenRow(line)} className="hover:text-primary hover:underline">{line.number ? <span className="mr-1.5 font-mono text-xs text-fg-subtle">{line.number}</span> : null}{line.label}</button> : <>{line.number ? <span className="mr-1.5 font-mono text-xs text-fg-subtle">{line.number}</span> : null}{line.label}</>}</span></td>
      {columns.map((column, columnIndex) => {
        const value = line.values?.[columnIndex]
        const target = value === undefined ? null : drillTarget?.(line, column, value)
        const content = value === undefined ? '' : formatStatementCell(value, column.kind, currency, locale)
        return <td key={column.key} className={cn('py-1 pl-4 text-right whitespace-nowrap', weight, value !== undefined && value < 0 && 'text-danger', groupStart.has(columnIndex) && 'border-l border-border-subtle')}>{target != null && onDrill ? <button type="button" onClick={() => onDrill(target)} className="hover:text-primary hover:underline">{content}</button> : content}</td>
      })}
    </tr>
  })}</tbody></table></div>
}
