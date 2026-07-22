import type { ReactNode } from 'react'
import { cn } from '@appkit/ui'
import { resolveReportLayout, type ReportLayout } from './types'

const PAPER_WIDTH: Record<ReportLayout['paperSize'], string> = {
  letter: 'max-w-5xl',
  a4: 'max-w-[62rem]',
  legal: 'max-w-[78rem]',
}

/** The shared in-app paper surface used by report previews and result pages. */
export function ReportPaper({
  organization,
  company,
  title,
  periodPhrase,
  note,
  wide = false,
  layout,
  children,
  className,
}: {
  /** Application-neutral organization name. */
  organization?: string
  /** Source-compatible alias retained for a zero-rewrite report-view cutover. */
  company?: string
  title: string
  periodPhrase?: string
  note?: string
  wide?: boolean
  layout?: Partial<ReportLayout>
  children: ReactNode
  className?: string
}) {
  const resolved = resolveReportLayout(layout)
  const organizationName = organization ?? company ?? ''
  return <article
    data-report-paper
    data-paper-size={resolved.paperSize}
    data-paper-orientation={resolved.orientation}
    data-paper-density={resolved.density}
    className={cn(
      'mx-auto w-full rounded-lg border border-border bg-surface text-fg shadow-sm print:border-0 print:shadow-none',
      resolved.density === 'compact' ? 'px-5 py-6 text-[13px] sm:px-8' : 'px-6 py-8 sm:px-10',
      wide || resolved.orientation === 'landscape' ? (resolved.paperSize === 'legal' ? PAPER_WIDTH.legal : 'max-w-none') : PAPER_WIDTH[resolved.paperSize],
      className,
    )}
  >
    <header className="mb-6 space-y-0.5 text-center">
      {organizationName ? <div className="text-base font-semibold">{organizationName}</div> : null}
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {periodPhrase ? <div className="text-sm text-fg-muted">{periodPhrase}</div> : null}
      {note ? <div className="text-xs text-fg-subtle italic">{note}</div> : null}
    </header>
    {children}
  </article>
}
