'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@appkit/ui'

export type ReportScale = 'actual' | 'thousands' | 'millions'

export type StatementMatrixColumn = {
  key: string
  label: string
  group?: string
  /** `variance_pct` is the production statement-engine value. `percentage`
   * remains accepted for application-authored catalogues. */
  kind?: 'amount' | 'number' | 'percentage' | 'variance_pct'
  [metadata: string]: unknown
}

export type StatementMatrixLine = {
  key?: string
  kind: 'section' | 'account' | 'subtotal' | 'total'
  label: string
  number?: string
  depth: number
  emphasis?: boolean
  values?: (number | undefined)[]
  /** Application-owned record identity and drill metadata. */
  accountId?: string
  drillTypes?: string[]
  [metadata: string]: unknown
}

export type StatementMatrixView = {
  columns: StatementMatrixColumn[]
  lines: StatementMatrixLine[]
  mode?: string
}

export type StatementSectionVisibility = 'expand' | 'collapse'

export type StatementMatrixDrillContext = {
  line: StatementMatrixLine
  column: StatementMatrixColumn
  value: number
  lineIndex: number
  columnIndex: number
  view: StatementMatrixView
}

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

function scaleDivisor(scale: ReportScale): number {
  if (scale === 'millions') return 1_000_000
  if (scale === 'thousands') return 1_000
  return 1
}

function defaultFormatStatementCell(
  value: number,
  column: StatementMatrixColumn,
  scale: ReportScale,
  currency: string,
  locale?: string,
): string {
  if (column.kind === 'variance_pct' || column.kind === 'percentage') {
    const normalized = column.kind === 'variance_pct' ? value / 100 : value
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(normalized)
  }

  const scaled = value / scaleDivisor(scale)
  const digits = scale === 'actual' ? 2 : 0
  if (Math.abs(scaled) < (digits === 0 ? 0.5 : 0.005)) return '–'
  if (column.kind === 'amount' && /^[A-Z]{3}$/.test(currency)) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencySign: 'accounting',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(scaled)
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(scaled)
}

/**
 * The complete production statement surface: grouped column headings,
 * collapsible section/account hierarchies, scaling, accounting currency,
 * variance percentages, account links, total rules, and per-cell drill-through.
 * Domain-specific routes and drill target construction stay application-owned.
 */
