import type { CSSProperties, ReactNode } from 'react'
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
  title,
  periodPhrase,
  note,
  wide = false,
  layout,
  children,
  className,
}: {
  organization: string
  title: string
  periodPhrase?: string
  note?: string
  wide?: boolean
  layout?: Partial<ReportLayout>
  children: ReactNode
  className?: string
}) {
  const resolved = resolveReportLayout(layout)
  const paperStyle = {
    '--report-paper-margin': `${resolved.marginMm}mm`,
  } as CSSProperties
  return <article
    data-report-paper
    data-paper-size={resolved.paperSize}
    data-paper-orientation={resolved.orientation}
    data-paper-density={resolved.density}
    style={paperStyle}
    className={cn(
      'mx-auto w-full rounded-lg border border-border bg-surface p-[var(--report-paper-margin)] text-fg shadow-sm print:border-0 print:p-0 print:shadow-none',
      resolved.density === 'compact' && 'text-[13px]',
      wide || resolved.orientation === 'landscape' ? (resolved.paperSize === 'legal' ? PAPER_WIDTH.legal : 'max-w-none') : PAPER_WIDTH[resolved.paperSize],
      className,
    )}
  >
    <header className="mb-6 space-y-0.5 text-center">
      {organization ? <div className="text-base font-semibold">{organization}</div> : null}
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {periodPhrase ? <div className="text-sm text-fg-muted">{periodPhrase}</div> : null}
      {note ? <div className="text-xs text-fg-subtle italic">{note}</div> : null}
    </header>
    {children}
  </article>
}