export function StatementMatrixTable<TDrillTarget>({
  view,
  scale = 'actual',
  currency = '',
  locale,
  visibility,
  visibilityRevision,
  drillTarget,
  onDrill,
  onOpenRow,
  renderRowLink,
  formatValue,
  isNegative = (value) => value < 0,
  labels,
}: {
  view: StatementMatrixView
  scale?: ReportScale
  currency?: string
  locale?: string
  /** Set by a toolbar's expand/collapse-all action. */
  visibility?: StatementSectionVisibility
  /** Increment when the same visibility command should run again. */
  visibilityRevision?: number
  drillTarget?: (context: StatementMatrixDrillContext) => TDrillTarget | null | undefined
  onDrill?: (target: TDrillTarget) => void
  onOpenRow?: (line: StatementMatrixLine) => void
  renderRowLink?: (line: StatementMatrixLine, content: React.ReactNode) => React.ReactNode
  formatValue?: (context: StatementMatrixDrillContext & { scale: ReportScale; currency: string; locale?: string }) => string
  isNegative?: (value: number, column: StatementMatrixColumn) => boolean
  labels?: { expandSection?: (section: string) => string; collapseSection?: (section: string) => string }
}) {
  const columns = view.columns
  const lines = view.lines

  // Consecutive columns with the same group render beneath one merged heading.
  const spans: { group: string; span: number }[] = []
  const hasGroups = columns.some((column) => column.group)
  if (hasGroups) {
    for (const column of columns) {
      const last = spans.at(-1)
      if (last && last.group === (column.group ?? '')) last.span++
      else spans.push({ group: column.group ?? '', span: 1 })
    }
  }
  const groupStart = new Set<number>()
  if (hasGroups) {
    let index = 0
    for (const span of spans) {
      if (index > 0) groupStart.add(index)
      index += span.span
    }
  }

  const ranges = React.useMemo(() => {
    const map = new Map<number, number>()
    lines.forEach((_, index) => {
      const end = descendantEnd(lines, index)
      if (end > index) map.set(index, end)
    })
    return map
  }, [lines])
  const [collapsed, setCollapsed] = React.useState<Set<number>>(new Set())
  React.useEffect(() => {
    if (visibility) setCollapsed(visibility === 'collapse' ? new Set(ranges.keys()) : new Set())
  }, [ranges, visibility, visibilityRevision])
  const hidden = React.useMemo(() => {
    const result = new Set<number>()
    for (const index of collapsed) {
      const end = ranges.get(index)
      if (end !== undefined) {
        for (let cursor = index + 1; cursor <= end; cursor++) result.add(cursor)
      }
    }
    return result
  }, [collapsed, ranges])
  const toggle = (index: number) => setCollapsed((current) => {
    const next = new Set(current)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    return next
  })

  return <div className="app-scroll overflow-x-auto">
    <table className="w-full text-sm tabular-nums">
      <thead>
        {hasGroups ? <tr>
          <th className="min-w-64" />
          {spans.map((span, index) => <th key={`${span.group}-${index}`} colSpan={span.span} className="border-b border-border px-4 pt-1 pb-1 text-center text-xs font-semibold tracking-wide text-fg-muted uppercase">{span.group}</th>)}
        </tr> : null}
        <tr className="border-b border-border-strong">
          <th className="min-w-64 py-2 pr-4 text-left font-semibold text-fg-muted" />
          {columns.map((column, index) => <th key={column.key} className={cn('py-2 pl-4 text-right font-semibold whitespace-nowrap', column.kind === 'amount' ? 'text-fg-muted' : 'text-fg-subtle', groupStart.has(index) && 'border-l border-border')}>{column.label}</th>)}
        </tr>
      </thead>
      <tbody>{lines.map((line, lineIndex) => {
        if (hidden.has(lineIndex)) return null
        const canToggle = ranges.has(lineIndex)
        const isCollapsed = collapsed.has(lineIndex)
        const chevron = canToggle ? <button
          type="button"
          onClick={() => toggle(lineIndex)}
          aria-label={isCollapsed ? labels?.expandSection?.(line.label) ?? `Expand ${line.label}` : labels?.collapseSection?.(line.label) ?? `Collapse ${line.label}`}
          className="mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded text-fg-subtle hover:bg-surface-hover hover:text-fg"
        >{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button> : <span className="mr-0.5 inline-block size-4 shrink-0" />

        if (line.kind === 'section') return <tr key={line.key ?? lineIndex}>
          <td colSpan={columns.length + 1} className="pt-4 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase"><span className="inline-flex items-center">{chevron}{line.label}</span></td>
        </tr>

        const subtotal = line.kind === 'subtotal'
        const total = line.kind === 'total'
        const weight = total || line.emphasis ? 'font-semibold text-fg' : subtotal ? 'font-medium' : ''
        const rowContent = <>{line.number ? <span className="mr-1.5 font-mono text-xs text-fg-subtle">{line.number}</span> : null}{line.label}</>
        return <tr key={line.key ?? lineIndex} className={cn((subtotal || total) && '[&>td]:border-t [&>td]:border-border-strong', total && '[&>td]:border-b-[3px] [&>td]:border-double [&>td]:border-border-strong')}>
          <td className={cn('py-1 pr-4', weight, line.depth === 1 && 'pl-6', line.depth === 2 && 'pl-10', line.depth >= 3 && 'pl-14')}>
            <span className="inline-flex items-baseline">{line.kind === 'account' ? chevron : null}{line.kind === 'account' && renderRowLink ? renderRowLink(line, rowContent) : line.kind === 'account' && onOpenRow ? <button type="button" onClick={() => onOpenRow(line)} className="hover:text-primary hover:underline">{rowContent}</button> : rowContent}</span>
          </td>
          {columns.map((column, columnIndex) => {
            const value = line.values?.[columnIndex]
            if (value === undefined) return <td key={column.key} className={cn('py-1 pl-4 text-right whitespace-nowrap', weight, groupStart.has(columnIndex) && 'border-l border-border-subtle')} />
            const context = { line, column, value, lineIndex, columnIndex, view }
            const target = drillTarget?.(context)
            const content = formatValue?.({ ...context, scale, currency, locale }) ?? defaultFormatStatementCell(value, column, scale, currency, locale)
            return <td key={column.key} className={cn('py-1 pl-4 text-right whitespace-nowrap', weight, isNegative(value, column) && 'text-danger', groupStart.has(columnIndex) && 'border-l border-border-subtle')}>
              {target != null && onDrill ? <button type="button" onClick={() => onDrill(target)} className="hover:text-primary hover:underline">{content}</button> : content}
            </td>
          })}
        </tr>
      })}</tbody>
    </table>
  </div>
}
